/**
 * Repository layer (offline-sync-design §2): every UI write goes through here so
 * it (a) writes the domain row, (b) appends an outbox entry, (c) bumps rev +
 * updated_at, and (d) records an audit event — all in ONE transaction so a crash
 * can never half-apply a change.
 */
import { type Table } from "dexie";
import { newId } from "@phc/shared";
import { db } from "./db";
import type { BaseRecord, OutboxEntry } from "./types";
import { getDeviceId } from "../lib/device";
import { bumpPending } from "../lib/sync";

export interface Actor {
  userId: string;
  facilityId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Build a brand-new record with the data-model §2 common columns populated. */
export function createRecord<T extends BaseRecord>(
  actor: Actor,
  data: Omit<T, keyof BaseRecord> & Partial<Pick<BaseRecord, "id" | "facility_id">>,
): T {
  const id = data.id ?? newId();
  const ts = nowIso();
  return {
    ...(data as object),
    id,
    facility_id: data.facility_id ?? actor.facilityId,
    created_at: ts,
    created_by: actor.userId,
    updated_at: ts,
    updated_by: actor.userId,
    rev: 1,
    deleted_at: null,
    origin_device_id: getDeviceId(),
  } as T;
}

const ENTITY_TYPE_BY_TABLE: Record<string, string> = {
  facilities: "facility",
  users: "user_account",
  patients: "patient",
  patientLinks: "patient_link",
  encounters: "encounter",
  referrals: "referral",
  pregnancies: "pregnancy",
  ancScheduleItems: "anc_schedule_item",
  ancVisits: "anc_visit",
  deliveries: "delivery",
  immunizationDoses: "immunization_dose",
  queueEntries: "queue_entry",
  smsMessages: "sms_message",
  monthlyReports: "monthly_report",
};

/**
 * Write-through save: persists the row, queues it in the outbox, and audits it,
 * inside a single transaction across the affected tables + outbox + auditEvents.
 */
export async function saveRecord<T extends BaseRecord>(
  table: Table<T, string>,
  record: T,
  actor: Actor,
  action: "create" | "update" | "delete",
): Promise<T> {
  const entityType = ENTITY_TYPE_BY_TABLE[table.name] ?? table.name;
  const next: T = {
    ...record,
    updated_at: nowIso(),
    updated_by: actor.userId,
    rev: action === "create" ? record.rev : record.rev + 1,
  };

  await db.transaction(
    "rw",
    table,
    db.outbox,
    db.auditEvents,
    async () => {
      await table.put(next);
      const outbox: OutboxEntry = {
        entity_type: entityType,
        entity_id: next.id,
        op: next.deleted_at ? "delete" : "upsert",
        payload: next,
        rev: next.rev,
        created_at: nowIso(),
        status: "pending",
      };
      await db.outbox.add(outbox);
      await db.auditEvents.add({
        id: newId(),
        actor_user_id: actor.userId,
        action,
        entity_type: entityType,
        entity_id: next.id,
        facility_id: next.facility_id,
        at: nowIso(),
        device_id: getDeviceId(),
      });
    },
  );

  bumpPending();
  return next;
}

/** Soft delete (no hard deletes of clinical data — governance). */
export async function softDelete<T extends BaseRecord>(
  table: Table<T, string>,
  record: T,
  actor: Actor,
): Promise<T> {
  return saveRecord(
    table,
    { ...record, deleted_at: nowIso() },
    actor,
    "delete",
  );
}

/** Convenience: record a sensitive-access audit event (no row mutation). */
export async function auditSensitiveAccess(
  actor: Actor,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await db.auditEvents.add({
    id: newId(),
    actor_user_id: actor.userId,
    action: "sensitive_access",
    entity_type: entityType,
    entity_id: entityId,
    facility_id: actor.facilityId,
    at: nowIso(),
    details,
    device_id: getDeviceId(),
  });
}
