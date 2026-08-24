/**
 * Review and lock, the Phase 8 workflow that turns a computed month into a
 * submitted NHMIS return.
 *
 * Locking is the officer-in-charge's sign-off, and it happens at the hub
 * because the locked figures are what the LGA rolls up. Everything here needs
 * connectivity; the figures on the page itself are computed on the device and
 * stay readable offline.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "./ui";
import { useSession } from "../lib/session";
import { useSync } from "../lib/sync";
import {
  exportUrl,
  generateReport,
  lockReport,
  reportsAvailable,
  type HubReport,
} from "../lib/reports-api";

export function ReportHubPanel({ year, month }: { year: number; month: number }) {
  const { facilityId, can } = useSession();
  const sync = useSync();
  const [report, setReport] = useState<HubReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) return;
    setError(null);
    try {
      setReport(await generateReport(facilityId, year, month));
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Could not reach the sync hub");
    }
  }, [facilityId, year, month]);

  useEffect(() => {
    if (reportsAvailable() && sync.online) void load();
  }, [load, sync.online]);

  if (!reportsAvailable() || !sync.online) {
    return (
      <div className="card mt-4 p-4 text-sm">
        <h3 className="font-semibold text-slate-700">Submission</h3>
        <p className="mt-1 text-xs text-slate-500">
          The figures above are computed on this device and are accurate for its own records.
          Reviewing and locking the month for submission happens at the sync hub, which needs a
          connection.
        </p>
      </div>
    );
  }

  async function lock() {
    if (!report) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await lockReport(report.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not lock the report");
    } finally {
      setBusy(false);
    }
  }

  const locked = report?.status === "locked";

  return (
    <div className="card mt-4 p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-700">Submission</h3>
        {report && (
          <Badge tone={locked ? "green" : "amber"}>{locked ? "Locked" : "Draft"}</Badge>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {report && (
        <>
          <p className="mt-2 text-xs text-slate-500">
            {locked
              ? "These figures are frozen and included in the LGA rollup. A correction is recorded as an adjustment, so the number that was submitted stays visible."
              : "Draft figures are recomputed each time this page loads, so a late-syncing device is still counted. Locking freezes them for submission."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!locked && can("report.lock") && (
              <button className="btn-primary" disabled={busy} onClick={() => void lock()}>
                {busy ? "Locking…" : "Review & lock month"}
              </button>
            )}
            <a className="btn-secondary" href={exportUrl(report.id, "csv")} target="_blank" rel="noreferrer">
              Export CSV (hub)
            </a>
            <a className="btn-secondary" href={exportUrl(report.id, "dhis2")} target="_blank" rel="noreferrer">
              Export DHIS2 (hub)
            </a>
          </div>

          {report.adjustments && report.adjustments.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Adjustments after lock
              </h4>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {report.adjustments.map((a) => (
                  <li key={a.id}>
                    <span className="font-mono">{a.figureKey}</span>: {a.fromValue} to {a.toValue}
                    <span className="text-slate-400"> · {a.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
