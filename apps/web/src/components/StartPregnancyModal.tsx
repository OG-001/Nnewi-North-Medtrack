import { useMemo, useState } from "react";
import {
  ANC_MODEL_LABELS,
  computeAncSchedule,
  computeEdd,
  computeRiskFlags,
  gestationalAgeWeeks,
  parseISODate,
  toISODate,
  ageYears,
  type AncModel,
} from "@phc/shared";
import { db } from "../db/db";
import { getAncModelConfig } from "../lib/clinical-config";
import { createRecord, saveRecord } from "../db/repository";
import { useSession } from "../lib/session";
import type { AncScheduleItem, Patient, Pregnancy } from "../db/types";
import { Field, Modal } from "./ui";
import { formatDate } from "../lib/format";

export function StartPregnancyModal({
  open,
  patient,
  onClose,
}: {
  open: boolean;
  patient: Patient;
  onClose: () => void;
}) {
  const { actor } = useSession();
  const [lmp, setLmp] = useState("");
  const [model, setModel] = useState<AncModel>("who_2016_8");
  const [gravida, setGravida] = useState("");
  const [para, setPara] = useState("");
  const [previousCs, setPreviousCs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The ANC contact model is configuration, editable by an admin (Constraint 9).
  // The override applies only when the saved config is for the chosen model.
  const ancConfig = getAncModelConfig();
  const configuredItems = ancConfig.model === model ? ancConfig.items : undefined;

  const preview = useMemo(() => {
    if (!lmp) return null;
    const lmpDate = parseISODate(lmp);
    const edd = computeEdd(lmpDate);
    const ga = gestationalAgeWeeks(lmpDate);
    const contacts = computeAncSchedule(lmpDate, model, configuredItems);
    const risk = computeRiskFlags({
      ageYears: patient.date_of_birth ? ageYears(parseISODate(patient.date_of_birth)) : undefined,
      para: para ? Number(para) : undefined,
      previousCs,
    });
    return { edd, ga, contacts, risk };
  }, [lmp, model, para, previousCs, patient.date_of_birth, configuredItems]);

  async function save() {
    setError(null);
    if (!actor) return;
    if (!lmp) {
      setError("Enter the last menstrual period (LMP).");
      return;
    }
    setBusy(true);
    try {
      const lmpDate = parseISODate(lmp);
      const pregnancy = createRecord<Pregnancy>(actor, {
        patient_id: patient.id,
        lmp,
        edd: toISODate(computeEdd(lmpDate)),
        gravida: gravida ? Number(gravida) : undefined,
        para: para ? Number(para) : undefined,
        anc_model: model,
        risk_flags: preview?.risk ?? [],
        status: "active",
      });
      await saveRecord(db.pregnancies, pregnancy, actor, "create");

      // Generate ANC schedule items from the chosen model.
      for (const c of computeAncSchedule(lmpDate, model, configuredItems)) {
        const item = createRecord<AncScheduleItem>(actor, {
          pregnancy_id: pregnancy.id,
          patient_id: patient.id,
          contact_number: c.contactNumber,
          target_date: toISODate(c.targetDate),
          window_start: toISODate(c.windowStart),
          window_end: toISODate(c.windowEnd),
          status: "scheduled",
        });
        await saveRecord(db.ancScheduleItems, item, actor, "create");
      }

      // Tag the patient as antenatal (capture-once routing).
      if (!patient.category_tags.includes("antenatal")) {
        await saveRecord(
          db.patients,
          { ...patient, category_tags: [...patient.category_tags, "antenatal"] },
          actor,
          "update",
        );
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Start pregnancy / ANC" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="LMP (last menstrual period)" required>
            <input
              type="date"
              className="input"
              max={new Date().toISOString().slice(0, 10)}
              value={lmp}
              onChange={(e) => setLmp(e.target.value)}
            />
          </Field>
          <Field label="ANC model" hint="Editable config (Q3)">
            <select className="input" value={model} onChange={(e) => setModel(e.target.value as AncModel)}>
              {Object.entries(ANC_MODEL_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gravida">
            <input className="input" inputMode="numeric" value={gravida} onChange={(e) => setGravida(e.target.value)} />
          </Field>
          <Field label="Para">
            <input className="input" inputMode="numeric" value={para} onChange={(e) => setPara(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={previousCs} onChange={(e) => setPreviousCs(e.target.checked)} />
          Previous caesarean section
        </label>

        {preview && (
          <div className="rounded-lg bg-brand-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-brand-800">
                EDD: {formatDate(toISODate(preview.edd))} · GA {preview.ga} weeks
              </span>
              {preview.risk.length > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  High risk: {preview.risk.join(", ").replace(/_/g, " ")} → refer
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-brand-700">
              {preview.contacts.length} ANC contacts will be scheduled (first {formatDate(toISODate(preview.contacts[0].targetDate))}).
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? "Creating…" : "Create ANC schedule"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
