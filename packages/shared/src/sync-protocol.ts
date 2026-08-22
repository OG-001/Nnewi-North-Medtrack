/**
 * Sync protocol contract — the wire format shared by the PWA and the NestJS hub
 * (offline-sync-design §3, api-design §4). Keeping it here means client and
 * server cannot drift: both import these types and the entity-class table.
 */

/** Entity classes drive conflict strategy (offline-sync-design §5). */
export const ENTITY_CLASSES = [
  "append_only", // clinical events — never overwritten
  "demographics", // field-level LWW + identity-critical escalation
  "workflow", // state-priority merge
  "config", // hub authoritative
  "structural", // hub-mediated (merge / soft delete)
] as const;
export type EntityClass = (typeof ENTITY_CLASSES)[number];

/**
 * Which class each synced entity belongs to.
 *
 * The keys are the **wire** `entity_type` values: snake_case singular, taken
 * from `ENTITY_TYPE_BY_TABLE` in `apps/web/src/db/repository.ts`, which is what
 * the outbox actually writes. They are deliberately not the Dexie table names.
 * A table name is a local storage detail; the entity type is the contract, and
 * it matches `docs/architecture/data-model.md`.
 */
export const ENTITY_CLASS_BY_TYPE = {
  patient: "demographics",
  patient_link: "structural",
  encounter: "append_only",
  referral: "append_only",
  pregnancy: "workflow",
  anc_schedule_item: "workflow",
  anc_visit: "append_only",
  delivery: "append_only",
  immunization_dose: "workflow",
  queue_entry: "workflow",
  sms_message: "append_only",
  monthly_report: "workflow",
  audit_event: "append_only",
  facility: "config",
  user_account: "config",
} as const satisfies Record<string, EntityClass>;

export type SyncEntityType = keyof typeof ENTITY_CLASS_BY_TYPE;

export const SYNC_ENTITY_TYPES = Object.keys(
  ENTITY_CLASS_BY_TYPE,
) as SyncEntityType[];

export function entityClassOf(entityType: string): EntityClass | null {
  return (
    ENTITY_CLASS_BY_TYPE[entityType as SyncEntityType] ?? null
  );
}

/**
 * State-priority ladders for workflow rows (offline-sync-design §5): a "more
 * advanced" state wins so two stations converge forward, never bounce back.
 */
export const STATE_PRIORITY: Record<string, string[]> = {
  queue_entry: ["waiting", "in_progress", "left_without_being_seen", "completed"],
  immunization_dose: ["due", "scheduled", "missed", "given"],
  anc_schedule_item: ["due", "scheduled", "missed", "completed"],
  pregnancy: ["active", "transferred", "delivered", "closed"],
  monthly_report: ["draft", "submitted", "locked"],
};

/**
 * Identity-critical fields. A genuine contradiction here is never auto-merged —
 * it escalates to the admin conflict queue (offline-sync-design §5 Escalation).
 */
export const IDENTITY_CRITICAL_FIELDS: Record<string, string[]> = {
  patient: ["date_of_birth", "sex", "mrn"],
};

// ---- Wire shapes ----

export type SyncOp = "upsert" | "delete";

/** A change travelling in either direction. */
export interface SyncChange {
  entity_type: string;
  entity_id: string;
  op: SyncOp;
  rev: number;
  payload: Record<string, unknown> | null;
  /** Present on hub→device changes only. */
  server_seq?: number;
}

/** A change the device pushes; `base_rev` is the rev it edited from. */
export interface PushChange extends SyncChange {
  base_rev: number;
  client_ts: string;
}

export interface PushRequest {
  device_id: string;
  changes: PushChange[];
}

export type PushStatus = "applied" | "conflict" | "rejected";

export interface PushResult {
  entity_id: string;
  entity_type: string;
  status: PushStatus;
  server_rev: number;
  /** Returned on conflict so the client can converge without a second round-trip. */
  server_payload?: Record<string, unknown> | null;
  /** Set when the hub escalated an identity-critical contradiction. */
  needs_review?: boolean;
  /** Populated on `rejected`. */
  reason?: string;
}

export interface PushResponse {
  results: PushResult[];
  /** Hub watermark after applying — lets the client skip echoing its own writes. */
  server_seq: number;
}

export interface ChangesResponse {
  changes: SyncChange[];
  next_seq: number;
  has_more: boolean;
}

export interface EnrollRequest {
  device_id: string;
  /** Human label for the admin device list, e.g. "Ward 2 tablet". */
  label?: string;
}

export interface EnrollResponse {
  device_id: string;
  /** Facility ids this device may pull. `null` means LGA-wide (all facilities). */
  scope: string[] | null;
  /** Watermark the baseline snapshot is consistent as of. */
  baseline_seq: number;
  server_time: string;
}

export interface BaselineResponse {
  changes: SyncChange[];
  cursor: string | null;
  has_more: boolean;
  /** Watermark to adopt once the whole baseline has been applied. */
  baseline_seq: number;
}

/** Uniform error envelope (api-design §3). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; issue: string }[];
    traceId: string;
  };
}

export const SYNC_PAGE_LIMIT = 500;
export const SYNC_PUSH_MAX_BATCH = 500;
