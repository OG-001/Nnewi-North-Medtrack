import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { toISODate, type EncounterType } from "@phc/shared";
import { db } from "../db/db";
import { createRecord, saveRecord } from "../db/repository";
import { useSession } from "../lib/session";
import { Badge, Field, Modal, PageHeader } from "../components/ui";
import { IconAlert, IconArrowLeft, IconPlus, IconMaternal, IconSyringe } from "../components/icons";
import { fullName, patientAge, formatDate, titleCase } from "../lib/format";
import type { Encounter, Medication, Patient, QueueEntry } from "../db/types";
import { StartPregnancyModal } from "../components/StartPregnancyModal";

export function PatientDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can, actor } = useSession();
  const [showVisit, setShowVisit] = useState(false);
  const [showPregnancy, setShowPregnancy] = useState(false);
  const [showMedication, setShowMedication] = useState(false);

  const patient = useLiveQuery(() => db.patients.get(id), [id]);
  const encounters = useLiveQuery(
    () => db.encounters.where("patient_id").equals(id).reverse().sortBy("encounter_date"),
    [id],
    [],
  );
  const pregnancies = useLiveQuery(() => db.pregnancies.where("patient_id").equals(id).toArray(), [id], []);
  const doses = useLiveQuery(() => db.immunizationDoses.where("patient_id").equals(id).toArray(), [id], []);
  const referrals = useLiveQuery(() => db.referrals.where("patient_id").equals(id).toArray(), [id], []);
  const medications = useLiveQuery(
    () => db.medications.where("patient_id").equals(id).reverse().sortBy("created_at"),
    [id],
    [],
  );

  const activePregnancy = pregnancies.find((p) => p.status === "active" && !p.deleted_at);
  const givenDoses = doses.filter((d) => d.status === "given").length;
  const dueDoses = doses.filter((d) => d.status !== "given" && d.status !== "not_applicable").length;

  const today = toISODate(new Date());

  async function addToQueue() {
    if (!actor || !patient) return;
    const entry = createRecord<QueueEntry>(actor, {
      patient_id: patient.id,
      queue_date: today,
      service: patient.category_tags.includes("antenatal")
        ? "anc"
        : patient.category_tags.includes("child_u5")
          ? "immunization"
          : "general",
      station: "registration",
      status: "waiting",
      priority: "normal",
      checked_in_at: new Date().toISOString(),
    });
    await saveRecord(db.queueEntries, entry, actor, "create");
    navigate("/queue");
  }

  if (!patient) {
    return (
      <div className="py-20 text-center text-slate-400">Loading patient…</div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <IconArrowLeft width={16} height={16} /> Back
      </button>

      <PageHeader
        title={fullName(patient)}
        subtitle={`${patientAge(patient.date_of_birth)} · ${titleCase(patient.sex)} · ${patient.phone_primary || "no phone"} · MRN ${patient.mrn}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {can("queue.manage") && (
              <button className="btn-secondary" onClick={addToQueue}>
                Add to queue
              </button>
            )}
            {can("emr.write") && (
              <button className="btn-primary" onClick={() => setShowVisit(true)}>
                <IconPlus width={16} height={16} /> Record visit
              </button>
            )}
            {can("prescribe") && (
              <button className="btn-secondary" onClick={() => setShowMedication(true)}>
                <IconPlus width={16} height={16} /> Add medication
              </button>
            )}
          </div>
        }
      />

      {/* Alerts (allergies / chronic conditions) — prominent per Module 2 */}
      {(patient.allergies.length > 0 || patient.chronic_conditions.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <IconAlert width={18} height={18} />
          {patient.allergies.map((a) => (
            <Badge key={a} tone="red">
              Allergy: {a}
            </Badge>
          ))}
          {patient.chronic_conditions.map((c) => (
            <Badge key={c} tone="amber">
              {c}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: demographics + programmes */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Demographics</h3>
            <dl className="space-y-1.5 text-sm">
              <Row k="Address" v={[patient.address_town, patient.ward].filter(Boolean).join(", ") || "—"} />
              <Row k="Next of kin" v={patient.next_of_kin_name ? `${patient.next_of_kin_name} (${patient.next_of_kin_relation || "—"})` : "—"} />
              <Row k="Language" v={patient.preferred_language === "ig" ? "Igbo" : "English"} />
              <Row k="SMS consent" v={patient.sms_consent ? "Yes" : "No"} />
              <Row k="NIN" v={patient.nin || "—"} />
              <Row k="Registered" v={formatDate(patient.created_at)} />
            </dl>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Active programmes</h3>
            <div className="space-y-2">
              {activePregnancy ? (
                <Link to="/maternal" className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 hover:bg-brand-100">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-800">
                    <IconMaternal width={16} height={16} /> ANC — EDD {formatDate(activePregnancy.edd)}
                  </span>
                  {activePregnancy.risk_flags.length > 0 && <Badge tone="red">high risk</Badge>}
                </Link>
              ) : (
                patient.sex === "female" &&
                can("anc.manage") && (
                  <button onClick={() => setShowPregnancy(true)} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-brand-300 hover:bg-brand-50">
                    <IconMaternal width={16} height={16} /> Start pregnancy / ANC
                  </button>
                )
              )}
              {doses.length > 0 && (
                <Link to="/immunization" className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 hover:bg-slate-100">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                    <IconSyringe width={16} height={16} /> Immunization
                  </span>
                  <span className="text-xs text-slate-500">
                    {givenDoses} given · {dueDoses} outstanding
                  </span>
                </Link>
              )}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Medications</h3>
              {can("prescribe") && (
                <button
                  className="text-xs font-medium text-brand-700 hover:underline"
                  onClick={() => setShowMedication(true)}
                >
                  Add
                </button>
              )}
            </div>
            {medications.filter((medication) => !medication.deleted_at).length === 0 ? (
              <p className="text-sm text-slate-400">No medication records.</p>
            ) : (
              <ul className="space-y-3">
                {medications
                  .filter((medication) => !medication.deleted_at)
                  .map((medication) => (
                    <li key={medication.id} className="border-t border-slate-100 pt-2">
                      <p className="text-sm font-medium text-slate-800">{medication.drug_name}</p>
                      <p className="text-xs text-slate-600">
                        {medication.dosage} · {medication.time_to_take}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Recorded {formatDate(medication.created_at)}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {referrals.filter((r) => !r.deleted_at).length > 0 && (
            <div className="card p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Referrals</h3>
              <ul className="space-y-1.5 text-sm">
                {referrals.filter((r) => !r.deleted_at).map((r) => (
                  <li key={r.id} className="text-slate-600">
                    → {r.destination_facility} <span className="text-slate-400">· {r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: encounter timeline */}
        <div className="lg:col-span-2">
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Visit history ({encounters.length})</h3>
            {encounters.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No visits recorded yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {encounters.map((e) => (
                  <EncounterItem key={e.id} e={e} />
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      <Modal open={showVisit} title="Record visit" onClose={() => setShowVisit(false)} wide>
        <RecordVisitForm patient={patient} onDone={() => setShowVisit(false)} />
      </Modal>
      <StartPregnancyModal
        open={showPregnancy}
        patient={patient}
        onClose={() => setShowPregnancy(false)}
      />
      <Modal
        open={showMedication}
        title={`Add medication — ${fullName(patient)}`}
        onClose={() => setShowMedication(false)}
      >
        <AddMedicationForm
          patient={patient}
          onDone={() => setShowMedication(false)}
        />
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right font-medium text-slate-700">{v}</dd>
    </div>
  );
}

const TYPE_TONE: Record<string, "green" | "amber" | "blue" | "slate"> = {
  anc: "amber",
  immunization: "blue",
  general: "green",
  emergency: "amber",
  pnc: "amber",
  outreach: "slate",
};

function EncounterItem({ e }: { e: Encounter }) {
  const vitals = [
    e.temperature_c != null && `${e.temperature_c}°C`,
    e.systolic != null && e.diastolic != null && `${e.systolic}/${e.diastolic} mmHg`,
    e.weight_kg != null && `${e.weight_kg} kg`,
    e.muac_mm != null && `MUAC ${e.muac_mm} mm`,
    e.spo2 != null && `SpO₂ ${e.spo2}%`,
  ].filter(Boolean);
  return (
    <li className="relative">
      <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{formatDate(e.encounter_date)}</span>
        <Badge tone={TYPE_TONE[e.type] ?? "slate"}>{titleCase(e.type)}</Badge>
        {e.outcome && <Badge tone="slate">{titleCase(e.outcome)}</Badge>}
      </div>
      {e.presenting_complaint && <p className="mt-1 text-sm text-slate-700">{e.presenting_complaint}</p>}
      {vitals.length > 0 && <p className="mt-1 text-xs text-slate-500">{vitals.join(" · ")}</p>}
      {e.diagnosis && <p className="mt-1 text-sm"><span className="text-slate-400">Dx:</span> {e.diagnosis}</p>}
      {e.prescription && <p className="text-sm"><span className="text-slate-400">Rx:</span> {e.prescription}</p>}
      {e.notes && <p className="mt-1 text-sm text-slate-600">{e.notes}</p>}
    </li>
  );
}

function RecordVisitForm({ patient, onDone }: { patient: Patient; onDone: () => void }) {
  const { actor, can } = useSession();
  const [type, setType] = useState<EncounterType>("general");
  const [v, setV] = useState({
    presenting_complaint: "",
    temperature_c: "",
    systolic: "",
    diastolic: "",
    pulse: "",
    weight_kg: "",
    height_cm: "",
    muac_mm: "",
    spo2: "",
    diagnosis: "",
    prescription: "",
    notes: "",
    outcome: "treated" as Encounter["outcome"],
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  async function save() {
    if (!actor) return;
    setBusy(true);
    try {
      const enc = createRecord<Encounter>(actor, {
        patient_id: patient.id,
        encounter_date: toISODate(new Date()),
        type,
        attending_user_id: actor.userId,
        presenting_complaint: v.presenting_complaint.trim() || undefined,
        temperature_c: num(v.temperature_c),
        systolic: num(v.systolic),
        diastolic: num(v.diastolic),
        pulse: num(v.pulse),
        weight_kg: num(v.weight_kg),
        height_cm: num(v.height_cm),
        muac_mm: num(v.muac_mm),
        spo2: num(v.spo2),
        diagnosis: can("diagnose") ? v.diagnosis.trim() || undefined : undefined,
        prescription: can("prescribe") ? v.prescription.trim() || undefined : undefined,
        notes: v.notes.trim() || undefined,
        outcome: v.outcome,
      });
      await saveRecord(db.encounters, enc, actor, "create");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Visit type">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as EncounterType)}>
          <option value="general">General</option>
          <option value="anc">Antenatal (ANC)</option>
          <option value="immunization">Immunization</option>
          <option value="pnc">Postnatal (PNC)</option>
          <option value="outreach">Outreach</option>
          <option value="emergency">Emergency</option>
        </select>
      </Field>
      <Field label="Presenting complaint">
        <input className="input" value={v.presenting_complaint} onChange={(e) => set("presenting_complaint", e.target.value)} />
      </Field>

      <div>
        <p className="label">Vitals</p>
        <div className="grid grid-cols-3 gap-2">
          <NumberInput ph="Temp °C" val={v.temperature_c} on={(x) => set("temperature_c", x)} />
          <NumberInput ph="Systolic" val={v.systolic} on={(x) => set("systolic", x)} />
          <NumberInput ph="Diastolic" val={v.diastolic} on={(x) => set("diastolic", x)} />
          <NumberInput ph="Pulse" val={v.pulse} on={(x) => set("pulse", x)} />
          <NumberInput ph="Weight kg" val={v.weight_kg} on={(x) => set("weight_kg", x)} />
          <NumberInput ph="Height cm" val={v.height_cm} on={(x) => set("height_cm", x)} />
          <NumberInput ph="MUAC mm" val={v.muac_mm} on={(x) => set("muac_mm", x)} />
          <NumberInput ph="SpO₂ %" val={v.spo2} on={(x) => set("spo2", x)} />
        </div>
      </div>

      {can("diagnose") && (
        <Field label="Assessment / diagnosis">
          <input className="input" value={v.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} />
        </Field>
      )}
      {can("prescribe") && (
        <Field label="Prescription / treatment">
          <input className="input" value={v.prescription} onChange={(e) => set("prescription", e.target.value)} />
        </Field>
      )}
      <Field label="Clinical notes">
        <textarea className="input min-h-[72px]" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <Field label="Outcome">
        <select className="input" value={v.outcome} onChange={(e) => set("outcome", e.target.value as Encounter["outcome"])}>
          <option value="treated">Treated</option>
          <option value="referred">Referred</option>
          <option value="admitted">Admitted</option>
          <option value="followup">Follow-up</option>
        </select>
      </Field>

      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onDone}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save visit"}
        </button>
      </div>
    </div>
  );
}

function NumberInput({ ph, val, on }: { ph: string; val: string; on: (v: string) => void }) {
  return (
    <input
      className="input"
      inputMode="decimal"
      placeholder={ph}
      value={val}
      onChange={(e) => on(e.target.value)}
    />
  );
}

function AddMedicationForm({ patient, onDone }: { patient: Patient; onDone: () => void }) {
  const { actor } = useSession();
  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [timeToTake, setTimeToTake] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!actor) return;
    setBusy(true);
    setError(null);
    try {
      const medication = createRecord<Medication>(actor, {
        patient_id: patient.id,
        drug_name: drugName.trim(),
        dosage: dosage.trim(),
        time_to_take: timeToTake.trim(),
      });
      await saveRecord(db.medications, medication, actor, "create");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save medication.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Medication name" required>
        <input
          className="input"
          value={drugName}
          maxLength={200}
          onChange={(event) => setDrugName(event.target.value)}
          required
        />
      </Field>
      <Field label="Dosage" required>
        <input
          className="input"
          value={dosage}
          maxLength={500}
          onChange={(event) => setDosage(event.target.value)}
          required
        />
      </Field>
      <Field label="Time to take" required>
        <input
          className="input"
          value={timeToTake}
          maxLength={500}
          onChange={(event) => setTimeToTake(event.target.value)}
          required
        />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        Enter the medication instructions provided by the prescribing clinician.
      </p>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onDone}>Cancel</button>
        <button
          className="btn-primary"
          onClick={save}
          disabled={busy || !drugName.trim() || !dosage.trim() || !timeToTake.trim()}
        >
          {busy ? "Saving…" : "Save medication"}
        </button>
      </div>
    </div>
  );
}
