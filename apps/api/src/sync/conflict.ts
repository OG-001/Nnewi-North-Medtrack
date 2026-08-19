/**
 * Conflict resolution — the per-entity-class rules from offline-sync-design §5.
 *
 * Pure functions, no I/O: this is the piece that must never be wrong, so it is
 * kept independently testable. Ordering is decided by `rev`, never by device
 * wall-clock (§8 clock skew).
 */
import {
  IDENTITY_CRITICAL_FIELDS,
  STATE_PRIORITY,
  entityClassOf,
  type EntityClass,
} from "@phc/shared";

export type Payload = Record<string, unknown>;

export type Resolution =
  | { kind: "apply"; payload: Payload }
  | { kind: "merged"; payload: Payload; mergedFields: string[] }
  | { kind: "escalate"; payload: Payload; fields: string[] }
  | { kind: "keep_server" }
  | { kind: "reject"; reason: string };

/** Fields that are hub-owned bookkeeping and never taken from a client push. */
const SERVER_OWNED = new Set(["rev", "server_seq", "needs_review"]);

function stripServerOwned(payload: Payload): Payload {
  const out: Payload = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!SERVER_OWNED.has(k)) out[k] = v;
  }
  return out;
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/**
 * Structural equality for clinical field values.
 *
 * Key order is deliberately ignored: payloads round-trip through Postgres
 * JSONB, which does not preserve it, so a stringify comparison would report a
 * replayed push as a change and bump the rev forever.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isBlank(a) && isBlank(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    // Blank-vs-absent counts as equal, so compare the union of the key sets.
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      if (!sameValue(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}

/**
 * Advance-only state merge: the further-along state wins so two stations
 * converge forward instead of bouncing back (§5 worked example 2).
 */
export function mergeState(
  entityType: string,
  serverState: unknown,
  clientState: unknown,
): unknown {
  const ladder = STATE_PRIORITY[entityType];
  if (!ladder) return clientState;
  const si = ladder.indexOf(String(serverState));
  const ci = ladder.indexOf(String(clientState));
  if (si === -1) return clientState;
  if (ci === -1) return serverState;
  return ci >= si ? clientState : serverState;
}

/**
 * Field-level last-writer-wins for demographics, merging non-overlapping edits.
 *
 * The client only wins a field it actually changed relative to `base` — a field
 * it left untouched keeps the server's newer value. That is what makes two
 * devices correcting *different* fields merge cleanly instead of clobbering.
 */
export function mergeDemographics(
  entityType: string,
  server: Payload,
  client: Payload,
  base: Payload | null,
): Resolution {
  const identityFields = IDENTITY_CRITICAL_FIELDS[entityType] ?? [];
  const merged: Payload = { ...server };
  const mergedFields: string[] = [];
  const contradictions: string[] = [];

  for (const [field, clientValue] of Object.entries(client)) {
    if (SERVER_OWNED.has(field)) continue;
    const serverValue = server[field];
    if (sameValue(serverValue, clientValue)) continue;

    // Did the client actually change this field, or is it echoing stale state?
    const baseValue = base ? base[field] : undefined;
    const clientChanged = base ? !sameValue(baseValue, clientValue) : true;
    const serverChanged = base ? !sameValue(baseValue, serverValue) : true;

    if (!clientChanged) continue; // client never touched it — server keeps its value

    if (clientChanged && serverChanged && identityFields.includes(field)) {
      // Two devices set an identity-critical field to different values.
      contradictions.push(field);
      continue;
    }

    merged[field] = clientValue;
    mergedFields.push(field);
  }

  if (contradictions.length > 0) {
    // Clinical work continues on the latest, but an admin must reconcile.
    for (const f of contradictions) merged[f] = client[f];
    return { kind: "escalate", payload: merged, fields: contradictions };
  }
  return { kind: "merged", payload: merged, mergedFields };
}

export interface ResolveInput {
  entityType: string;
  op: "upsert" | "delete";
  /** Current hub row, or null if the entity is new here. */
  server: { payload: Payload; rev: number; deletedAt: Date | null } | null;
  clientPayload: Payload | null;
  baseRev: number;
  /** Hub payload at `base_rev`, when recoverable from the change log. */
  basePayload: Payload | null;
}

/**
 * Decide what the hub does with one pushed change.
 *
 * Returns `keep_server` for a no-op (idempotent replay), `apply` for a clean
 * write, `merged`/`escalate` for a resolved race, or `reject`.
 */
export function resolveChange(input: ResolveInput): Resolution {
  const { entityType, op, server, baseRev } = input;
  const cls: EntityClass | null = entityClassOf(entityType);

  if (!cls) return { kind: "reject", reason: `unknown entity_type "${entityType}"` };

  // Config is hub-authoritative: client edits go through the admin API, online.
  if (cls === "config") {
    return { kind: "reject", reason: "config is hub-authoritative; use the admin API" };
  }

  const clientPayload = input.clientPayload ? stripServerOwned(input.clientPayload) : {};

  // A soft delete is hub-mediated and deterministic: it wins.
  if (op === "delete") {
    return { kind: "apply", payload: { ...(server?.payload ?? clientPayload) } };
  }
  if (server?.deletedAt) {
    // Hub soft-deleted while the device was offline; the delete stands and the
    // local edit is preserved as history by the change-log entry.
    return { kind: "keep_server" };
  }

  // New to the hub — nothing to conflict with.
  if (!server) return { kind: "apply", payload: clientPayload };

  // Idempotent replay (§6 example 5). A re-send after a dropped response still
  // carries the *original* base_rev, so revs cannot identify it — compare the
  // content instead. Identical content is a no-op either way: no rev bump, and
  // no second change-log row for clients to pull back.
  if (sameValue(stripServerOwned(server.payload), clientPayload)) {
    return { kind: "keep_server" };
  }

  // No concurrent server change — a clean fast-forward.
  if (baseRev >= server.rev) {
    return { kind: "apply", payload: clientPayload };
  }

  // --- Concurrent change detected (server.rev > base_rev) ---
  switch (cls) {
    case "append_only":
      // Each clinical event is its own UUID row, so a "conflict" here can only
      // be a re-send. Never overwrite a recorded event.
      return { kind: "keep_server" };

    case "workflow": {
      const merged: Payload = { ...server.payload, ...clientPayload };
      merged.status = mergeState(entityType, server.payload.status, clientPayload.status);
      return { kind: "merged", payload: merged, mergedFields: ["status"] };
    }

    case "demographics":
      return mergeDemographics(entityType, server.payload, clientPayload, input.basePayload);

    case "structural":
      // Merges/soft-deletes are hub-mediated and deterministic.
      return { kind: "keep_server" };

    default:
      return { kind: "reject", reason: `no rule for class ${cls}` };
  }
}
