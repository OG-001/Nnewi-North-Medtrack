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

/** Dexie table names that participate in sync, keyed by wire `entity_type`. */
const TABLES: Record<string, string> = {
  patients: "patients",
  patientLinks: "patientLinks",
  encounters: "encounters",
  referrals: "referrals",
  pregnancies: "pregnancies",
  ancScheduleItems: "ancScheduleItems",
  ancVisits: "ancVisits",
  deliveries: "deliveries",
  immunizationDoses: "immunizationDoses",
  queueEntries: "queueEntries",
  smsMessages: "smsMessages",
  monthlyReports: "monthlyReports",
  auditEvents: "auditEvents",
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

/** Apply one hub change to the local store. Hub rows win over local copies. */
async function applyChange(change: SyncChange): Promise<void> {
  const tableName = TABLES[change.entity_type];
  if (!tableName || !change.payload) return;
  const table = db.table(tableName);

  if (change.op === "delete") {
    const existing = await table.get(change.entity_id);
    if (existing) {
      await table.put({ ...existing, ...change.payload, deleted_at: new Date().toISOString() });
    }
    return;
  }
  await table.put({ ...change.payload, id: change.entity_id });
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
  for (const tableName of Object.values(TABLES)) {
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
