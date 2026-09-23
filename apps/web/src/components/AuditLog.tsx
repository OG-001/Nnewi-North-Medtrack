/**
 * The audit log viewer.
 *
 * Reads from the hub when connected, because the local log holds only this
 * device's own events. Showing that to an administrator as "the audit log"
 * would be misleading: the events they most need to see, another nurse's
 * cross-facility access, a config change, a report lock, happened elsewhere.
 *
 * Offline it falls back to the local events, clearly labelled as such.
 */
import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { Badge } from "./ui";
import { formatDateTime, titleCase } from "../lib/format";
import { useSync } from "../lib/sync";
import { hasHubSession } from "../lib/api";
import { auditActions, auditExportUrl, listAudit, type HubAuditEvent } from "../lib/admin-api";

export function AuditLog() {
  const sync = useSync();
  const online = sync.online && hasHubSession();

  const [events, setEvents] = useState<HubAuditEvent[] | null>(null);
  const [actions, setActions] = useState<{ action: string; count: number }[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const localEvents = useLiveQuery(
    () => db.auditEvents.orderBy("at").reverse().limit(100).toArray(),
    [],
    [],
  );

  const load = useCallback(async () => {
    if (!online) return;
    setError(null);
    try {
      const [res, acts] = await Promise.all([
        listAudit({ action: filter || undefined, limit: 100 }),
        auditActions(),
      ]);
      setEvents(res.events);
      setActions(acts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the sync hub");
    }
  }, [online, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = online && events ? events : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={online ? "green" : "amber"}>
          {online ? "Hub audit log" : "This device only (offline)"}
        </Badge>
        {online && (
          <div className="flex items-center gap-2">
            <a
              className="btn-secondary !py-1 !text-xs"
              href={auditExportUrl(filter || undefined)}
              target="_blank"
              rel="noreferrer"
            >
              Export CSV
            </a>
            <select className="input !w-auto !py-1 !text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a.action} value={a.action}>
                  {titleCase(a.action)} ({a.count})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!online && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          These are only this device&rsquo;s events. Connect to see the facility&rsquo;s full audit
          trail, including actions taken on other devices.
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Actor</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Entity</th>
              <th className="px-3 py-2 text-left">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows
              ? rows.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{formatDateTime(e.at)}</td>
                    <td className="px-3 py-1.5 text-slate-700">{e.actorUserId ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={e.action === "sensitive_access" ? "amber" : "slate"}>
                        {titleCase(e.action)}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{e.entityType ?? "—"}</td>
                    <td className="max-w-xs truncate px-3 py-1.5 text-xs text-slate-500">
                      {e.details?.reason ? String(e.details.reason) : ""}
                    </td>
                  </tr>
                ))
              : localEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{formatDateTime(e.at)}</td>
                    <td className="px-3 py-1.5 text-slate-700">{e.actor_user_id}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone="slate">{titleCase(e.action)}</Badge>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{e.entity_type}</td>
                    <td className="px-3 py-1.5" />
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
