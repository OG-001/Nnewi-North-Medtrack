/**
 * LGA-wide patient lookup for continuity of care (Global Constraint 8).
 *
 * Patients move between PHCs. Rather than widening every query, this is a
 * deliberate, separate action: it searches an index that exposes only enough to
 * identify a person, and opening another facility's record requires a reason
 * and is audited as a `sensitive_access` event.
 *
 * It needs connectivity, because the index lives at the hub. That is correct:
 * a device holds only its own facility's data by design, so there is nothing
 * offline to search.
 */
import { useState } from "react";
import { Badge, Modal } from "./ui";
import { useSync } from "../lib/sync";
import { hasHubSession } from "../lib/api";
import { openPatientRecord, searchLgaIndex, type LgaIndexEntry } from "../lib/patients-api";

export function LgaPatientSearch({ initialQuery }: { initialQuery: string }) {
  const sync = useSync();
  const available = sync.online && hasHubSession();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LgaIndexEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<LgaIndexEntry | null>(null);
  const [reason, setReason] = useState("");
  const [opened, setOpened] = useState<Record<string, unknown> | null>(null);

  async function runSearch() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await searchLgaIndex(query);
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the sync hub");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOpen() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await openPatientRecord(target.id, reason);
      setOpened(res.patient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the record");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setOpen(false);
    setTarget(null);
    setReason("");
    setOpened(null);
    setError(null);
    setResults(null);
  }

  if (!available) return null;

  return (
    <>
      <button className="btn-secondary !text-xs" onClick={() => setOpen(true)}>
        Search other PHCs in the LGA
      </button>

      <Modal open={open} title="LGA-wide patient lookup" onClose={reset} wide>
        {!target && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              For a patient registered at another PHC. This searches name, phone and MRN across
              the LGA and shows only enough to identify someone. Opening a record from another
              facility needs a reason and is recorded in the audit log.
            </p>

            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={query}
                placeholder="Name, phone or MRN (at least 3 characters)"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runSearch()}
              />
              <button className="btn-primary" disabled={busy || query.trim().length < 3} onClick={() => void runSearch()}>
                {busy ? "Searching…" : "Search"}
              </button>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            {results && results.length === 0 && (
              <p className="text-xs text-slate-500">No patient in the LGA matches that.</p>
            )}

            {results && results.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {results.map((r) => (
                  <button
                    key={r.id}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-brand-50"
                    onClick={() => setTarget(r)}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {r.display_name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {r.sex ?? "—"}
                        {r.year_of_birth ? ` · b. ${r.year_of_birth}` : ""} · {r.mrn}
                      </div>
                      <div className="text-[11px] text-slate-500">{r.home_facility_name}</div>
                    </div>
                    {r.in_scope ? (
                      <Badge tone="green">Your facility</Badge>
                    ) : (
                      <Badge tone="amber">Other PHC</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {target && !opened && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-sm font-medium text-slate-800">{target.display_name}</div>
              <div className="text-xs text-slate-500">
                {target.mrn} · {target.home_facility_name}
              </div>
            </div>

            {target.in_scope ? (
              <p className="text-xs text-slate-500">
                This patient is registered at your facility, so no reason is needed.
              </p>
            ) : (
              <>
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  This record belongs to another PHC. Opening it is recorded in the audit log
                  against your name, with the reason you give.
                </p>
                <label className="block">
                  <span className="label">Reason for opening this record</span>
                  <textarea
                    className="input min-h-[72px]"
                    value={reason}
                    placeholder="e.g. Patient presented here today and needs her ANC history"
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setTarget(null)}>
                Back
              </button>
              <button
                className="btn-primary"
                disabled={busy || (!target.in_scope && reason.trim().length < 10)}
                onClick={() => void confirmOpen()}
              >
                {busy ? "Opening…" : "Open record"}
              </button>
            </div>
          </div>
        )}

        {opened && (
          <div className="space-y-3">
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
              Read-only view for continuity of care. The record stays with its home facility.
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {(
                [
                  ["Name", `${opened.last_name ?? ""} ${opened.first_name ?? ""}`],
                  ["MRN", opened.mrn],
                  ["Sex", opened.sex],
                  ["Date of birth", opened.date_of_birth],
                  ["Phone", opened.phone_primary],
                  ["Town", opened.address_town],
                  ["Allergies", (opened.allergies as string[] | undefined)?.join(", ")],
                  ["Chronic conditions", (opened.chronic_conditions as string[] | undefined)?.join(", ")],
                ] as [string, unknown][]
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-slate-800">{value ? String(value) : "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end">
              <button className="btn-secondary" onClick={reset}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
