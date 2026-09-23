/**
 * Duplicate review and merge (Phase 9, task 4; Module 10).
 *
 * Two records for one person is a clinical safety problem rather than an
 * untidiness: a woman's antenatal history split across two records means the
 * clinician sees half of it, and she is counted twice in the monthly return.
 *
 * The flow is deliberately slow. The administrator searches for a patient, sees
 * candidates side by side with the evidence and the amount of history at stake,
 * and must type a reason. A merge cannot be undone from the application.
 */
import { useState } from "react";
import { Badge } from "./ui";
import { formatDate, titleCase } from "../lib/format";
import { useSync } from "../lib/sync";
import { hasHubSession } from "../lib/api";
import {
  mergePatients,
  patientDuplicates,
  searchLgaIndex,
  type DuplicateCandidate,
  type LgaIndexEntry,
} from "../lib/patients-api";

interface MergeOutcome {
  repointed: Record<string, number>;
  locked_reports_to_review: { id: string; year: number; month: number }[];
}

export function MergeTool() {
  const sync = useSync();
  const online = sync.online && hasHubSession();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LgaIndexEntry[] | null>(null);
  const [keep, setKeep] = useState<LgaIndexEntry | null>(null);
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [chosen, setChosen] = useState<DuplicateCandidate | null>(null);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<MergeOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    const res = await run(() => searchLgaIndex(query));
    // Merging is same-facility only, so out-of-scope hits are not offered.
    if (res) setResults(res.results.filter((r) => r.in_scope));
  }

  async function pick(entry: LgaIndexEntry) {
    setKeep(entry);
    setChosen(null);
    setOutcome(null);
    const res = await run(() => patientDuplicates(entry.id));
    if (res) setCandidates(res);
  }

  async function doMerge() {
    if (!keep || !chosen) return;
    const res = await run(() =>
      mergePatients({ survivingId: keep.id, mergedId: chosen.id, reason }),
    );
    if (res) {
      setOutcome(res);
      setCandidates((prev) => (prev ?? []).filter((c) => c.id !== chosen.id));
      setChosen(null);
      setReason("");
    }
  }

  function reset() {
    setKeep(null);
    setCandidates(null);
    setChosen(null);
    setReason("");
    setOutcome(null);
    setError(null);
  }

  if (!online) {
    return (
      <div className="card p-4 text-sm">
        <h3 className="font-semibold text-slate-700">Duplicate records</h3>
        <p className="mt-1 text-xs text-slate-500">
          Merging is carried out by the sync hub so that every device converges on the same
          outcome, rather than each resolving a structural change on its own. It needs a
          connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Two records for the same person split their history, so a clinician sees only half of
        it and the monthly return counts them twice. Find the record to <strong>keep</strong>,
        review the candidates against it, and merge. A merge cannot be undone here.
      </p>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}

      {!keep && (
        <div className="card p-4">
          <label className="label">Find the record to keep</label>
          <div className="mt-1 flex gap-2">
            <input
              className="input flex-1"
              placeholder="Name, phone or MRN (at least 3 characters)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
            />
            <button
              className="btn-primary"
              disabled={busy || query.trim().length < 3}
              onClick={() => void search()}
            >
              {busy ? "Searching…" : "Search"}
            </button>
          </div>

          {results && results.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              No patient at this facility matches that.
            </p>
          )}

          {results && results.length > 0 && (
            <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {results.map((r) => (
                <button
                  key={r.id}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-brand-50"
                  onClick={() => void pick(r)}
                >
                  <div>
                    <div className="text-sm font-medium text-slate-800">{r.display_name}</div>
                    <div className="text-[11px] text-slate-400">
                      {r.mrn} · {r.sex ?? "—"}
                      {r.year_of_birth ? ` · b. ${r.year_of_birth}` : ""}
                    </div>
                  </div>
                  <span className="text-xs text-brand-700">Review duplicates →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {keep && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Keeping</div>
              <div className="text-sm font-semibold text-slate-800">{keep.display_name}</div>
              <div className="text-[11px] text-slate-400">{keep.mrn}</div>
            </div>
            <button className="btn-secondary !py-1 !text-xs" onClick={reset}>
              Choose a different record
            </button>
          </div>

          {outcome && (
            <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
              <p className="font-medium">Merged.</p>
              <p className="mt-1">
                Moved onto this record:{" "}
                {Object.entries(outcome.repointed)
                  .filter(([key]) => key !== "fields_filled_from_duplicate")
                  .map(([key, n]) => `${n} ${titleCase(key).toLowerCase()}`)
                  .join(", ") || "no linked records"}
                .
              </p>
              {outcome.locked_reports_to_review.length > 0 && (
                <p className="mt-1 text-amber-800">
                  {outcome.locked_reports_to_review.length} locked monthly report
                  {outcome.locked_reports_to_review.length === 1 ? "" : "s"} covered this period
                  and may have counted the patient twice. Locked figures are never rewritten, so
                  file an adjustment on{" "}
                  {outcome.locked_reports_to_review
                    .map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`)
                    .join(", ")}
                  .
                </p>
              )}
            </div>
          )}

          {candidates && candidates.length === 0 && !outcome && (
            <p className="mt-3 text-xs text-slate-500">
              No likely duplicate of this record at this facility.
            </p>
          )}

          <div className="mt-3 space-y-2">
            {(candidates ?? []).map((c) => {
              const historyCount = Object.entries(c.record_counts).reduce((n, [, v]) => n + v, 0);
              const selected = chosen?.id === c.id;
              return (
                <div
                  key={c.id}
                  className={`rounded-lg border p-3 ${selected ? "border-brand-400 bg-brand-50/40" : "border-slate-200"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{c.display_name}</div>
                      <div className="text-[11px] text-slate-400">
                        {c.mrn} · {c.sex ?? "—"} · {c.date_of_birth ?? "no DOB"} ·{" "}
                        {c.phone_primary ?? "no phone"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.reasons.map((r) => (
                          <Badge key={r} tone="amber">
                            {r}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Registered {formatDate(c.created_at)} ·{" "}
                        {historyCount === 0
                          ? "no linked records"
                          : `${historyCount} linked record${historyCount === 1 ? "" : "s"} would move`}
                      </div>
                    </div>
                    <button
                      className={selected ? "btn-secondary !py-1 !text-xs" : "btn-primary !py-1 !text-xs"}
                      onClick={() => setChosen(selected ? null : c)}
                    >
                      {selected ? "Cancel" : "Merge into the kept record"}
                    </button>
                  </div>

                  {selected && (
                    <div className="mt-3 border-t border-brand-200 pt-3">
                      <p className="mb-2 text-xs text-amber-800">
                        All {historyCount} linked record{historyCount === 1 ? "" : "s"} will move
                        onto {keep.display_name} ({keep.mrn}). This record is kept as a
                        soft-deleted tombstone pointing at the survivor. It cannot be undone here.
                      </p>
                      <label className="block">
                        <span className="label">Reason for the merge</span>
                        <textarea
                          className="input min-h-[64px]"
                          value={reason}
                          placeholder="e.g. Same woman registered twice at the ANC desk; confirmed against the paper register"
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <div className="mt-2 flex justify-end">
                        <button
                          className="btn-danger"
                          disabled={busy || reason.trim().length < 10}
                          onClick={() => void doMerge()}
                        >
                          {busy ? "Merging…" : "Confirm merge"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
