/**
 * LGA-wide patient index and audited record access (Global Constraint 8).
 *
 * Both endpoints live at the hub: a device holds only its own facility's data,
 * so there is nothing local to search. Continuity of care across PHCs is
 * therefore an online action, which is the right trade: it is occasional, and
 * it must be audited centrally to be meaningful.
 */
import { apiFetch } from "./api";

export interface LgaIndexEntry {
  id: string;
  mrn: string;
  display_name: string;
  sex: string | null;
  year_of_birth: number | null;
  home_facility_id: string;
  home_facility_name: string;
  /** True when this record is already inside the caller's facility scope. */
  in_scope: boolean;
}

export function searchLgaIndex(query: string) {
  return apiFetch<{ query: string; results: LgaIndexEntry[] }>(
    `/patients/index?query=${encodeURIComponent(query)}`,
  );
}

/**
 * Open a record. A reason is required for another facility's patient, and the
 * hub writes the `sensitive_access` audit event before returning anything.
 */
export function openPatientRecord(patientId: string, reason: string) {
  return apiFetch<{
    patient: Record<string, unknown>;
    home_facility_id: string;
    cross_facility: boolean;
  }>(`/patients/${patientId}/access`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function sensitiveAccessLog(limit = 100) {
  return apiFetch<
    {
      id: string;
      actorUserId: string | null;
      entityId: string | null;
      facilityId: string | null;
      at: string;
      details: { reason?: string } | null;
    }[]
  >(`/patients/sensitive-access-log?limit=${limit}`);
}

// ---- Duplicate review and merge (Phase 9, Module 10) ----

export interface DuplicateCandidate {
  id: string;
  mrn: string;
  display_name: string;
  sex: string | null;
  date_of_birth: string | null;
  phone_primary: string | null;
  created_at: string;
  /** Why this record looks like the same person. */
  reasons: string[];
  /** How much history moves if this record is merged away. */
  record_counts: Record<string, number>;
}

export function patientDuplicates(patientId: string) {
  return apiFetch<DuplicateCandidate[]>(`/patients/${patientId}/duplicates`);
}

export function mergePatients(input: {
  survivingId: string;
  mergedId: string;
  reason: string;
}) {
  return apiFetch<{
    surviving_id: string;
    merged_id: string;
    repointed: Record<string, number>;
    locked_reports_to_review: { id: string; year: number; month: number }[];
  }>("/patients/merge", {
    method: "POST",
    body: JSON.stringify({
      surviving_id: input.survivingId,
      merged_id: input.mergedId,
      reason: input.reason,
    }),
  });
}

export function mergeHistory(limit = 50) {
  return apiFetch<
    {
      id: string;
      survivingId: string;
      mergedId: string;
      reason: string;
      mergedAt: string;
      details: Record<string, number>;
    }[]
  >(`/patients/merge/history?limit=${limit}`);
}
