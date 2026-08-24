import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  computeChildSchedule,
  doseDisplayStatus,
  parseISODate,
  toISODate,
} from "@phc/shared";
import { db } from "../db/db";
import { SendReminderButton } from "../components/SendReminderButton";
import { createRecord, saveRecord } from "../db/repository";
import { useSession } from "../lib/session";
import { useScope, notDeleted } from "../lib/scope";
import { Badge, EmptyState, Field, Modal, PageHeader, StatCard } from "../components/ui";
import { displayName, formatDate, patientAge } from "../lib/format";
import { IconAlert } from "../components/icons";
import type { ImmunizationDose, Patient } from "../db/types";

export function ImmunizationPage() {
  const { actor } = useSession();
  const scope = useScope();
  const today = toISODate(new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const doses = useLiveQuery(() => db.immunizationDoses.toArray(), [], []);
  const patients = useLiveQuery(() => db.patients.toArray(), [], []);
  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const scopedDoses = useMemo(() => notDeleted(doses).filter(scope.inScope), [doses, scope]);
  const dosesByChild = useMemo(() => {
    const m = new Map<string, ImmunizationDose[]>();
    for (const d of scopedDoses) {
      const arr = m.get(d.patient_id) ?? [];
      arr.push(d);
      m.set(d.patient_id, arr);
    }
    return m;
  }, [scopedDoses]);

  const childIds = [...dosesByChild.keys()];
  const overdue = scopedDoses.filter((d) => d.status !== "given" && d.status !== "not_applicable" && d.due_date < today);
  const dueSoon = scopedDoses.filter(
    (d) => d.status !== "given" && d.status !== "not_applicable" && d.due_date >= today && d.due_date <= addDays(today, 7),
  );
  const given = scopedDoses.filter((d) => d.status === "given").length;

  // Children tagged child_u5 but without a generated schedule yet.
  const untracked = useMemo(
    () =>
      notDeleted(patients)
        .filter(scope.inScope)
        .filter((p) => p.category_tags.includes("child_u5") && p.date_of_birth && !dosesByChild.has(p.id)),
    [patients, scope, dosesByChild],
  );

  async function generateSchedule(child: Patient) {
    if (!actor || !child.date_of_birth) return;
    for (const d of computeChildSchedule(parseISODate(child.date_of_birth))) {
      const due = toISODate(d.dueDate);
      const dose = createRecord<ImmunizationDose>(actor, {
        patient_id: child.id,
        schedule_item_id: d.scheduleItemId,
        antigen: d.antigen,
        dose_label: d.doseLabel,
        status: due < today ? "missed" : "due",
        due_date: due,
      });
      await saveRecord(db.immunizationDoses, dose, actor, "create");
    }
    setSelectedId(child.id);
  }

  const selectedChild = selectedId ? patientById.get(selectedId) : null;

  return (
    <div>
      <PageHeader title="Immunization (EPI)" subtitle="Per-child schedule, due/overdue tracking & dose recording" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Children tracked" value={childIds.length} tone="good" />
        <StatCard label="Doses given" value={given} />
        <StatCard label="Due ≤ 7 days" value={dueSoon.length} tone={dueSoon.length ? "warn" : "default"} />
        <StatCard label="Overdue" value={overdue.length} tone={overdue.length ? "alert" : "default"} />
      </div>

      {overdue.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
            <IconAlert width={16} height={16} /> Overdue — recall list
          </h2>
          <div className="card divide-y divide-slate-100">
            {overdue.slice(0, 8).map((d) => {
              const p = patientById.get(d.patient_id);
              return (
                // A row, not a button: it carries its own recall action, and a
                // button inside a button is invalid markup.
                <div
                  key={d.id}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm"
                >
                  <button
                    onClick={() => setSelectedId(d.patient_id)}
                    className="min-w-0 flex-1 text-left hover:text-brand-700"
                  >
                    <span className="font-medium text-slate-800">{p ? displayName(p) : "Unknown"}</span>
                    <span className="ml-2 text-xs text-slate-400">{d.dose_label} · due {formatDate(d.due_date)}</span>
                  </button>
                  <span className="flex shrink-0 items-center gap-2">
                    <SendReminderButton
                      patient={p}
                      templateKey="immunization_reminder"
                      dueDate={formatDate(d.due_date)}
                    />
                    <Badge tone="red">overdue</Badge>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {untracked.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Start EPI schedule</h2>
          <div className="card divide-y divide-slate-100">
            {untracked.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-slate-800">{displayName(c)} · {patientAge(c.date_of_birth)}</span>
                <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => generateSchedule(c)}>
                  Generate schedule
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Immunization register</h2>
      {childIds.length === 0 ? (
        <EmptyState title="No children with immunization records" hint="Register a child (tag child_u5) and generate their EPI schedule." />
      ) : (
        <div className="card divide-y divide-slate-100">
          {childIds.map((cid) => {
            const p = patientById.get(cid);
            const list = dosesByChild.get(cid) ?? [];
            const childGiven = list.filter((d) => d.status === "given").length;
            const childOverdue = list.filter((d) => d.status !== "given" && d.status !== "not_applicable" && d.due_date < today).length;
            return (
              <button
                key={cid}
                onClick={() => setSelectedId(cid)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
              >
                <div>
                  <span className="font-semibold text-slate-800">{p ? displayName(p) : "Unknown"}</span>
                  <span className="ml-2 text-xs text-slate-400">{p ? patientAge(p.date_of_birth) : ""}</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <Badge tone="green">{childGiven} given</Badge>
                  {childOverdue > 0 && <Badge tone="red">{childOverdue} overdue</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedChild && (
        <ImmunizationCard
          child={selectedChild}
          doses={(dosesByChild.get(selectedChild.id) ?? []).sort((a, b) => a.due_date.localeCompare(b.due_date))}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ImmunizationCard({ child, doses, onClose }: { child: Patient; doses: ImmunizationDose[]; onClose: () => void }) {
  const { actor, can } = useSession();
  const today = toISODate(new Date());
  const [recording, setRecording] = useState<ImmunizationDose | null>(null);

  return (
    <Modal open title={`Immunization card — ${displayName(child)}`} onClose={onClose} wide>
      <p className="mb-3 text-xs text-slate-400">
        <Link to={`/patients/${child.id}`} className="text-brand-700 hover:underline">View patient record →</Link>
        {" · "}Schedule from EPI config (verify vs. current NPHCDA).
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Dose</th>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {doses.map((d) => {
              const ds = doseDisplayStatus(d.status, parseISODate(d.due_date));
              return (
                <tr key={d.id}>
                  <td className="px-3 py-2 font-medium text-slate-700">{d.dose_label}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {d.status === "given" ? formatDate(d.given_date) : formatDate(d.due_date)}
                    {d.batch_lot && <span className="ml-1 text-xs text-slate-400">· {d.batch_lot}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        ds === "given" ? "green" : ds === "overdue" ? "red" : ds === "due" ? "amber" : "slate"
                      }
                    >
                      {ds}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {d.status !== "given" && can("immunization.record") && (
                      <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => setRecording(d)}>
                        Record given
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {recording && (
        <RecordDose
          dose={recording}
          onClose={() => setRecording(null)}
          onSaved={() => setRecording(null)}
          givenByDefault={actor?.userId ?? ""}
          today={today}
        />
      )}
    </Modal>
  );
}

function RecordDose({
  dose,
  onClose,
  onSaved,
  givenByDefault,
  today,
}: {
  dose: ImmunizationDose;
  onClose: () => void;
  onSaved: () => void;
  givenByDefault: string;
  today: string;
}) {
  const { actor } = useSession();
  const [batch, setBatch] = useState("");
  const [site, setSite] = useState("Left thigh");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!actor) return;
    setBusy(true);
    try {
      await saveRecord(
        db.immunizationDoses,
        {
          ...dose,
          status: "given",
          given_date: today,
          batch_lot: batch.trim() || undefined,
          site,
          given_by: givenByDefault,
        },
        actor,
        "update",
      );
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`Record ${dose.dose_label}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Batch / lot number" hint="Administration tracking (stock deferred)">
          <input className="input" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. LOT-4821" />
        </Field>
        <Field label="Site">
          <select className="input" value={site} onChange={(e) => setSite(e.target.value)}>
            <option>Left thigh</option>
            <option>Right thigh</option>
            <option>Left arm</option>
            <option>Right arm</option>
            <option>Oral</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Mark given"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function addDays(iso: string, days: number): string {
  return toISODate(new Date(new Date(iso + "T00:00:00Z").getTime() + days * 86_400_000));
}
