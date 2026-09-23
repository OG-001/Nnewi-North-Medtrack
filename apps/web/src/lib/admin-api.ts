/**
 * Staff, facility and audit administration against the hub.
 *
 * These are deliberately online-only. A staff account that exists on one device
 * and nowhere else cannot sign in anywhere else, and a deactivation that only
 * updates a local row revokes nothing. Administration is occasional and belongs
 * where the accounts actually live.
 */
import type { Role } from "@phc/shared";
import { apiFetch, API_BASE_URL } from "./api";

export interface HubStaff {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  roles: Role[];
  status: "active" | "disabled" | "invited";
  last_login_at: string | null;
  facility_ids: string[];
}

export interface HubAuditEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  facilityId: string | null;
  deviceId: string | null;
  details: Record<string, unknown> | null;
  at: string;
}

export function listStaff(facilityId?: string) {
  const q = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : "";
  return apiFetch<HubStaff[]>(`/admin/staff${q}`);
}

export function createStaff(input: {
  full_name: string;
  username: string;
  pin: string;
  phone?: string;
  roles: Role[];
  facility_ids: string[];
}) {
  return apiFetch<HubStaff>("/admin/staff", { method: "POST", body: JSON.stringify(input) });
}

export function updateStaff(
  id: string,
  input: Partial<{
    full_name: string;
    phone: string;
    roles: Role[];
    facility_ids: string[];
    status: "active" | "disabled" | "invited";
  }>,
) {
  return apiFetch<HubStaff>(`/admin/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function resetStaffPin(id: string, pin: string) {
  return apiFetch<{ ok: boolean }>(`/admin/staff/${id}/reset-pin`, {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export function listAudit(params: { action?: string; limit?: number; cursor?: string } = {}) {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  return apiFetch<{ events: HubAuditEvent[]; next_cursor: string | null; has_more: boolean }>(
    `/audit?${q.toString()}`,
  );
}

export function auditActions() {
  return apiFetch<{ action: string; count: number }[]>("/audit/actions");
}

/**
 * URL for the audit CSV export. Opened in a new tab rather than fetched, so the
 * browser handles the download. The export is itself recorded in the trail.
 */
export function auditExportUrl(action?: string): string {
  const q = action ? `?action=${encodeURIComponent(action)}` : "";
  return `${API_BASE_URL}/audit/export${q}`;
}
