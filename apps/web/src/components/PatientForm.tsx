import { useMemo, useState } from "react";
import { generateMrn, type Language, type Sex } from "@phc/shared";
import { db } from "../db/db";
import { createRecord, saveRecord } from "../db/repository";
import { useSession } from "../lib/session";
import type { Patient } from "../db/types";
import { Field } from "./ui";
import { displayName, patientAge } from "../lib/format";

interface DuplicateMatch {
  patient: Patient;
  reasons: string[];
}

/** Likely-duplicate detection at point of registration (Module 1 acceptance). */
function findDuplicates(
  candidates: Patient[],
  input: { first_name: string; last_name: string; phone: string; dob: string | null },
): DuplicateMatch[] {
  const phone = input.phone.replace(/\s+/g, "");
  const ln = input.last_name.trim().toLowerCase();
  const fn = input.first_name.trim().toLowerCase();
  const matches: DuplicateMatch[] = [];
  for (const p of candidates) {
    if (p.deleted_at) continue;
    const reasons: string[] = [];
    if (phone && p.phone_primary && p.phone_primary.replace(/\s+/g, "") === phone)
      reasons.push("same phone");
    const nameMatch =
      p.last_name.toLowerCase() === ln && p.first_name.toLowerCase() === fn && ln.length > 0;
    if (nameMatch) reasons.push("same name");
    if (nameMatch && input.dob && p.date_of_birth === input.dob) reasons.push("same date of birth");
    // Surface if phone matches, or name matches strongly.
    if (reasons.includes("same phone") || (nameMatch && reasons.length >= 1)) {
      matches.push({ patient: p, reasons });
    }
  }
  return matches.slice(0, 5);
}

const emptyForm = {
  first_name: "",
  last_name: "",
  other_names: "",
  sex: "female" as Sex,
  date_of_birth: "",
  dob_estimated: false,
  age_years: "",
  phone_primary: "",
  phone_alt: "",
  address_town: "",
  ward: "",
  next_of_kin_name: "",
  next_of_kin_phone: "",
  next_of_kin_relation: "",
  occupation: "",
  preferred_language: "en" as Language,
  sms_consent: true,
  nin: "",
};

export function PatientForm({
  allPatients,
  onCreated,
  onCancel,
  prefill,
}: {
  allPatients: Patient[];
  onCreated: (p: Patient) => void;
  onCancel: () => void;
  prefill?: Partial<typeof emptyForm>;
}) {
  const { actor, facilityId } = useSession();
  const [form, setForm] = useState({ ...emptyForm, ...prefill });
  const [error, setError] = useState<string | null>(null);
  const [ignoredDuplicates, setIgnoredDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const dob = useMemo(() => {
    if (form.date_of_birth) return form.date_of_birth;
    if (form.age_years && Number(form.age_years) >= 0) {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - Number(form.age_years));
      return d.toISOString().slice(0, 10);
    }
    return null;
  }, [form.date_of_birth, form.age_years]);

  const duplicates = useMemo(
    () =>
      form.last_name.length >= 2 || form.phone_primary.length >= 6
        ? findDuplicates(allPatients, {
            first_name: form.first_name,
            last_name: form.last_name,
            phone: form.phone_primary,
            dob,
          })
        : [],
    [allPatients, form.first_name, form.last_name, form.phone_primary, dob],
  );

  const ninValid = !form.nin || /^\d{11}$/.test(form.nin);

  async function submit() {
    setError(null);
    if (!actor || !facilityId) return;
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First and last name are required.");
      return;
    }
    if (!dob) {
      setError("Enter a date of birth or an estimated age.");
      return;
    }
    if (!ninValid) {
      setError("NIN must be 11 digits (or left blank).");
      return;
    }
    if (duplicates.length > 0 && !ignoredDuplicates) {
      setError("Possible duplicate(s) found — choose an existing record or confirm Create anyway.");
      return;
    }
    setBusy(true);
    try {
      const facility = await db.facilities.get(facilityId);
      const draft = createRecord<Patient>(actor, {
        mrn: "", // filled after id is known
        home_facility_id: facilityId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        other_names: form.other_names.trim() || undefined,
        sex: form.sex,
        date_of_birth: dob,
        dob_estimated: !form.date_of_birth && !!form.age_years,
        phone_primary: form.phone_primary.trim(),
        phone_alt: form.phone_alt.trim() || undefined,
        address_town: form.address_town.trim() || undefined,
        ward: form.ward.trim() || undefined,
        next_of_kin_name: form.next_of_kin_name.trim() || undefined,
        next_of_kin_phone: form.next_of_kin_phone.trim() || undefined,
        next_of_kin_relation: form.next_of_kin_relation.trim() || undefined,
        occupation: form.occupation.trim() || undefined,
        preferred_language: form.preferred_language,
        sms_consent: form.sms_consent,
        nin: form.nin.trim() || undefined,
        status: "active",
        category_tags: [],
        allergies: [],
        chronic_conditions: [],
      });
      draft.mrn = generateMrn(facility?.code ?? "PHC", draft.id);
      const saved = await saveRecord(db.patients, draft, actor, "create");
      onCreated(saved);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {duplicates.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-800">
            Possible existing record{duplicates.length > 1 ? "s" : ""} — avoid duplicates
          </p>
          <ul className="mt-2 space-y-1">
            {duplicates.map((d) => (
              <li key={d.patient.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium text-slate-800">{displayName(d.patient)}</span>{" "}
                  <span className="text-slate-500">
                    · {patientAge(d.patient.date_of_birth)} · {d.patient.phone_primary || "no phone"} · {d.patient.mrn}
                  </span>
                  <span className="ml-1 text-xs text-amber-700">({d.reasons.join(", ")})</span>
                </span>
                <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => onCreated(d.patient)}>
                  Use this
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2 text-xs text-amber-800">
            <input
              type="checkbox"
              checked={ignoredDuplicates}
              onChange={(e) => setIgnoredDuplicates(e.target.checked)}
            />
            None of these — create a new record anyway
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required>
          <input className="input" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
        </Field>
        <Field label="Last name" required>
          <input className="input" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
        </Field>
        <Field label="Other names">
          <input className="input" value={form.other_names} onChange={(e) => set("other_names", e.target.value)} />
        </Field>
        <Field label="Sex" required>
          <select className="input" value={form.sex} onChange={(e) => set("sex", e.target.value as Sex)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </Field>
        <Field label="Date of birth">
          <input
            type="date"
            className="input"
            value={form.date_of_birth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set("date_of_birth", e.target.value)}
          />
        </Field>
        <Field label="…or estimated age (yrs)" hint="Used when exact DOB is unknown">
          <input
            type="number"
            min={0}
            className="input"
            value={form.age_years}
            disabled={!!form.date_of_birth}
            onChange={(e) => set("age_years", e.target.value)}
          />
        </Field>
        <Field label="Phone (primary / SMS)">
          <input
            className="input"
            inputMode="tel"
            placeholder="+234…"
            value={form.phone_primary}
            onChange={(e) => set("phone_primary", e.target.value)}
          />
        </Field>
        <Field label="Alt. phone">
          <input className="input" value={form.phone_alt} onChange={(e) => set("phone_alt", e.target.value)} />
        </Field>
        <Field label="Town / village">
          <input className="input" value={form.address_town} onChange={(e) => set("address_town", e.target.value)} />
        </Field>
        <Field label="Ward">
          <input className="input" value={form.ward} onChange={(e) => set("ward", e.target.value)} />
        </Field>
        <Field label="Next of kin">
          <input className="input" value={form.next_of_kin_name} onChange={(e) => set("next_of_kin_name", e.target.value)} />
        </Field>
        <Field label="Next of kin phone">
          <input className="input" value={form.next_of_kin_phone} onChange={(e) => set("next_of_kin_phone", e.target.value)} />
        </Field>
        <Field label="Occupation">
          <input className="input" value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
        </Field>
        <Field label="Preferred language" hint="Drives SMS template language">
          <select
            className="input"
            value={form.preferred_language}
            onChange={(e) => set("preferred_language", e.target.value as Language)}
          >
            <option value="en">English</option>
            <option value="ig">Igbo</option>
          </select>
        </Field>
        <Field label="NIN (optional)" hint="11 digits; never required">
          <input className="input" inputMode="numeric" value={form.nin} onChange={(e) => set("nin", e.target.value)} />
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.sms_consent} onChange={(e) => set("sms_consent", e.target.checked)} />
            Consent to SMS reminders
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Register patient"}
        </button>
      </div>
    </div>
  );
}
