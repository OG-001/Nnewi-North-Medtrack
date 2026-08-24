/**
 * Hub reporting endpoints: the locked report, its adjustments, and the LGA
 * rollup.
 *
 * The figures a facility reads offline are computed on the device from its own
 * rows. What only the hub can provide is the *submitted* report: the one an
 * officer-in-charge locked, which is what goes upward and what the LGA rolls up.
 */
import type { ReportFigure } from "@phc/shared";
import { apiFetch, hasHubSession, API_BASE_URL } from "./api";

export interface HubReport {
  id: string;
  facilityId: string;
  year: number;
  month: number;
  figures: ReportFigure[];
  status: "draft" | "locked";
  generatedAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  adjustments?: HubAdjustment[];
}

export interface HubAdjustment {
  id: string;
  figureKey: string;
  fromValue: number;
  toValue: number;
  reason: string;
  createdAt: string;
}

export interface HubRollup {
  year: number;
  month: number;
  figures: ReportFigure[];
  facilitiesIncluded: number;
  facilitiesDraft: number;
  facilitiesTotal: number;
}

export function reportsAvailable(): boolean {
  return hasHubSession();
}

export function generateReport(facilityId: string, year: number, month: number) {
  return apiFetch<HubReport>(
    `/reports/monthly/generate?facility=${encodeURIComponent(facilityId)}&year=${year}&month=${month}`,
  );
}

export function lockReport(reportId: string) {
  return apiFetch<HubReport>(`/reports/monthly/${reportId}/lock`, { method: "POST" });
}

export function addAdjustment(
  reportId: string,
  input: { figureKey: string; toValue: number; reason: string },
) {
  return apiFetch<HubAdjustment>(`/reports/monthly/${reportId}/adjustments`, {
    method: "POST",
    body: JSON.stringify({
      figure_key: input.figureKey,
      to_value: input.toValue,
      reason: input.reason,
    }),
  });
}

export function drillDown(reportId: string, figureKey: string) {
  return apiFetch<{
    figure: ReportFigure;
    derivedFrom?: string[];
    rows: { id: string; entityType: string; payload: Record<string, unknown> }[];
  }>(`/reports/monthly/${reportId}/figures/${encodeURIComponent(figureKey)}`);
}

export function lgaRollup(year: number, month: number) {
  return apiFetch<HubRollup>(`/reports/lga?year=${year}&month=${month}`);
}

/** The export URL, for opening in a new tab rather than fetching into memory. */
export function exportUrl(reportId: string, format: "csv" | "dhis2"): string {
  return `${API_BASE_URL}/reports/monthly/${reportId}/export?format=${format}`;
}
