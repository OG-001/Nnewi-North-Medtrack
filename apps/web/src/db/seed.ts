/**
 * Demo seed — gives the pilot a realistic starting dataset so dashboards and
 * reports are non-empty.
 *
 * Facilities: the full Nnewi North LGA registry (all ~76 health facilities) is
 * seeded so the door screen can list every PHC alphabetically. Two real public
 * PHCs are provisioned with demo staff + clinical data to demonstrate per-facility
 * isolation; the rest start empty (only LGA/system oversight roles can enter them
 * until an admin provisions staff). Seeded rows represent data already synced from
 * the hub (no outbox entries), so the app opens in a "Synced" state.
 */
import {
  computeAncSchedule,
  computeChildSchedule,
  computeEdd,
  computeRiskFlags,
  gestationalAgeWeeks,
  generateMrn,
  newId,
  toISODate,
  NNEWI_NORTH_FACILITIES,
  nationalFacilityCode,
  shortFacilityCode,
  facilityArea,
  facilityId as registryFacilityId,
  type Role,
} from "@phc/shared";
import { db } from "./db";
import { getDeviceId } from "../lib/device";
import type {
  AncScheduleItem,
  BaseRecord,
  Facility,
  ImmunizationDose,
  Patient,
  Pregnancy,
  QueueEntry,
  UserAccount,
} from "./types";

const SEED_USER = "seed-system";

/** Bump when the seed shape changes; triggers a one-time local reseed. */
const SEED_VERSION = "2";
const LS_SEED_VERSION = "phc-track.seed_version";
const LS_KEYS_TO_RESET = [
  "phc-track.session_user",
  "phc-track.session_facility",
  "phc-track.selected_facility",
];

function base(facilityId: string, id = newId()): BaseRecord {
  const ts = new Date().toISOString();
  return {
    id,
    facility_id: facilityId,
    created_at: ts,
    created_by: SEED_USER,
    updated_at: ts,
    updated_by: SEED_USER,
    rev: 1,
    deleted_at: null,
    origin_device_id: getDeviceId(),
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

// Two real public PHCs from the registry used as the provisioned demo facilities.
const CENTRAL_NUMBER = "0062"; // Primary Health Centre Umuenem Otolo Nnewi
const SECOND_NUMBER = "0060"; // Obiagu Health Post, Uruagu, Nnewi
export const SEEDED_FACILITY_ID = `fac-${CENTRAL_NUMBER}`;

export async function seedIfEmpty(): Promise<void> {
  const seededVersion = localStorage.getItem(LS_SEED_VERSION);
  const hasData = (await db.facilities.count()) > 0;

  if (seededVersion === SEED_VERSION && hasData) return;

  // Schema/seed changed (or facilities were seeded under an older shape):
  // wipe local demo data and reseed so facility ids/codes stay consistent.
  if (hasData) {
    await Promise.all(db.tables.map((t) => t.clear()));
    LS_KEYS_TO_RESET.forEach((k) => localStorage.removeItem(k));
  }

  // ---- Facilities: the full LGA registry ----
  const facilities: Facility[] = NNEWI_NORTH_FACILITIES.map((e) => {
    const id = registryFacilityId(e);
    const isDemoCentral = e.number === CENTRAL_NUMBER;
    return {
      ...base(id, id),
      code: shortFacilityCode(e),
      name: e.name,
      type:
        e.facilityType === "secondary"
          ? "referral"
          : isDemoCentral
            ? "model_phc"
            : "phc",
      facility_type: e.facilityType,
      ownership: e.ownership,
      national_code: nationalFacilityCode(e),
      facility_number: e.number,
      ward: facilityArea(e.name),
      town: "Nnewi",
      lga: "Nnewi North",
      state: "Anambra",
      active: true,
    };
  });
  await db.facilities.bulkPut(facilities);

  const central = facilities.find((f) => f.facility_number === CENTRAL_NUMBER)!;
  const second = facilities.find((f) => f.facility_number === SECOND_NUMBER)!;

  // ---- Staff accounts ----
  // Clinical roles are scoped to a SINGLE facility (this is what prevents a user
  // from one PHC signing in at another). LGA/system oversight roles span the LGA.
  const mkUser = (
    id: string,
    full_name: string,
    username: string,
    roles: Role[],
    pin: string,
    facility_ids: string[],
  ): UserAccount => ({
    ...base(facility_ids[0], id),
    full_name,
    username,
    pin,
    phone: "+2348030000000",
    status: "active",
    roles,
    facility_ids,
    last_login_at: null,
  });

  const clinicalStaffFor = (f: Facility, suffix: string): UserAccount[] => [
    mkUser(`u-clerk-${suffix}`, "Adaeze Okonkwo", "clerk", ["records_clerk"], "1111", [f.id]),
    mkUser(`u-nurse-${suffix}`, "Ngozi Eze", "nurse", ["nurse_midwife"], "2222", [f.id]),
    mkUser(`u-chew-${suffix}`, "Emeka Nwosu", "chew", ["chew"], "3333", [f.id]),
    mkUser(`u-doctor-${suffix}`, "Dr. Chidi Obi", "doctor", ["doctor_mo"], "4444", [f.id]),
    mkUser(`u-admin-${suffix}`, "Mrs. Ifeoma Udeh", "admin", ["facility_admin"], "5555", [f.id]),
  ];

  const allFacilityIds = facilities.map((f) => f.id);
  await db.users.bulkPut([
    ...clinicalStaffFor(central, central.facility_number!),
    ...clinicalStaffFor(second, second.facility_number!),
    // Oversight roles: can enter any facility (data-scope still applies per role).
    mkUser("u-lga", "Mr. Tochukwu M&E", "lga", ["lga_authority"], "6666", allFacilityIds),
    mkUser("u-sys", "System Admin", "sysadmin", ["system_admin"], "0000", allFacilityIds),
  ]);

  const patients: Patient[] = [];
  const pregnancies: Pregnancy[] = [];
  const ancItems: AncScheduleItem[] = [];
  const doses: ImmunizationDose[] = [];
  const queue: QueueEntry[] = [];

  const mkPatient = (
    fac: Facility,
    p: Partial<Patient> & Pick<Patient, "first_name" | "last_name" | "sex">,
  ): Patient => {
    const id = newId();
    return {
      ...base(fac.id, id),
      mrn: generateMrn(fac.code, id),
      home_facility_id: fac.id,
      ...p,
      date_of_birth: p.date_of_birth ?? null,
      dob_estimated: p.dob_estimated ?? false,
      phone_primary: p.phone_primary ?? "",
      preferred_language: p.preferred_language ?? "en",
      sms_consent: p.sms_consent ?? true,
      status: "active",
      category_tags: p.category_tags ?? [],
      allergies: p.allergies ?? [],
      chronic_conditions: p.chronic_conditions ?? [],
    } as Patient;
  };

  const fid = central.id;

  // ---- Pregnant women with ANC schedules (central facility) ----
  const mothers: Array<{ name: [string, string]; phone: string; lmpDaysAgo: number; age: number; para: number }> = [
    { name: ["Chiamaka", "Nwankwo"], phone: "+2348031111111", lmpDaysAgo: 168, age: 27, para: 1 },
    { name: ["Adaobi", "Okeke"], phone: "+2348032222222", lmpDaysAgo: 210, age: 36, para: 5 },
    { name: ["Uchenna", "Maduike"], phone: "+2348033333333", lmpDaysAgo: 98, age: 22, para: 0 },
  ];
  for (const m of mothers) {
    const dob = daysAgo(m.age * 365);
    const patient = mkPatient(central, {
      first_name: m.name[0],
      last_name: m.name[1],
      sex: "female",
      date_of_birth: toISODate(dob),
      phone_primary: m.phone,
      category_tags: ["antenatal"],
    });
    patients.push(patient);
    const lmp = daysAgo(m.lmpDaysAgo);
    const risk = computeRiskFlags({ ageYears: m.age, para: m.para });
    const preg: Pregnancy = {
      ...base(fid),
      patient_id: patient.id,
      lmp: toISODate(lmp),
      edd: toISODate(computeEdd(lmp)),
      gravida: m.para + 1,
      para: m.para,
      anc_model: "who_2016_8",
      risk_flags: risk,
      status: "active",
    };
    pregnancies.push(preg);
    const ga = gestationalAgeWeeks(lmp);
    for (const c of computeAncSchedule(lmp, "who_2016_8")) {
      ancItems.push({
        ...base(fid),
        pregnancy_id: preg.id,
        patient_id: patient.id,
        contact_number: c.contactNumber,
        target_date: toISODate(c.targetDate),
        window_start: toISODate(c.windowStart),
        window_end: toISODate(c.windowEnd),
        status:
          c.targetGaWeeks < ga - 3
            ? c.contactNumber % 3 === 0
              ? "missed"
              : "attended"
            : "scheduled",
      });
    }
  }

  // ---- Children with EPI immunization records (central facility) ----
  const children: Array<{ name: [string, string]; ageDays: number; phone: string }> = [
    { name: ["Baby", "Nwankwo"], ageDays: 75, phone: "+2348031111111" },
    { name: ["Somto", "Okafor"], ageDays: 200, phone: "+2348034444444" },
    { name: ["Chetachi", "Anyaegbu"], ageDays: 320, phone: "+2348035555555" },
    { name: ["Ebube", "Ilo"], ageDays: 30, phone: "+2348036666666" },
  ];
  for (const ch of children) {
    const dob = daysAgo(ch.ageDays);
    const patient = mkPatient(central, {
      first_name: ch.name[0],
      last_name: ch.name[1],
      sex: Math.random() > 0.5 ? "female" : "male",
      date_of_birth: toISODate(dob),
      phone_primary: ch.phone,
      category_tags: ["child_u5"],
    });
    patients.push(patient);
    for (const d of computeChildSchedule(dob)) {
      const isPast = d.dueDate.getTime() < Date.now();
      const given = isPast && Math.random() > 0.25;
      doses.push({
        ...base(fid),
        patient_id: patient.id,
        schedule_item_id: d.scheduleItemId,
        antigen: d.antigen,
        dose_label: d.doseLabel,
        status: given ? "given" : isPast ? "missed" : "due",
        due_date: toISODate(d.dueDate),
        given_date: given ? toISODate(d.dueDate) : undefined,
        batch_lot: given ? `LOT-${Math.floor(Math.random() * 9000 + 1000)}` : undefined,
        given_by: given ? "u-nurse" : undefined,
      });
    }
  }

  // ---- A couple of general patients (central facility) ----
  patients.push(
    mkPatient(central, {
      first_name: "Obinna",
      last_name: "Eze",
      sex: "male",
      date_of_birth: toISODate(daysAgo(42 * 365)),
      phone_primary: "+2348037777777",
      chronic_conditions: ["Hypertension"],
      allergies: ["Penicillin"],
    }),
    mkPatient(central, {
      first_name: "Ngozi",
      last_name: "Aniefuna",
      sex: "female",
      date_of_birth: toISODate(daysAgo(58 * 365)),
      phone_primary: "+2348038888888",
    }),
  );

  // ---- A small, DISTINCT dataset at the second facility ----
  // (so signing in there shows different patients — demonstrating isolation).
  const secondPatients = [
    mkPatient(second, {
      first_name: "Ifeoma",
      last_name: "Okwara",
      sex: "female",
      date_of_birth: toISODate(daysAgo(31 * 365)),
      phone_primary: "+2348039999991",
      category_tags: ["antenatal"],
    }),
    mkPatient(second, {
      first_name: "Kelechi",
      last_name: "Umeh",
      sex: "male",
      date_of_birth: toISODate(daysAgo(3 * 365)),
      phone_primary: "+2348039999992",
      category_tags: ["child_u5"],
    }),
  ];
  patients.push(...secondPatients);

  // ---- Today's queue (central) ----
  const today = toISODate(new Date());
  const queuePick = patients.filter((p) => p.facility_id === fid).slice(0, 5);
  queuePick.forEach((p, i) => {
    queue.push({
      ...base(fid),
      patient_id: p.id,
      queue_date: today,
      service: p.category_tags.includes("antenatal")
        ? "anc"
        : p.category_tags.includes("child_u5")
          ? "immunization"
          : "general",
      station: i === 0 ? "consultation" : i === 1 ? "vitals" : "registration",
      status: i === 0 ? "in_progress" : "waiting",
      priority: i === 2 ? "priority" : "normal",
      checked_in_at: new Date(Date.now() - (5 - i) * 600_000).toISOString(),
      started_at: i === 0 ? new Date(Date.now() - 300_000).toISOString() : undefined,
    });
  });

  await db.patients.bulkPut(patients);
  await db.pregnancies.bulkPut(pregnancies);
  await db.ancScheduleItems.bulkPut(ancItems);
  await db.immunizationDoses.bulkPut(doses);
  await db.queueEntries.bulkPut(queue);

  await db.syncMeta.put({
    key: "meta",
    server_seq_watermark: 0,
    last_sync_at: new Date().toISOString(),
    device_id: getDeviceId(),
  });

  localStorage.setItem(LS_SEED_VERSION, SEED_VERSION);
}
