/**
 * The admin conflict-review queue (Phase 9, task 6).
 *
 * Almost every sync conflict resolves by rule. This queue holds the ones that
 * cannot: two devices set an identity-critical field, a date of birth or a sex,
 * to different values for the same patient. Clinical work continues on the
 * latest value while an administrator reconciles, and the contradiction is
 * never silently dropped.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "./ui";
import { formatDateTime, titleCase } from "../lib/format";
import { useSync } from "../lib/sync";
import { hasHubSession } from "../lib/api";
import { listConflicts, resolveConflict, type ConflictEntry } from "../lib/conflicts-api";

function valueOf(payload: Record<string, unknown>, field: string): string {
  const value = payload?.[field];
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

export function ConflictQueue() {
  const sync = useSync();
  const online = sync.online && hasHubSession();

  const [conflicts, setConflicts] = useState<ConflictEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!online) return;
    setError(null);
    try {
      setConflicts(await listConflicts("open"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the sync hub");
    }
  }, [online]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, choice: "server" | "client") {
    setBusy(id);
    setError(null);
    try {
      await resolveConflict(id, choice);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve that conflict");
    } finally {
      setBusy(null);
    }
  }

  if (!online) {
    return (
      <div className="card mt-4 p-4 text-sm">
        <h3 className="font-semibold text-slate-700">Conflicts needing review</h3>
        <p className="mt-1 text-xs text-slate-500">
          The review queue lives at the sync hub, because a contradiction between two devices
          can only be seen from where both of them sync. Connect to review it.
        </p>
      </div>
    );
  }

  return (
    <div className="card mt-4 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Conflicts needing review</h3>
        {conflicts && (
          <Badge tone={conflicts.length ? "amber" : "green"}>
            {conflicts.length ? `${conflicts.length} open` : "None open"}
          </Badge>
        )}
      </div>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {conflicts && conflicts.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Nothing to reconcile. Conflicts appear here only when two devices disagree on an
          identity-critical field, such as a date of birth.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {(conflicts ?? []).map((conflict) => (
          <div key={conflict.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                <span className="font-medium">{titleCase(conflict.entityType)}</span>
                <span className="ml-1 font-mono text-[11px] text-slate-400">
                  {conflict.entityId.slice(0, 8)}…
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                {formatDateTime(conflict.createdAt)}
              </span>
            </div>

            <p className="mt-1 text-xs text-amber-800">
              Two devices recorded different values for{" "}
              <span className="font-medium">
                {conflict.fields.map((f) => titleCase(f)).join(", ")}
              </span>
              . Choose the correct one.
            </p>

            <table className="mt-2 w-full text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 text-left font-medium">Field</th>
                  <th className="py-1 text-left font-medium">On the hub</th>
                  <th className="py-1 text-left font-medium">From the device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {conflict.fields.map((field) => (
                  <tr key={field}>
                    <td className="py-1 pr-2 text-slate-500">{titleCase(field)}</td>
                    <td className="py-1 pr-2 font-medium text-slate-800">
                      {valueOf(conflict.serverPayload, field)}
                    </td>
                    <td className="py-1 font-medium text-slate-800">
                      {valueOf(conflict.clientPayload, field)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button
                className="btn-secondary !px-2 !py-1 text-xs"
                disabled={busy !== null}
                onClick={() => void resolve(conflict.id, "server")}
              >
                Keep the hub&rsquo;s value
              </button>
              <button
                className="btn-primary !px-2 !py-1 text-xs"
                disabled={busy !== null}
                onClick={() => void resolve(conflict.id, "client")}
              >
                Use the device&rsquo;s value
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
