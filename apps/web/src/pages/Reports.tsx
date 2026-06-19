import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useScope, notDeleted } from "../lib/scope";
import { useSession } from "../lib/session";
import { PageHeader, Badge } from "../components/ui";
import {
  computeMonthlyReport,
  figuresToCsv,
  figuresToDhis2,
  type ReportFigure,
} from "../lib/reporting";

const now = new Date();

export function ReportsPage() {
  const scope = useScope();
  const { facilityId } = useSession();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const data = useLiveQuery(async () => {
    const [patients, encounters, pregnancies, ancVisits, deliveries, doses, referrals, facilities] =
      await Promise.all([
        db.patients.toArray(),
        db.encounters.toArray(),
        db.pregnancies.toArray(),
        db.ancVisits.toArray(),
        db.deliveries.toArray(),
        db.immunizationDoses.toArray(),
        db.referrals.toArray(),
        db.facilities.toArray(),
      ]);
    return { patients, encounters, pregnancies, ancVisits, deliveries, doses, referrals, facilities };
  }, []);

  const figures = useMemo<ReportFigure[]>(() => {
    if (!data) return [];
    const s = <T extends { facility_id: string; deleted_at: string | null }>(rows: T[]) =>
      notDeleted(rows).filter(scope.inScope);
    return computeMonthlyReport({
      year,
      month,
      patients: s(data.patients),
      encounters: s(data.encounters),
      pregnancies: s(data.pregnancies),
      ancVisits: s(data.ancVisits),
      deliveries: s(data.deliveries),
      doses: s(data.doses),
      referrals: s(data.referrals),
    });
  }, [data, scope, year, month]);

  const groups = useMemo(() => {
    const m = new Map<string, ReportFigure[]>();
    for (const f of figures) {
      const arr = m.get(f.group) ?? [];
      arr.push(f);
      m.set(f.group, arr);
    }
    return [...m.entries()];
  }, [figures]);

  const facility = data?.facilities.find((f) => f.id === facilityId);
  const periodLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    download(
      `phc-report-${year}-${String(month).padStart(2, "0")}.csv`,
      figuresToCsv(figures, { facility: facility?.name ?? "All facilities", year, month }),
      "text/csv",
    );
  }
  function exportDhis2() {
    download(
      `dhis2-import-${year}-${String(month).padStart(2, "0")}.json`,
      JSON.stringify(figuresToDhis2(figures, { facilityCode: facility?.code ?? "ALL", year, month }), null, 2),
      "application/json",
    );
  }

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        subtitle={scope.isLgaWide ? "LGA-wide NHMIS rollup" : `${facility?.name ?? ""} · NHMIS monthly summary`}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={exportCsv}>Export CSV</button>
            <button className="btn-primary" onClick={exportDhis2}>DHIS2 export</button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select className="input max-w-[10rem]" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString("en-NG", { month: "long" })}
            </option>
          ))}
        </select>
        <select className="input max-w-[7rem]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[now.getUTCFullYear(), now.getUTCFullYear() - 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <Badge tone="green">Period: {periodLabel}</Badge>
        <span className="text-xs text-slate-400">Figures reconcile to source rows (auditable).</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(([group, figs]) => (
          <div key={group} className="card p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">{group}</h3>
            <dl className="divide-y divide-slate-100">
              {figs.map((f) => (
                <div key={f.key} className="flex items-center justify-between py-1.5 text-sm">
                  <dt className="text-slate-600">{f.label}</dt>
                  <dd className="font-semibold text-slate-900">
                    {f.value}
                    {f.key.endsWith("_pct") ? "%" : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <p className="mt-5 rounded-lg bg-brand-50 px-4 py-3 text-xs text-brand-800">
        Monthly report lock (officer-in-charge) and live DHIS2 API integration are part of Phase 8/Q4.
        The DHIS2 export here produces a structured import file; map <code>dataElement</code> keys to your
        LGA’s DHIS2 UIDs before upload.
      </p>
    </div>
  );
}
