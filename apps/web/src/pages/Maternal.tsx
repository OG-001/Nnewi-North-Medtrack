import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  computeRiskFlags,
  gestationalAgeWeeks,
  parseISODate,
  toISODate,
} from "@phc/shared";
import { db } from "../db/db";
import { SendReminderButton } from "../components/SendReminderButton";
import { createRecord, saveRecord } from "../db/repository";
import { useSession } from "../lib/session";
import { useScope, notDeleted } from "../lib/scope";
import { Badge, EmptyState, Field, Modal, PageHeader, StatCard } from "../components/ui";
import { displayName, formatDate, titleCase } from "../lib/format";
import type { AncScheduleItem, AncVisit, Encounter, Patient, Pregnancy } from "../db/types";
import { IconAlert } from "../components/icons";

export function MaternalPage() {
  const scope = useScope();
  const today = toISODate(new Date());
  const [selected, setSelected] = useState<Pregnancy | null>(null);

  const pregnancies = useLiveQuery(() => db.pregnancies.toArray(), [], []);
  const items = useLiveQuery(() => db.ancScheduleItems.toArray(), [], []);
  const patients = useLiveQuery(() => db.patients.toArray(), [], []);
  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const active = useMemo(
    () => notDeleted(pregnancies).filter(scope.inScope).filter((p) => p.status === "active"),
    [pregnancies, scope],
  );
  const scopedItems = useMemo(() => notDeleted(items).filter(scope.inScope), [items, scope]);

  const itemsByPreg = useMemo(() => {
    const m = new Map<string, AncScheduleItem[]>();
    for (const it of scopedItems) {
      const arr = m.get(it.pregnancy_id) ?? [];
      arr.push(it);
      m.set(it.pregnancy_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.contact_number - b.contact_number);
    return m;
  }, [scopedItems]);

  const dueSoon = scopedItems.filter((i) => i.status === "scheduled" && i.target_date >= today && i.target_date <= addDays(today, 7));
  const overdue = scopedItems.filter((i) => i.status === "scheduled" && i.target_date < today);
  const highRisk = active.filter((p) => p.risk_flags.length > 0);

  return (
    <div>
      <PageHeader title="Maternal health — ANC" subtitle="Antenatal scheduling, visits & defaulter follow-up" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active pregnancies" value={active.length} tone="good" />
        <StatCard label="Due ≤ 7 days" value={dueSoon.length} tone={dueSoon.length ? "warn" : "default"} />
        <StatCard label="Defaulters (overdue)" value={overdue.length} tone={overdue.length ? "alert" : "default"} />
        <StatCard label="High-risk" value={highRisk.length} tone={highRisk.length ? "alert" : "default"} />
      </div>

      {overdue.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700">
            <IconAlert width={16} height={16} /> Defaulter list — overdue ANC contacts
          </h2>
          <div className="card divide-y divide-slate-100">
            {overdue.slice(0, 8).map((i) => {
              const p = patientById.get(i.patient_id);
              return (
                <div key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    {p && (
                      <Link to={`/patients/${p.id}`} className="font-medium text-slate-800 hover:text-brand-700">
                        {displayName(p)}
                      </Link>
                    )}
                    <span className="ml-2 text-xs text-slate-400">
                      Contact {i.contact_number} · was due {formatDate(i.target_date)}
                    </span>
                  </div>
                  <SendReminderButton
                    patient={p}
                    templateKey="missed_visit_recall"
                    dueDate={formatDate(i.target_date)}
                  />
                  <Badge tone="red">SMS recall eligible</Badge>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            These feed SMS reminders (Phase 7) and CHEW outreach.
          </p>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">ANC register</h2>
      {active.length === 0 ? (
        <EmptyState
          title="No active pregnancies"
          hint="Open a patient and use “Start pregnancy / ANC” to register one."
        />
      ) : (
        <div className="card divide-y divide-slate-100">
          {active.map((preg) => {
            const p = patientById.get(preg.patient_id);
            const ga = gestationalAgeWeeks(parseISODate(preg.lmp));
            const pregItems = itemsByPreg.get(preg.id) ?? [];
            const next = pregItems.find((i) => i.status === "scheduled");
            const attended = pregItems.filter((i) => i.status === "attended").length;
            return (
              <button
                key={preg.id}
                onClick={() => setSelected(preg)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-slate-800">{p ? displayName(p) : "Unknown"}</span>
                    {preg.risk_flags.length > 0 && <Badge tone="red">high risk</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    GA {ga} wks · EDD {formatDate(preg.edd)} · {attended}/{pregItems.length} contacts done
                  </div>
                </div>
                <div className="text-right text-xs">
                  {next ? (
                    <Badge tone={next.target_date < today ? "red" : "amber"}>
                      Next: contact {next.contact_number} · {formatDate(next.target_date)}
                    </Badge>
                  ) : (
                    <Badge tone="green">schedule complete</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <PregnancyDetailModal
          pregnancy={selected}
          patient={patientById.get(selected.patient_id)}
          items={itemsByPreg.get(selected.id) ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function PregnancyDetailModal({
  pregnancy,
  patient,
  items,
  onClose,
}: {
  pregnancy: Pregnancy;
  patient?: Patient;
  items: AncScheduleItem[];
  onClose: () => void;
}) {
  const { actor, can } = useSession();
  const today = toISODate(new Date());
  const [recording, setRecording] = useState(false);
  const ga = gestationalAgeWeeks(parseISODate(pregnancy.lmp));
  const nextItem = items.find((i) => i.status === "scheduled");

  const [v, setV] = useState({
    weight_kg: "",
    systolic: "",
    diastolic: "",
    fundal_height_cm: "",
    fetal_heart_rate: "",
    urine_protein: "",
    pcv_or_hb: "",
    tt_dose_number: "",
    iptp_dose_number: "",
    ifa_given: true,
    danger_signs: "",
  });
  const set = (k: keyof typeof v, val: string | boolean) => setV((s) => ({ ...s, [k]: val }));
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  async function recordVisit() {
    if (!actor || !patient) return;
    const dangerSigns = v.danger_signs ? v.danger_signs.split(",").map((s) => s.trim()).filter(Boolean) : [];

    // Encounter (EMR) — reused vitals, no double entry.
    const enc = createRecord<Encounter>(actor, {
      patient_id: patient.id,
      encounter_date: today,
      type: "anc",
      attending_user_id: actor.userId,
      weight_kg: num(v.weight_kg),
      systolic: num(v.systolic),
      diastolic: num(v.diastolic),
      outcome: dangerSigns.length ? "referred" : "followup",
    });
    await saveRecord(db.encounters, enc, actor, "create");

    const visit = createRecord<AncVisit>(actor, {
      pregnancy_id: pregnancy.id,
      patient_id: patient.id,
      encounter_id: enc.id,
      visit_date: today,
      gestational_age_weeks: ga,
      weight_kg: num(v.weight_kg),
      systolic: num(v.systolic),
      diastolic: num(v.diastolic),
      fundal_height_cm: num(v.fundal_height_cm),
      fetal_heart_rate: num(v.fetal_heart_rate),
      urine_protein: v.urine_protein || undefined,
      pcv_or_hb: num(v.pcv_or_hb),
      tt_dose_number: num(v.tt_dose_number),
      iptp_dose_number: num(v.iptp_dose_number),
      ifa_given: v.ifa_given,
      danger_signs: dangerSigns,
    });
    await saveRecord(db.ancVisits, visit, actor, "create");

    // Mark the next scheduled contact attended.
    if (nextItem) {
      await saveRecord(
        db.ancScheduleItems,
        { ...nextItem, status: "attended", anc_visit_id: visit.id },
        actor,
        "update",
      );
    }

    // Re-evaluate risk flags with this visit's BP / danger signs.
    const newRisk = computeRiskFlags({
      systolic: num(v.systolic),
      diastolic: num(v.diastolic),
      para: pregnancy.para,
      dangerSigns,
    });
    const merged = Array.from(new Set([...pregnancy.risk_flags, ...newRisk]));
    if (merged.length !== pregnancy.risk_flags.length) {
      await saveRecord(db.pregnancies, { ...pregnancy, risk_flags: merged }, actor, "update");
    }

    setRecording(false);
    onClose();
  }

  return (
    <Modal open title={patient ? `ANC — ${displayName(patient)}` : "ANC"} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-brand-50 px-3 py-2 text-sm">
        <span className="font-semibold text-brand-800">GA {ga} wks · EDD {formatDate(pregnancy.edd)}</span>
        <span className="text-brand-700">LMP {formatDate(pregnancy.lmp)}</span>
        {pregnancy.risk_flags.length > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Risk: {pregnancy.risk_flags.join(", ").replace(/_/g, " ")}
          </span>
        )}
      </div>

      {!recording ? (
        <>
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Contact</th>
                  <th className="px-3 py-2 text-left">Target date</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 font-medium text-slate-700">#{i.contact_number}</td>
                    <td className="px-3 py-2 text-slate-600">{formatDate(i.target_date)}</td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          i.status === "attended"
                            ? "green"
                            : i.status === "missed"
                              ? "red"
                              : i.target_date < today
                                ? "red"
                                : "amber"
                        }
                      >
                        {i.status === "scheduled" && i.target_date < today ? "overdue" : titleCase(i.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {can("anc.manage") && (
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setRecording(true)}>
                Record ANC visit
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Weight kg"><input className="input" value={v.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} /></Field>
            <Field label="Systolic"><input className="input" value={v.systolic} onChange={(e) => set("systolic", e.target.value)} /></Field>
            <Field label="Diastolic"><input className="input" value={v.diastolic} onChange={(e) => set("diastolic", e.target.value)} /></Field>
            <Field label="Fundal ht cm"><input className="input" value={v.fundal_height_cm} onChange={(e) => set("fundal_height_cm", e.target.value)} /></Field>
            <Field label="Fetal HR"><input className="input" value={v.fetal_heart_rate} onChange={(e) => set("fetal_heart_rate", e.target.value)} /></Field>
            <Field label="PCV / Hb"><input className="input" value={v.pcv_or_hb} onChange={(e) => set("pcv_or_hb", e.target.value)} /></Field>
            <Field label="Urine protein"><input className="input" value={v.urine_protein} onChange={(e) => set("urine_protein", e.target.value)} /></Field>
            <Field label="TT dose #"><input className="input" value={v.tt_dose_number} onChange={(e) => set("tt_dose_number", e.target.value)} /></Field>
            <Field label="IPTp dose #"><input className="input" value={v.iptp_dose_number} onChange={(e) => set("iptp_dose_number", e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={v.ifa_given} onChange={(e) => set("ifa_given", e.target.checked)} />
            IFA (iron-folic acid) given
          </label>
          <Field label="Danger signs (comma-separated)" hint="Any entry flags the pregnancy for referral">
            <input className="input" value={v.danger_signs} onChange={(e) => set("danger_signs", e.target.value)} placeholder="e.g. severe headache, bleeding" />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setRecording(false)}>Back</button>
            <button className="btn-primary" onClick={recordVisit}>Save ANC visit</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function addDays(iso: string, days: number): string {
  return toISODate(new Date(new Date(iso + "T00:00:00Z").getTime() + days * 86_400_000));
}
