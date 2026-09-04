/**
 * The client half of the sync protocol (offline-sync-design §3).
 *
 * One cycle is **push before pull**, repeated until both directions are empty,
 * so the device's own work reaches the hub before it converges on others'.
 * Every step is resumable and idempotent: in-flight entries revert to pending,
 * the watermark advances only across changes actually applied, and a replayed
 * push is a no-op at the hub.
 */
import {
  SYNC_PAGE_LIMIT,
  SYNC_PUSH_MAX_BATCH,
  type ChangesResponse,
  type EnrollResponse,
  type PushChange,
  type PushResponse,
  type SyncChange,
} from "@phc/shared";
import { db } from "../db/db";
import type { OutboxEntry, SyncMeta } from "../db/types";
import { apiFetch, hasHubSession } from "./api";
import { getDeviceId } from "./device";

const META_KEY = "meta";

/**
 * Wire `entity_type` to the Dexie table that stores it. The keys must match
 * `ENTITY_TYPE_BY_TABLE` in ../db/repository.ts, which is what the outbox
 * writes; a mismatch here means the hub rejects every change of that type.
 */
export const TABLE_BY_ENTITY_TYPE: Record<string, string> = {
  patient: "patients",
  patient_link: "patientLinks",
  encounter: "encounters",
  referral: "referrals",
  pregnancy: "pregnancies",
  anc_schedule_item: "ancScheduleItems",
  anc_visit: "ancVisits",
  delivery: "deliveries",
  immunization_dose: "immunizationDoses",
  queue_entry: "queueEntries",
  sms_message: "smsMessages",
  monthly_report: "monthlyReports",
  audit_event: "auditEvents",
};

export async function getMeta(): Promise<SyncMeta> {
  const existing = await db.syncMeta.get(META_KEY);
  if (existing) return existing;
  const fresh: SyncMeta = {
    key: META_KEY,
    server_seq_watermark: 0,
    last_sync_at: null,
    device_id: getDeviceId(),
  };
  await db.syncMeta.put(fresh);
  return fresh;
}

/** Exported for tests: monotonicity here is what stops changes being skipped. */
export async function setWatermark(seq: number) {
  const meta = await getMeta();
  // Never move the watermark backwards — an out-of-order response must not
  // cause the device to re-request or skip changes.
  if (seq > meta.server_seq_watermark) {
    await db.syncMeta.put({ ...meta, server_seq_watermark: seq });
  }
}

/** Device enrolment (§7). Returns the hub-granted facility scope. */
export async function enroll(label?: string): Promise<EnrollResponse> {
  const meta = await getMeta();
  return apiFetch<EnrollResponse>("/sync/enroll", {
    method: "POST",
    body: JSON.stringify({ device_id: meta.device_id, label }),
  });
}

/**
 * Recover entries stranded `in_flight` by a crash or a dropped response.
 * Re-sending is safe: the hub upserts by id + rev (§8).
 */
export async function recoverInFlight(): Promise<number> {
  const stranded = await db.outbox.where("status").equals("in_flight").toArray();
  await db.transaction("rw", db.outbox, async () => {
    for (const e of stranded) {
      if (e.localSeq != null) await db.outbox.update(e.localSeq, { status: "pending" });
    }
  });
  return stranded.length;
}

interface PushOutcome {
  pushed: number;
  conflicts: number;
  rejected: number;
}

/** Push one batch of pending outbox entries. Returns what the hub decided. */
async function pushBatch(): Promise<PushOutcome & { remaining: boolean }> {
  const meta = await getMeta();
  const pending = await db.outbox
    .where("status")
    .equals("pending")
    .limit(SYNC_PUSH_MAX_BATCH)
    .toArray();

  if (pending.length === 0) return { pushed: 0, conflicts: 0, rejected: 0, remaining: false };

  // Mark in-flight before the request so a crash mid-flight is recoverable.
  await db.transaction("rw", db.outbox, async () => {
    for (const e of pending) {
      if (e.localSeq != null) await db.outbox.update(e.localSeq, { status: "in_flight" });
    }
  });

  const changes: PushChange[] = pending.map((e) => ({
    entity_type: e.entity_type,
    entity_id: e.entity_id,
    op: e.op,
    rev: e.rev,
    // The rev this edit was made from; the hub uses it to detect a concurrent change.
    base_rev: Math.max(0, e.rev - 1),
    payload: (e.payload ?? null) as Record<string, unknown> | null,
    client_ts: e.created_at,
  }));

  let response: PushResponse;
  try {
    response = await apiFetch<PushResponse>("/sync/push", {
      method: "POST",
      body: JSON.stringify({ device_id: meta.device_id, changes }),
    });
  } catch (err) {
    // Nothing was acknowledged — put everything back so the next cycle retries.
    await recoverInFlight();
    throw err;
  }

  const bySeq = new Map(pending.map((e) => [`${e.entity_type}:${e.entity_id}`, e]));
  let conflicts = 0;
  let rejected = 0;

  await db.transaction("rw", db.outbox, async () => {
    for (const result of response.results) {
      const entry = bySeq.get(`${result.entity_type}:${result.entity_id}`);
      if (!entry?.localSeq) continue;
      if (result.status === "applied") {
        await db.outbox.update(entry.localSeq, { status: "acked" });
      } else if (result.status === "conflict") {
        // The hub resolved it and returned the winning payload; adopt it below.
        await db.outbox.update(entry.localSeq, { status: "acked" });
        conflicts += 1;
      } else {
        // Poison change — parked, not retried, so it cannot block the outbox (§8).
        await db.outbox.update(entry.localSeq, { status: "conflict" });
        rejected += 1;
      }
    }
  });

  // Adopt hub-resolved payloads so the device converges without waiting for pull.
  for (const result of response.results) {
    if (result.status === "conflict" && result.server_payload) {
      await applyChange({
        entity_type: result.entity_type,
        entity_id: result.entity_id,
        op: "upsert",
        rev: result.server_rev,
        payload: result.server_payload,
      });
    }
  }

  const stillPending = await db.outbox.where("status").equals("pending").count();
  return { pushed: pending.length, conflicts, rejected, remaining: stillPending > 0 };
}

/**
 * List-valued fields the UI iterates over, per entity type. A row arriving
 * without one of these crashes the screen that renders it, so they are defaulted
 * to an empty list on the way in rather than guarded at every call site.
 */
const REQUIRED_LIST_FIELDS: Record<string, string[]> = {
  patient: ["category_tags", "allergies", "chronic_conditions"],
  encounter: [],
  anc_visit: ["danger_signs"],
  pregnancy: ["risk_flags"],
};

/**
 * The columns every local row must carry for the UI to be able to render it
 * (data-model section 2). A row missing one of these is not merely incomplete:
 * screens sort and filter on them, so a single bad row can break a whole page.
 */
function withRequiredColumns(
  change: SyncChange,
  payload: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const lists: Record<string, unknown> = {};
  for (const field of REQUIRED_LIST_FIELDS[change.entity_type] ?? []) {
    lists[field] = Array.isArray(payload[field])
      ? payload[field]
      : (existing?.[field] as unknown[] | undefined) ?? [];
  }

  return {
    ...payload,
    ...lists,
    id: change.entity_id,
    facility_id: payload.facility_id ?? existing?.facility_id ?? "",
    created_at: payload.created_at ?? existing?.created_at ?? now,
    created_by: payload.created_by ?? existing?.created_by ?? "hub",
    updated_at: payload.updated_at ?? existing?.updated_at ?? now,
    updated_by: payload.updated_by ?? existing?.updated_by ?? "hub",
    rev: payload.rev ?? change.rev ?? 1,
    deleted_at: payload.deleted_at ?? null,
    origin_device_id: payload.origin_device_id ?? existing?.origin_device_id ?? "hub",
  };
}

/**
 * Apply one hub change to the local store. Hub rows win over local copies.
 *
 * Payloads are defended rather than trusted: another device on an older build,
 * or a partial row, must not be able to brick a clinic screen. A row that
 * arrives without its common columns is completed here instead of being written
 * in a shape the UI cannot handle.
 */
export async function applyChangeForTest(change: SyncChange): Promise<void> {
  return applyChange(change);
}

async function applyChange(change: SyncChange): Promise<void> {
  const tableName = TABLE_BY_ENTITY_TYPE[change.entity_type];
  if (!tableName || !change.payload) return;
  const table = db.table(tableName);
  const payload = change.payload as Record<string, unknown>;

  const existing = (await table.get(change.entity_id)) as Record<string, unknown> | undefined;

  if (change.op === "delete") {
    if (!existing) return;
    await table.put({
      ...withRequiredColumns(change, { ...existing, ...payload }, existing),
      deleted_at: new Date().toISOString(),
    });
    return;
  }

  await table.put(withRequiredColumns(change, payload, existing));
}

/** Pull one page of changes, advancing the watermark as they land (§3.1). */
async function pullPage(): Promise<{ applied: number; hasMore: boolean }> {
  const meta = await getMeta();
  const res = await apiFetch<ChangesResponse>(
    `/sync/changes?since=${meta.server_seq_watermark}&limit=${SYNC_PAGE_LIMIT}`,
    { method: "GET" },
  );

  for (const change of res.changes) {
    await applyChange(change);
    // Advance per change so an interrupted pull resumes from exactly here.
    if (change.server_seq) await setWatermark(change.server_seq);
  }
  await setWatermark(res.next_seq);
  return { applied: res.changes.length, hasMore: res.has_more };
}

export interface CycleResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  rejected: number;
}

/**
 * Run push→pull until both are drained. Bounded so a pathological loop can
 * never spin forever on a flaky link.
 */
export async function runSyncCycle(maxRounds = 10): Promise<CycleResult> {
  if (!hasHubSession()) throw new Error("No hub session");

  const total: CycleResult = { pushed: 0, pulled: 0, conflicts: 0, rejected: 0 };
  await recoverInFlight();

  for (let round = 0; round < maxRounds; round += 1) {
    const push = await pushBatch();
    total.pushed += push.pushed;
    total.conflicts += push.conflicts;
    total.rejected += push.rejected;

    const pull = await pullPage();
    total.pulled += pull.applied;

    if (!push.remaining && !pull.hasMore) break;
  }

  const meta = await getMeta();
  await db.syncMeta.put({ ...meta, last_sync_at: new Date().toISOString() });
  return total;
}

/**
 * Purge rows outside the granted scope (§7 scope change, §9 privacy). Called
 * after enrolment and on scope change; `null` scope means LGA-wide, purge nothing.
 */
export async function purgeOutOfScope(scope: string[] | null): Promise<number> {
  if (scope === null) return 0;
  let removed = 0;
  for (const tableName of Object.values(TABLE_BY_ENTITY_TYPE)) {
    const table = db.table(tableName);
    const rows = (await table.toArray()) as { id: string; facility_id?: string }[];
    const doomed = rows.filter((r) => r.facility_id && !scope.includes(r.facility_id));
    if (doomed.length) {
      await table.bulkDelete(doomed.map((r) => r.id));
      removed += doomed.length;
    }
  }
  return removed;
}

export type { OutboxEntry };
