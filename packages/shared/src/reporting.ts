/**
 * NHMIS monthly reporting engine (phase-8-reporting-analytics.md).
 *
 * This lives in the shared package because both sides compute figures: the PWA
 * shows a facility its own month offline, and the hub generates the report that
 * gets locked, exported to DHIS2, and rolled up across the LGA. Two
 * implementations would eventually disagree, and a facility figure that does not
 * match the LGA figure is exactly the kind of discrepancy that destroys trust in
 * a reporting system.
 *
 * Every figure carries the ids of the records behind it, so a number can always
 * be traced to the rows that produced it (task 3, drill-down). Reporting itself
 * reads aggregates only: an export never carries an identifiable patient row.
 *
 * Input records are structural, not Dexie or Prisma types, so the engine has no
 * dependency in either direction.
 */

// ---- Input shapes ----

/** The common columns the engine relies on. */
export interface ReportableRecord {
  id: string;
  facility_id: string;
  created_at: string;
  deleted_at?: string | null;
}

export interface ReportPatient extends ReportableRecord {
  date_of_birth?: string | null;
}

export interface ReportEncounter extends ReportableRecord {
  encounter_date: string;
  type: string;
}

export interface ReportPregnancy extends ReportableRecord {
  patient_id: string;
}

export interface ReportAncVisit extends ReportableRecord {
  pregnancy_id: string;
  patient_id: string;
  visit_date: string;
  tt_dose_number?: number | null;
  iptp_dose_number?: number | null;
  ifa_given?: boolean;
  danger_signs?: string[];
}

export interface ReportDelivery extends ReportableRecord {
  delivery_date: string;
  outcome: string;
  place?: string;
}

export interface ReportImmunizationDose extends ReportableRecord {
  patient_id: string;
  antigen?: string;
  dose_label: string;
  status: string;
  given_date?: string | null;
}

export interface ReportReferral extends ReportableRecord {
  patient_id: string;
}

export interface ReportInput {
  year: number;
  /** 1 to 12. */
  month: number;
  patients: ReportPatient[];
  encounters: ReportEncounter[];
  pregnancies: ReportPregnancy[];
  ancVisits: ReportAncVisit[];
  deliveries: ReportDelivery[];
  doses: ReportImmunizationDose[];
  referrals: ReportReferral[];
}

// ---- Output shapes ----

export interface ReportFigure {
  key: string;
  label: string;
  value: number;
  group: string;
  /**
   * Ids of the records this figure counted, for drill-down.
   *
   * Empty for a derived figure such as a percentage, whose provenance is the
   * two figures it divides rather than a row set. `derivedFrom` names those.
   */
  sourceIds: string[];
  derivedFrom?: string[];
  /** Set where the definition is a documented proxy rather than a raw count. */
  note?: string;
}

export const REPORT_GROUPS = [
  "Registrations",
  "OPD / Attendance",
  "ANC",
  "Delivery",
  "Immunization",
  "Referrals",
] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

// ---- Helpers ----

/** Month membership by UTC, so a device timezone cannot move a figure. */
function inMonth(iso: string | null | undefined, year: number, month: number): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month;
}

/** Soft-deleted rows never contribute to a figure. */
function live<T extends ReportableRecord>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted_at);
}

function ageInYears(dob: string, asOf: Date): number {
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return Number.NaN;
  let years = asOf.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < born.getUTCDate())) years -= 1;
  return years;
}

/** Antigens counted toward a fully immunized child. See FIC_NOTE. */
export const FIC_REQUIRED_LABELS = ["BCG", "Penta 3", "Measles 1 (MCV1)"];

const FIC_NOTE =
  "Proxy: a child with BCG, Penta 3 and Measles 1 recorded as given. Confirm " +
  "against the current NPHCDA definition before the pilot (relates to Q2).";

// ---- The engine ----

export function computeMonthlyReport(input: ReportInput): ReportFigure[] {
  const { year, month } = input;
  // End of the reporting month, for age-at-report calculations.
  const asOf = new Date(Date.UTC(year, month, 0));

  const figures: ReportFigure[] = [];
  const add = (
    group: ReportGroup,
    key: string,
    label: string,
    rows: { id: string }[],
    note?: string,
  ) => {
    figures.push({ group, key, label, value: rows.length, sourceIds: rows.map((r) => r.id), note });
  };
  const addDerived = (
    group: ReportGroup,
    key: string,
    label: string,
    value: number,
    derivedFrom: string[],
    note?: string,
  ) => {
    figures.push({ group, key, label, value, sourceIds: [], derivedFrom, note });
  };

  // ---- Registrations ----
  const patients = live(input.patients);
  const newPatients = patients.filter((p) => inMonth(p.created_at, year, month));
  add("Registrations", "new_patients", "New patients registered", newPatients);
  add(
    "Registrations",
    "new_under5",
    "New under-5s registered",
    newPatients.filter((p) => {
      if (!p.date_of_birth) return false;
      const age = ageInYears(p.date_of_birth, asOf);
      return !Number.isNaN(age) && age < 5;
    }),
  );
  const newPregnancies = live(input.pregnancies).filter((p) => inMonth(p.created_at, year, month));
  add("Registrations", "new_pregnancies", "New pregnancies registered", newPregnancies);

  // ---- OPD and attendance ----
  const monthEncounters = live(input.encounters).filter((e) =>
    inMonth(e.encounter_date, year, month),
  );
  add("OPD / Attendance", "attendances_total", "Total attendances", monthEncounters);
  add(
    "OPD / Attendance",
    "attendances_general",
    "General attendances",
    monthEncounters.filter((e) => e.type === "general"),
  );
  add(
    "OPD / Attendance",
    "attendances_emergency",
    "Emergency attendances",
    monthEncounters.filter((e) => e.type === "emergency"),
  );

  // ---- ANC ----
  const allAnc = live(input.ancVisits);
  const monthAnc = allAnc.filter((v) => inMonth(v.visit_date, year, month));
  add("ANC", "anc_visits", "ANC visits (all contacts)", monthAnc);

  // ANC1 and ANC4+ are contact-ordinal figures: which visit number this was for
  // that pregnancy, counted across its whole history rather than the month.
  const byPregnancy = new Map<string, ReportAncVisit[]>();
  for (const visit of allAnc) {
    const list = byPregnancy.get(visit.pregnancy_id) ?? [];
    list.push(visit);
    byPregnancy.set(visit.pregnancy_id, list);
  }
  const anc1: ReportAncVisit[] = [];
  const anc4plus: ReportAncVisit[] = [];
  for (const visits of byPregnancy.values()) {
    const ordered = [...visits].sort((a, b) => a.visit_date.localeCompare(b.visit_date));
    ordered.forEach((visit, index) => {
      if (!inMonth(visit.visit_date, year, month)) return;
      if (index === 0) anc1.push(visit);
      if (index >= 3) anc4plus.push(visit);
    });
  }
  add("ANC", "anc1", "ANC 1st contact", anc1);
  add("ANC", "anc4_plus", "ANC 4th or later contact", anc4plus);

  add("ANC", "anc_tt", "TT doses given", monthAnc.filter((v) => v.tt_dose_number != null));
  add("ANC", "anc_iptp", "IPTp doses given", monthAnc.filter((v) => v.iptp_dose_number != null));
  add("ANC", "anc_ifa", "IFA supplemented", monthAnc.filter((v) => v.ifa_given === true));
  add(
    "ANC",
    "anc_danger",
    "Danger signs or high risk identified",
    monthAnc.filter((v) => (v.danger_signs?.length ?? 0) > 0),
  );

  // ---- Delivery ----
  const monthDeliveries = live(input.deliveries).filter((d) =>
    inMonth(d.delivery_date, year, month),
  );
  add("Delivery", "deliveries", "Deliveries", monthDeliveries);
  add(
    "Delivery",
    "live_births",
    "Live births",
    monthDeliveries.filter((d) => d.outcome === "live_birth"),
  );
  add(
    "Delivery",
    "still_births",
    "Still births",
    monthDeliveries.filter((d) => d.outcome === "still_birth"),
  );
  add(
    "Delivery",
    "neonatal_deaths",
    "Neonatal deaths",
    monthDeliveries.filter((d) => d.outcome === "neonatal_death"),
  );

  // ---- Immunization ----
  const givenAll = live(input.doses).filter((d) => d.status === "given");
  const monthDoses = givenAll.filter((d) => inMonth(d.given_date, year, month));

  const byLabel = (label: string) => monthDoses.filter((d) => d.dose_label === label);
  const keyAntigens: [string, string][] = [
    ["BCG", "imm_bcg"],
    ["Penta 1", "imm_penta1"],
    ["Penta 3", "imm_penta3"],
    ["Measles 1 (MCV1)", "imm_measles1"],
    ["Yellow Fever", "imm_yf"],
    ["Vitamin A", "imm_vitamin_a"],
  ];
  for (const [label, key] of keyAntigens) {
    add("Immunization", key, `${label} given`, byLabel(label));
  }
  add("Immunization", "imm_total", "Total doses given", monthDoses);

  // Penta1 to Measles1 dropout, the standard EPI quality indicator. Computed
  // over doses given within the month so it matches the rest of the report.
  const penta1Count = byLabel("Penta 1").length;
  const measles1Count = byLabel("Measles 1 (MCV1)").length;
  const dropout =
    penta1Count > 0 ? Math.round(((penta1Count - measles1Count) / penta1Count) * 100) : 0;
  addDerived(
    "Immunization",
    "penta1_measles1_dropout_pct",
    "Penta1 to Measles1 dropout (%)",
    dropout,
    ["imm_penta1", "imm_measles1"],
    penta1Count === 0 ? "No Penta 1 doses this month; dropout reported as 0." : undefined,
  );

  // Fully immunized child: children completing the required set this month.
  const givenLabelsByChild = new Map<string, Set<string>>();
  const completingDose = new Map<string, string>();
  for (const dose of givenAll) {
    const labels = givenLabelsByChild.get(dose.patient_id) ?? new Set<string>();
    labels.add(dose.dose_label);
    givenLabelsByChild.set(dose.patient_id, labels);
  }
  for (const dose of monthDoses) {
    const labels = givenLabelsByChild.get(dose.patient_id);
    if (!labels) continue;
    if (FIC_REQUIRED_LABELS.every((label) => labels.has(label))) {
      // One row per child, attributed to the dose that completed the set.
      if (!completingDose.has(dose.patient_id)) completingDose.set(dose.patient_id, dose.id);
    }
  }
  figures.push({
    group: "Immunization",
    key: "fully_immunized_children",
    label: "Fully immunized children",
    value: completingDose.size,
    sourceIds: [...completingDose.values()],
    note: FIC_NOTE,
  });

  // ---- Referrals ----
  add(
    "Referrals",
    "referrals_out",
    "Out-referrals",
    live(input.referrals).filter((r) => inMonth(r.created_at, year, month)),
  );

  return figures;
}

// ---- Rollup ----

/**
 * Sum facility reports into an LGA figure set.
 *
 * Counts add; a percentage cannot, so a derived figure is recomputed from the
 * summed figures it came from. Averaging percentages across facilities would
 * weight a facility with three doses the same as one with three hundred.
 */
export function rollupReports(reports: ReportFigure[][]): ReportFigure[] {
  const totals = new Map<string, ReportFigure>();

  for (const figures of reports) {
    for (const figure of figures) {
      const existing = totals.get(figure.key);
      if (!existing) {
        totals.set(figure.key, { ...figure, sourceIds: [] });
        continue;
      }
      if (!figure.derivedFrom) existing.value += figure.value;
    }
  }

  for (const figure of totals.values()) {
    if (!figure.derivedFrom) continue;
    if (figure.key === "penta1_measles1_dropout_pct") {
      const penta1 = totals.get("imm_penta1")?.value ?? 0;
      const measles1 = totals.get("imm_measles1")?.value ?? 0;
      figure.value = penta1 > 0 ? Math.round(((penta1 - measles1) / penta1) * 100) : 0;
    }
  }

  // Drill-down is meaningless once summed across facilities.
  return [...totals.values()].map((f) => ({ ...f, sourceIds: [] }));
}

// ---- Export formats ----

export interface ReportMeta {
  facility: string;
  facilityCode: string;
  year: number;
  month: number;
}

export function periodString(year: number, month: number): string {
  return `${year}${String(month).padStart(2, "0")}`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function figuresToCsv(figures: ReportFigure[], meta: ReportMeta): string {
  const lines = [
    "# PHC-Track NHMIS monthly report",
    `# Facility,${csvCell(meta.facility)}`,
    `# Facility code,${csvCell(meta.facilityCode)}`,
    `# Period,${meta.year}-${String(meta.month).padStart(2, "0")}`,
    "",
    "Group,Data element,Key,Value",
  ];
  for (const figure of figures) {
    lines.push(
      [csvCell(figure.group), csvCell(figure.label), figure.key, String(figure.value)].join(","),
    );
  }
  return lines.join("\n");
}

/**
 * DHIS2 dataValueSet import payload.
 *
 * `dataElement` carries our own key until the LGA supplies its DHIS2 UID
 * mapping, which is Open question Q4. `dhis2Mapping` substitutes real UIDs once
 * that mapping exists, so the shape does not change when it arrives.
 */
export interface Dhis2DataValueSet {
  period: string;
  orgUnit: string;
  dataValues: { dataElement: string; value: string }[];
  _unmappedElements?: string[];
}

export function figuresToDhis2(
  figures: ReportFigure[],
  meta: ReportMeta,
  dhis2Mapping: Record<string, string> = {},
): Dhis2DataValueSet {
  const unmapped: string[] = [];
  const dataValues = figures.map((figure) => {
    const uid = dhis2Mapping[figure.key];
    if (!uid) unmapped.push(figure.key);
    return { dataElement: uid ?? figure.key, value: String(figure.value) };
  });

  return {
    period: periodString(meta.year, meta.month),
    orgUnit: dhis2Mapping[`orgUnit:${meta.facilityCode}`] ?? meta.facilityCode,
    dataValues,
    // Named explicitly so a partially-mapped export cannot be mistaken for a
    // complete one when it is handed to DHIS2.
    ...(unmapped.length ? { _unmappedElements: unmapped } : {}),
  };
}
