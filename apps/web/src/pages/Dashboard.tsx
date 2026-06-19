import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { toISODate } from "@phc/shared";
import { db } from "../db/db";
import { useScope, notDeleted } from "../lib/scope";
import { useSession } from "../lib/session";
import { PageHeader, StatCard, Badge } from "../components/ui";
import { displayName, relativeTime } from "../lib/format";
import { useSync } from "../lib/sync";

export function DashboardPage() {
  const { user } = useSession();
  const scope = useScope();
  const sync = useSync();
  const today = toISODate(new Date());

  const data = useLiveQuery(async () => {
    const [patients, queue, doses, ancItems, pregnancies] = await Promise.all([
      db.patients.toArray(),
      db.queueEntries.where("queue_date").equals(today).toArray(),
      db.immunizationDoses.toArray(),
      db.ancScheduleItems.toArray(),
      db.pregnancies.toArray(),
    ]);
    return { patients, queue, doses, ancItems, pregnancies };
  }, [today]);

  if (!data) return null;

  const patients = notDeleted(data.patients).filter(scope.inScope);
  const queue = notDeleted(data.queue).filter(scope.inScope);
  const doses = notDeleted(data.doses).filter(scope.inScope);
  const ancItems = notDeleted(data.ancItems).filter(scope.inScope);
  const pregnancies = notDeleted(data.pregnancies).filter(scope.inScope);

  const waiting = queue.filter((q) => q.status === "waiting").length;
  const inProgress = queue.filter((q) => q.status === "in_progress").length;
  const activePreg = pregnancies.filter((p) => p.status === "active").length;

  const overdueDoses = doses.filter((d) => d.status !== "given" && d.status !== "not_applicable" && d.due_date < today);
  const ancOverdue = ancItems.filter((a) => a.status === "scheduled" && a.target_date < today);
  const ancDueSoon = ancItems.filter(
    (a) => a.status === "scheduled" && a.target_date >= today && a.target_date <= addDaysIso(today, 7),
  );

  const patientById = new Map(patients.map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader
        title={`Good day, ${user?.full_name?.split(" ")[0] ?? "there"}`}
        subtitle={
          scope.isLgaWide
            ? "LGA-wide overview across all facilities"
            : "Today at your facility"
        }
        actions={
          <Badge tone={sync.online ? "green" : "slate"}>
            {sync.online ? "Online" : "Offline"} · synced {relativeTime(sync.lastSyncAt)}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Patients" value={patients.length} hint="registered (scope)" />
        <StatCard label="Waiting now" value={waiting} hint={`${inProgress} in progress`} tone={waiting > 0 ? "warn" : "default"} />
        <StatCard label="Active pregnancies" value={activePreg} tone="good" />
        <StatCard label="ANC overdue" value={ancOverdue.length} tone={ancOverdue.length ? "alert" : "default"} />
        <StatCard label="Immunizations overdue" value={overdueDoses.length} tone={overdueDoses.length ? "alert" : "default"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Today's queue */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Today’s queue</h2>
            <Link to="/queue" className="text-sm font-medium text-brand-700 hover:underline">
              Open queue →
            </Link>
          </div>
          {queue.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No one in the queue yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {queue.slice(0, 6).map((q) => {
                const p = patientById.get(q.patient_id);
                return (
                  <li key={q.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {p ? displayName(p) : "Unknown"}
                      </div>
                      <div className="text-xs text-slate-400 capitalize">
                        {q.service} · {q.station}
                      </div>
                    </div>
                    <Badge tone={q.status === "in_progress" ? "blue" : q.priority !== "normal" ? "amber" : "slate"}>
                      {q.status === "in_progress" ? "in progress" : q.priority !== "normal" ? q.priority : "waiting"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Follow-up needed */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Follow-up needed</h2>
          </div>
          <div className="space-y-3 text-sm">
            <FollowupRow
              label="ANC due within 7 days"
              count={ancDueSoon.length}
              to="/maternal"
              tone="amber"
            />
            <FollowupRow label="ANC overdue (defaulters)" count={ancOverdue.length} to="/maternal" tone="red" />
            <FollowupRow
              label="Immunizations overdue"
              count={overdueDoses.length}
              to="/immunization"
              tone="red"
            />
          </div>
          <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Defaulters here feed SMS reminders &amp; CHEW outreach once the SMS module (Phase 7) is live.
          </p>
        </div>
      </div>
    </div>
  );
}

function FollowupRow({
  label,
  count,
  to,
  tone,
}: {
  label: string;
  count: number;
  to: string;
  tone: "amber" | "red";
}) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50">
      <span className="text-slate-700">{label}</span>
      <Badge tone={count > 0 ? tone : "slate"}>{count}</Badge>
    </Link>
  );
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  return toISODate(new Date(d.getTime() + days * 86_400_000));
}
