/**
 * The admin conflict queue.
 *
 * A conflict lands here only when two devices set an identity-critical field to
 * different values, for example two different dates of birth for one patient.
 * The rules resolve everything else automatically; this is the escalation path
 * that exists so a contradiction is never silently dropped.
 */
import { apiFetch } from "./api";

export interface ConflictEntry {
  id: string;
  entityType: string;
  entityId: string;
  facilityId: string;
  fields: string[];
  serverPayload: Record<string, unknown>;
  clientPayload: Record<string, unknown>;
  deviceId: string | null;
  status: string;
  createdAt: string;
}

export function listConflicts(status = "open") {
  return apiFetch<ConflictEntry[]>(`/admin/conflicts?status=${status}`);
}

export function resolveConflict(id: string, choice: "server" | "client") {
  return apiFetch<{ id: string; status: string }>(`/admin/conflicts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ choice }),
  });
}
