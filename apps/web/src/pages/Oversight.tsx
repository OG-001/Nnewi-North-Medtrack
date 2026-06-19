/**
 * LGA Oversight — the Health HOD's view across every facility in the LGA.
 *
 * Answers "what is each PHC doing right now / today / this week?" without a
 * physical visit: an activity board over all facilities, with per-PHC drill-down
 * (period summary, programme snapshot, recent activity feed).
 *
 * Data source today is the local store; once the sync hub (Phase 3) is live,
 * facilities push their records and this page reflects them as they sync —
 * the "Last activity" column doubles as the freshness indicator.
 */
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toISODate } from "@phc/shared";
import { db } from "../db/db";
import { Badge, Modal, PageHeader, StatCard } from "../components/ui";
import { formatDate, relativeTime, titleCase } from "../lib/format";
import type {
  AncScheduleItem,
  AncVisit,
  AuditEvent,
  Encounter,
  Facility,
  ImmunizationDose,
  Patient,
  Pregnancy,
  QueueEntry,
  UserAccount,
} from "../db/types";

interface OversightData {
  facilities: Facility[];
  patients: Patient[];
  encounters: Encounter[];
  ancVisits: AncVisit[];
  doses: ImmunizationDose[];
  queue: QueueEntry[];
  pregnancies: Pregnancy[];
  ancItems: AncScheduleItem[];
  audit: AuditEvent[];
  users: UserAccount[];
}

type Period = "today" | "7d" | "month";

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
];

function periodStart(p: Period): Date {
  const now = new Date();
  if (p === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "7d") return new Date(now.getTime() - 7 * 86_400_000);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

interface FacilityActivity {
  facility: Facility;
  registrations: number;
  encounters: number;
  ancVisits: number;
  dosesGiven: number;
  queueCheckins: number;
  total: number;
  lastActivity: string | null; // ISO timestamp of the most recent event, any time
}

export function OversightPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [facilities, patients, encounters, ancVisits, doses, queue, pregnancies, ancItems, audit, users] =
      await Promise.all([
        db.facilities.toArray(),
        db.patients.toArray(),
        db.encounters.toArray(),
        db.ancVisits.toArray(),
        db.immunizationDoses.toArray(),
        db.queueEntries.toArray(),
        db.pregnancies.toArray(),
        db.ancScheduleItems.toArray(),
        db.auditEvents.toArray(),
        db.users.toArray(),
      ]);
    return { facilities, patients, encounters, ancVisits, doses, queue, pregnancies, ancItems, audit, users };
  }, []);

  const board = useMemo<FacilityActivity[]>(() => {
    if (!data) return [];
    const startIso = periodStart(period).toISOString();
    const startDate = toISODate(periodStart(period));

    const rows = data.facilities
      .filter((f) => !f.deleted_at && f.active)
      .map((facility) => {
        const fid = facility.id;
        const registrations = data.patients.filter(
          (p) => p.facility_id === fid && !p.deleted_at && p.created_at >= startIso,
        ).length;
        const encounters = data.encounters.filter(
          (e) => e.facility_id === fid && !e.deleted_at && e.encounter_date >= startDate,
        ).length;
        const ancVisits = data.ancVisits.filter(
          (v) => v.facility_id === fid && !v.deleted_at && v.visit_date >= startDate,
        ).length;
        const dosesGiven = data.doses.filter(
          (d) => d.facility_id === fid && !d.deleted_at && d.status === "given" && (d.given_date ?? "") >= startDate,
        ).length;
        const queueCheckins = data.queue.filter(
          (q) => q.facility_id === fid && !q.deleted_at && q.queue_date >= startDate,
        ).length;

        // Most recent event at this facility regardless of period (freshness).
        let last: string | null = null;
        const bump = (ts?: string | null) => {
          if (ts && (!last || ts > last)) last = ts;
        };
        for (const a of data.audit) if (a.facility_id === fid) bump(a.at);
        for (const p of data.patients) if (p.facility_id === fid) bump(p.updated_at);
        for (const e of data.encounters) if (e.facility_id === fid) bump(e.updated_at);
        for (const q of data.queue) if (q.facility_id === fid) bump(q.updated_at);

        return {
          facility,
          registrations,
          encounters,
          ancVisits,
          dosesGiven,
          queueCheckins,
          total: registrations + encounters + ancVisits + dosesGiven + queueCheckins,
          lastActivity: last,
        };
      });

    // Most active first, then alphabetical.
    return rows.sort(
      (a, b) => b.total - a.total || a.facility.name.localeCompare(b.facility.name),
    );
  }, [data, period]);

  const totals = useMemo(() => {
    const sum = (k: keyof Omit<FacilityActivity, "facility" | "lastActivity">) =>
      board.reduce((acc, r) => acc + (r[k] as number), 0);
    return {
      active: board.filter((r) => r.total > 0).length,
      registrations: sum("registrations"),
      encounters: sum("encounters"),
      ancVisits: sum("ancVisits"),
      dosesGiven: sum("dosesGiven"),
      queueCheckins: sum("queueCheckins"),
    };
  }, [board]);

  const selected = board.find((r) => r.facility.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="LGA Oversight"
        subtitle="Live activity across every facility in Nnewi North — select a PHC for its full summary"
      />

      {/* Period toggle */}
      <div className="mb-4 flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={
              period === p.key
                ? "rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* LGA-wide totals for the period */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Facilities active" value={totals.active} hint={`of ${board.length}`} />
        <StatCard label="New registrations" value={totals.registrations} />
        <StatCard label="Visits recorded" value={totals.encounters} />
        <StatCard label="ANC visits" value={totals.ancVisits} />
        <StatCard label="Doses given" value={totals.dosesGiven} />
        <StatCard label="Queue check-ins" value={totals.queueCheckins} />
      </div>

      {/* Facility activity board */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5">Facility</th>
              <th className="px-2 py-2.5 text-center">Reg.</th>
              <th className="px-2 py-2.5 text-center">Visits</th>
              <th className="px-2 py-2.5 text-center">ANC</th>
              <th className="px-2 py-2.5 text-center">Imms.</th>
              <th className="px-2 py-2.5 text-center">Queue</th>
              <th className="px-4 py-2.5 text-right">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {board.map((r) => {
              const fresh =
                r.lastActivity && r.lastActivity >= periodStart("today").toISOString();
              return (
                <tr
                  key={r.facility.id}
                  onClick={() => setSelectedId(r.facility.id)}
                  className="cursor-pointer border-b border-slate-50 hover:bg-brand-50/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          fresh
                            ? "h-2 w-2 shrink-0 rounded-full bg-green-500"
                            : r.lastActivity
                              ? "h-2 w-2 shrink-0 rounded-full bg-amber-400"
                              : "h-2 w-2 shrink-0 rounded-full bg-slate-200"
                        }
                        title={fresh ? "Active today" : r.lastActivity ? "Previously active" : "No data yet"}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">{r.facility.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {r.facility.national_code ?? r.facility.code}
                        </div>
                      </div>
                    </div>
                  </td>
                  <Num v={r.registrations} />
                  <Num v={r.encounters} />
                  <Num v={r.ancVisits} />
                  <Num v={r.dosesGiven} />
                  <Num v={r.queueCheckins} />
                  <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                    {r.lastActivity ? relativeTime(r.lastActivity) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Figures cover the selected period. Facilities appear here as soon as their devices sync.
      </p>

      {selected && data && (
        <FacilityDrilldown
          activity={selected}
          period={period}
          data={data}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function Num({ v }: { v: number }) {
  return (
    <td className={`px-2 py-2.5 text-center tabular-nums ${v > 0 ? "font-semibold text-slate-800" : "text-slate-300"}`}>
      {v}
    </td>
  );
}

function FacilityDrilldown({
  activity,
  period,
  data,
  onClose,
}: {
  activity: FacilityActivity;
  period: Period;
  data: OversightData;
  onClose: () => void;
}) {
  const f = activity.facility;
  const fid = f.id;
  const todayIso = toISODate(new Date());

  const snapshot = useMemo(() => {
    const patients = data.patients.filter((p) => p.facility_id === fid && !p.deleted_at);
    const activePreg = data.pregnancies.filter(
      (p) => p.facility_id === fid && !p.deleted_at && p.status === "active",
    );
    const ancOverdue = data.ancItems.filter(
      (i) => i.facility_id === fid && !i.deleted_at && i.status === "scheduled" && i.target_date < todayIso,
    ).length;
    const immOverdue = data.doses.filter(
      (d) =>
        d.facility_id === fid &&
        !d.deleted_at &&
        (d.status === "missed" || (d.status === "due" && d.due_date < todayIso)),
    ).length;
    const staff = data.users.filter(
      (u) => u.status === "active" && u.facility_ids.length === 1 && u.facility_ids[0] === fid,
    ).length;
    return { patients: patients.length, activePreg: activePreg.length, ancOverdue, immOverdue, staff };
  }, [data, fid, todayIso]);

  // Recent activity feed: latest audit events at this facility, actor resolved.
  const feed = useMemo(() => {
    const byUser = new Map(data.users.map((u) => [u.id, u.full_name]));
    return data.audit
      .filter((a) => a.facility_id === fid)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        at: a.at,
        actor: byUser.get(a.actor_user_id) ?? "Unknown",
        action: a.action,
        entity: a.entity_type,
      }));
  }, [data, fid]);

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "";

  return (
    <Modal open wide title={f.name} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-mono">{f.national_code ?? f.code}</span>
          <Badge tone="green">{titleCase(f.facility_type ?? "—")}</Badge>
          <Badge tone={f.ownership === "public" ? "green" : "slate"}>{titleCase(f.ownership ?? "—")}</Badge>
          <span className="ml-auto">
            Last activity: {activity.lastActivity ? relativeTime(activity.lastActivity) : "no data yet"}
          </span>
        </div>

        {/* Period activity */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Activity — {periodLabel}
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MiniStat label="Registrations" value={activity.registrations} />
            <MiniStat label="Visits" value={activity.encounters} />
            <MiniStat label="ANC visits" value={activity.ancVisits} />
            <MiniStat label="Doses given" value={activity.dosesGiven} />
            <MiniStat label="Queue" value={activity.queueCheckins} />
          </div>
        </div>

        {/* Standing snapshot */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Facility snapshot
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MiniStat label="Patients" value={snapshot.patients} />
            <MiniStat label="Active pregnancies" value={snapshot.activePreg} />
            <MiniStat label="ANC overdue" value={snapshot.ancOverdue} alert={snapshot.ancOverdue > 0} />
            <MiniStat label="Imms overdue" value={snapshot.immOverdue} alert={snapshot.immOverdue > 0} />
            <MiniStat label="Staff accounts" value={snapshot.staff} />
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Recent activity
          </h4>
          {feed.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
              No recorded activity at this facility yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-50 rounded-lg border border-slate-100">
              {feed.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">{e.actor}</span>
                  <Badge tone="slate">{titleCase(e.action)}</Badge>
                  <span className="text-slate-400">{titleCase(e.entity)}</span>
                  <span className="ml-auto whitespace-nowrap text-xs text-slate-400">
                    {relativeTime(e.at)} · {formatDate(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function MiniStat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className={`text-lg font-bold tabular-nums ${alert ? "text-red-600" : "text-slate-800"}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
