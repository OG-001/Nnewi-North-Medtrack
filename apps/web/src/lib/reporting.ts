/**
 * Reporting engine — computes NHMIS-aligned monthly figures from source rows
 * (data-model §5). Every figure traces to underlying records (auditable).
 * Pure function so it can move to the NestJS hub unchanged in Phase 8.
 */
import { ageYears, parseISODate } from "@phc/shared";
import type {
  AncVisit,
  Delivery,
  Encounter,
  ImmunizationDose,
  Patient,
  Pregnancy,
  Referral,
} from "../db/types";

export interface ReportInput {
  year: number;
  month: number; // 1-12
  patients: Patient[];
  encounters: Encounter[];
  pregnancies: Pregnancy[];
  ancVisits: AncVisit[];
  deliveries: Delivery[];
  doses: ImmunizationDose[];
  referrals: Referral[];
}

export interface ReportFigure {
  key: string;
  label: string;
  value: number;
  group: string;
}

function inMonth(iso: string | null | undefined, year: number, month: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
}

export function computeMonthlyReport(input: ReportInput): ReportFigure[] {
  const { year, month } = input;
  const figs: ReportFigure[] = [];
  const add = (group: string, key: string, label: string, value: number) =>
    figs.push({ group, key, label, value });

  // ---- Registrations ----
  const newPatients = input.patients.filter((p) => inMonth(p.created_at, year, month));
  add("Registrations", "new_patients", "New patients registered", newPatients.length);
  add(
    "Registrations",
    "new_under5",
    "New under-5s",
    newPatients.filter((p) => p.date_of_birth && ageYears(parseISODate(p.date_of_birth)) < 5).length,
  );
  add(
    "Registrations",
    "new_pregnancies",
    "New pregnancies",
    input.pregnancies.filter((p) => inMonth(p.created_at, year, month)).length,
  );

  // ---- OPD / attendance ----
  const monthEnc = input.encounters.filter((e) => inMonth(e.encounter_date, year, month));
  add("OPD / Attendance", "attendances_total", "Total attendances", monthEnc.length);
  add("OPD / Attendance", "attendances_general", "General attendances", monthEnc.filter((e) => e.type === "general").length);
  add("OPD / Attendance", "attendances_emergency", "Emergency attendances", monthEnc.filter((e) => e.type === "emergency").length);

  // ---- ANC ----
  const monthAnc = input.ancVisits.filter((v) => inMonth(v.visit_date, year, month));
  add("ANC", "anc_visits", "ANC visits (all)", monthAnc.length);
  add("ANC", "anc_tt", "TT doses given", monthAnc.filter((v) => v.tt_dose_number != null).length);
  add("ANC", "anc_iptp", "IPTp doses given", monthAnc.filter((v) => v.iptp_dose_number != null).length);
  add("ANC", "anc_ifa", "IFA supplemented", monthAnc.filter((v) => v.ifa_given).length);
  add("ANC", "anc_danger", "Danger signs / high-risk identified", monthAnc.filter((v) => v.danger_signs.length > 0).length);

  // ---- Delivery ----
  const monthDel = input.deliveries.filter((d) => inMonth(d.delivery_date, year, month));
  add("Delivery", "deliveries", "Deliveries", monthDel.length);
  add("Delivery", "live_births", "Live births", monthDel.filter((d) => d.outcome === "live_birth").length);
  add("Delivery", "still_births", "Still births", monthDel.filter((d) => d.outcome === "still_birth").length);

  // ---- Immunization (doses given in month, by antigen) ----
  const monthDoses = input.doses.filter((d) => d.status === "given" && inMonth(d.given_date, year, month));
  const antigenCounts = new Map<string, number>();
  for (const d of monthDoses) antigenCounts.set(d.dose_label, (antigenCounts.get(d.dose_label) ?? 0) + 1);
  const keyAntigens: Array<[string, string]> = [
    ["BCG", "imm_bcg"],
    ["Penta 1", "imm_penta1"],
    ["Penta 3", "imm_penta3"],
    ["Measles 1 (MCV1)", "imm_measles1"],
    ["Yellow Fever", "imm_yf"],
  ];
  for (const [label, key] of keyAntigens) {
    add("Immunization", key, `${label} given`, antigenCounts.get(label) ?? 0);
  }
  add("Immunization", "imm_total", "Total doses given", monthDoses.length);

  // Penta1→Measles1 dropout (coverage quality, computed over all given doses).
  const givenAll = input.doses.filter((d) => d.status === "given");
  const penta1 = givenAll.filter((d) => d.dose_label === "Penta 1").length;
  const measles1 = givenAll.filter((d) => d.dose_label === "Measles 1 (MCV1)").length;
  const dropout = penta1 > 0 ? Math.round(((penta1 - measles1) / penta1) * 100) : 0;
  add("Immunization", "penta1_measles1_dropout_pct", "Penta1→Measles1 dropout (%)", dropout);

  // ---- Referrals ----
  add(
    "Referrals",
    "referrals_out",
    "Out-referrals",
    input.referrals.filter((r) => inMonth(r.created_at, year, month)).length,
  );

  return figs;
}

export function figuresToCsv(figs: ReportFigure[], meta: { facility: string; year: number; month: number }): string {
  const lines = [`# PHC-Track monthly report`, `# Facility,${meta.facility}`, `# Period,${meta.year}-${String(meta.month).padStart(2, "0")}`, ``, `Group,Data element,Key,Value`];
  for (const f of figs) {
    lines.push(`${f.group},"${f.label}",${f.key},${f.value}`);
  }
  return lines.join("\n");
}

/** Minimal DHIS2-style import payload (data-model §5; mapping confirmed in Q4). */
export function figuresToDhis2(figs: ReportFigure[], meta: { facilityCode: string; year: number; month: number }) {
  return {
    period: `${meta.year}${String(meta.month).padStart(2, "0")}`,
    orgUnit: meta.facilityCode,
    dataValues: figs.map((f) => ({ dataElement: f.key, value: f.value })),
    _note: "Map dataElement keys to DHIS2 UIDs per LGA config (Open question Q4).",
  };
}
