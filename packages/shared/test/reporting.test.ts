/**
 * Every NHMIS data element against a worked example (phase 8, task 8).
 *
 * Reporting arithmetic is the kind of code that looks obviously right and is
 * quietly wrong for a year, so each figure is checked against a fixture where
 * the expected number was counted by hand.
 */
import { describe, expect, it } from "vitest";
import {
  computeMonthlyReport,
  figuresToCsv,
  figuresToDhis2,
  rollupReports,
  type ReportInput,
} from "../src/reporting";

const FACILITY = "fac-0062";
const YEAR = 2026;
const MONTH = 6; // June 2026

const inside = (day: number) => `2026-06-${String(day).padStart(2, "0")}T09:00:00.000Z`;
const before = (day: number) => `2026-05-${String(day).padStart(2, "0")}T09:00:00.000Z`;
const after = (day: number) => `2026-07-${String(day).padStart(2, "0")}T09:00:00.000Z`;

function base(id: string, createdAt = inside(10)) {
  return { id, facility_id: FACILITY, created_at: createdAt, deleted_at: null };
}

function emptyInput(): ReportInput {
  return {
    year: YEAR,
    month: MONTH,
    patients: [],
    encounters: [],
    pregnancies: [],
    ancVisits: [],
    deliveries: [],
    doses: [],
    referrals: [],
  };
}

const figure = (figures: ReturnType<typeof computeMonthlyReport>, key: string) =>
  figures.find((f) => f.key === key);
const valueOf = (figures: ReturnType<typeof computeMonthlyReport>, key: string) =>
  figure(figures, key)?.value;

describe("month boundaries", () => {
  it("counts only records inside the reporting month", () => {
    const input = emptyInput();
    input.patients = [base("p1", before(30)), base("p2", inside(1)), base("p3", inside(30)), base("p4", after(1))];

    const figures = computeMonthlyReport(input);
    expect(valueOf(figures, "new_patients")).toBe(2);
  });

  it("uses UTC, so a device timezone cannot move a figure", () => {
    const input = emptyInput();
    // Late on the last day UTC; a positive-offset local clock would call it July.
    input.patients = [base("p1", "2026-06-30T23:30:00.000Z")];
    expect(valueOf(computeMonthlyReport(input), "new_patients")).toBe(1);
  });

  it("excludes soft-deleted rows from every figure", () => {
    const input = emptyInput();
    input.patients = [base("p1"), { ...base("p2"), deleted_at: inside(20) }];
    expect(valueOf(computeMonthlyReport(input), "new_patients")).toBe(1);
  });
});

describe("registrations", () => {
  it("counts under-5s by age at the end of the reporting month", () => {
    const input = emptyInput();
    input.patients = [
      { ...base("child"), date_of_birth: "2023-01-01" }, // 3 years
      { ...base("adult"), date_of_birth: "1990-01-01" }, // 36 years
      { ...base("no-dob"), date_of_birth: null },
      { ...base("just-five"), date_of_birth: "2021-06-01" }, // turns 5 in June
    ];
    const figures = computeMonthlyReport(input);
    expect(valueOf(figures, "new_patients")).toBe(4);
    expect(valueOf(figures, "new_under5")).toBe(1);
  });
});

describe("ANC contact ordinals", () => {
  it("counts a pregnancy's first contact as ANC1 and its fourth as ANC4+", () => {
    const input = emptyInput();
    // One pregnancy, four contacts, the last three inside the month.
    input.ancVisits = [
      { ...base("v1", before(2)), pregnancy_id: "preg-1", patient_id: "pat-1", visit_date: before(2) },
      { ...base("v2", inside(2)), pregnancy_id: "preg-1", patient_id: "pat-1", visit_date: inside(2) },
      { ...base("v3", inside(10)), pregnancy_id: "preg-1", patient_id: "pat-1", visit_date: inside(10) },
      { ...base("v4", inside(20)), pregnancy_id: "preg-1", patient_id: "pat-1", visit_date: inside(20) },
    ];
    const figures = computeMonthlyReport(input);

    expect(valueOf(figures, "anc_visits")).toBe(3); // three fell in the month
    // The first contact happened in May, so no ANC1 is reported for June.
    expect(valueOf(figures, "anc1")).toBe(0);
    // The fourth contact is the one on the 20th.
    expect(valueOf(figures, "anc4_plus")).toBe(1);
  });

  it("counts a first-ever contact inside the month as ANC1", () => {
    const input = emptyInput();
    input.ancVisits = [
      { ...base("v1", inside(5)), pregnancy_id: "preg-2", patient_id: "pat-2", visit_date: inside(5) },
    ];
    const figures = computeMonthlyReport(input);
    expect(valueOf(figures, "anc1")).toBe(1);
    expect(valueOf(figures, "anc4_plus")).toBe(0);
  });

  it("orders contacts by date, not by insertion order", () => {
    const input = emptyInput();
    input.ancVisits = [
      { ...base("late"), pregnancy_id: "p", patient_id: "x", visit_date: inside(20) },
      { ...base("early"), pregnancy_id: "p", patient_id: "x", visit_date: inside(2) },
    ];
    const figures = computeMonthlyReport(input);
    expect(figure(figures, "anc1")?.sourceIds).toEqual(["early"]);
  });

  it("counts interventions only where recorded", () => {
    const input = emptyInput();
    input.ancVisits = [
      {
        ...base("v1"),
        pregnancy_id: "p1",
        patient_id: "x",
        visit_date: inside(5),
        tt_dose_number: 2,
        iptp_dose_number: 1,
        ifa_given: true,
        danger_signs: ["bleeding"],
      },
      {
        ...base("v2"),
        pregnancy_id: "p2",
        patient_id: "y",
        visit_date: inside(6),
        ifa_given: false,
        danger_signs: [],
      },
    ];
    const figures = computeMonthlyReport(input);
    expect(valueOf(figures, "anc_tt")).toBe(1);
    expect(valueOf(figures, "anc_iptp")).toBe(1);
    expect(valueOf(figures, "anc_ifa")).toBe(1);
    expect(valueOf(figures, "anc_danger")).toBe(1);
  });
});

describe("delivery outcomes", () => {
  it("splits deliveries by outcome", () => {
    const input = emptyInput();
    input.deliveries = [
      { ...base("d1"), delivery_date: inside(3), outcome: "live_birth" },
      { ...base("d2"), delivery_date: inside(4), outcome: "live_birth" },
      { ...base("d3"), delivery_date: inside(5), outcome: "still_birth" },
      { ...base("d4"), delivery_date: inside(6), outcome: "neonatal_death" },
    ];
    const figures = computeMonthlyReport(input);
    expect(valueOf(figures, "deliveries")).toBe(4);
    expect(valueOf(figures, "live_births")).toBe(2);
    expect(valueOf(figures, "still_births")).toBe(1);
    expect(valueOf(figures, "neonatal_deaths")).toBe(1);
  });
});

describe("immunization", () => {
  const dose = (id: string, patient: string, label: string, givenDate: string | null) => ({
    ...base(id, givenDate ?? inside(10)),
    patient_id: patient,
    dose_label: label,
    status: givenDate ? "given" : "due",
    given_date: givenDate,
  });

  it("counts doses by antigen, given inside the month only", () => {
    const input = emptyInput();
    input.doses = [
      dose("a", "c1", "BCG", inside(2)),
      dose("b", "c2", "BCG", before(2)),
      dose("c", "c3", "Penta 1", inside(3)),
      dose("d", "c4", "Penta 1", null), // due, not given
    ];
    const figures = computeMonthlyReport(input);
    expect(valueOf(figures, "imm_bcg")).toBe(1);
    expect(valueOf(figures, "imm_penta1")).toBe(1);
    expect(valueOf(figures, "imm_total")).toBe(2);
  });

  it("computes the Penta1 to Measles1 dropout percentage", () => {
    const input = emptyInput();
    input.doses = [
      dose("p1", "c1", "Penta 1", inside(2)),
      dose("p2", "c2", "Penta 1", inside(3)),
      dose("p3", "c3", "Penta 1", inside(4)),
      dose("p4", "c4", "Penta 1", inside(5)),
      dose("m1", "c1", "Measles 1 (MCV1)", inside(6)),
      dose("m2", "c2", "Measles 1 (MCV1)", inside(7)),
      dose("m3", "c3", "Measles 1 (MCV1)", inside(8)),
    ];
    // (4 - 3) / 4 = 25%
    expect(valueOf(computeMonthlyReport(input), "penta1_measles1_dropout_pct")).toBe(25);
  });

  it("reports zero dropout rather than dividing by zero", () => {
    const input = emptyInput();
    input.doses = [dose("m1", "c1", "Measles 1 (MCV1)", inside(6))];
    const figures = computeMonthlyReport(input);
    expect(valueOf(figures, "penta1_measles1_dropout_pct")).toBe(0);
    expect(figure(figures, "penta1_measles1_dropout_pct")?.note).toContain("No Penta 1");
  });

  it("counts a fully immunized child once, when the set completes", () => {
    const input = emptyInput();
    input.doses = [
      dose("b1", "child-1", "BCG", before(1)),
      dose("p3", "child-1", "Penta 3", before(20)),
      dose("m1", "child-1", "Measles 1 (MCV1)", inside(9)), // completes in June
      dose("b2", "child-2", "BCG", inside(2)), // incomplete
    ];
    const figures = computeMonthlyReport(input);
    expect(valueOf(figures, "fully_immunized_children")).toBe(1);
    expect(figure(figures, "fully_immunized_children")?.sourceIds).toEqual(["m1"]);
  });

  it("does not count a child whose set completed in an earlier month", () => {
    const input = emptyInput();
    input.doses = [
      dose("b1", "child-1", "BCG", before(1)),
      dose("p3", "child-1", "Penta 3", before(5)),
      dose("m1", "child-1", "Measles 1 (MCV1)", before(20)),
    ];
    expect(valueOf(computeMonthlyReport(input), "fully_immunized_children")).toBe(0);
  });
});

describe("drill-down", () => {
  it("carries the ids behind every counted figure", () => {
    const input = emptyInput();
    input.patients = [base("p1"), base("p2")];
    const figures = computeMonthlyReport(input);
    expect(figure(figures, "new_patients")?.sourceIds.sort()).toEqual(["p1", "p2"]);
  });

  it("names the figures a percentage derives from instead of rows", () => {
    const dropout = figure(computeMonthlyReport(emptyInput()), "penta1_measles1_dropout_pct");
    expect(dropout?.sourceIds).toEqual([]);
    expect(dropout?.derivedFrom).toEqual(["imm_penta1", "imm_measles1"]);
  });

  it("produces a figure for every element even on an empty month", () => {
    const figures = computeMonthlyReport(emptyInput());
    expect(figures.length).toBeGreaterThan(15);
    // A silent gap in a monthly return is worse than a zero.
    expect(figures.every((f) => typeof f.value === "number")).toBe(true);
  });
});

describe("LGA rollup", () => {
  const facilityFigures = (penta1: number, measles1: number, patients: number) => [
    { key: "new_patients", label: "New patients registered", value: patients, group: "Registrations", sourceIds: [] },
    { key: "imm_penta1", label: "Penta 1 given", value: penta1, group: "Immunization", sourceIds: [] },
    { key: "imm_measles1", label: "Measles 1 given", value: measles1, group: "Immunization", sourceIds: [] },
    {
      key: "penta1_measles1_dropout_pct",
      label: "Penta1 to Measles1 dropout (%)",
      value: penta1 > 0 ? Math.round(((penta1 - measles1) / penta1) * 100) : 0,
      group: "Immunization",
      sourceIds: [],
      derivedFrom: ["imm_penta1", "imm_measles1"],
    },
  ];

  it("sums counts across facilities", () => {
    const rolled = rollupReports([facilityFigures(10, 8, 30), facilityFigures(90, 45, 70)]);
    expect(rolled.find((f) => f.key === "new_patients")?.value).toBe(100);
    expect(rolled.find((f) => f.key === "imm_penta1")?.value).toBe(100);
  });

  it("recomputes a percentage rather than averaging it", () => {
    // Facility A: 10 Penta1, 8 Measles1 = 20% dropout.
    // Facility B: 90 Penta1, 45 Measles1 = 50% dropout.
    // The average of the two percentages is 35%, which is wrong: the small
    // facility would count as much as the large one. The true LGA figure is
    // (100 - 53) / 100 = 47%.
    const rolled = rollupReports([facilityFigures(10, 8, 30), facilityFigures(90, 45, 70)]);
    expect(rolled.find((f) => f.key === "penta1_measles1_dropout_pct")?.value).toBe(47);
  });

  it("drops drill-down ids, which are meaningless once summed", () => {
    const rolled = rollupReports([facilityFigures(1, 1, 1)]);
    expect(rolled.every((f) => f.sourceIds.length === 0)).toBe(true);
  });
});

describe("export formats", () => {
  const meta = { facility: "PHC Umuenem Otolo", facilityCode: "NNW0062", year: YEAR, month: MONTH };

  it("writes CSV with the period and one row per element", () => {
    const csv = figuresToCsv(computeMonthlyReport(emptyInput()), meta);
    expect(csv).toContain("# Period,2026-06");
    expect(csv).toContain("Group,Data element,Key,Value");
    expect(csv).toContain("new_patients");
  });

  it("escapes a quote in a facility name rather than breaking the row", () => {
    const csv = figuresToCsv([], { ...meta, facility: 'St "Mary" PHC' });
    expect(csv).toContain('"St ""Mary"" PHC"');
  });

  it("builds a DHIS2 dataValueSet with the period as YYYYMM", () => {
    const payload = figuresToDhis2(computeMonthlyReport(emptyInput()), meta);
    expect(payload.period).toBe("202606");
    expect(payload.orgUnit).toBe("NNW0062");
    expect(payload.dataValues.length).toBeGreaterThan(0);
  });

  it("substitutes DHIS2 UIDs where a mapping exists", () => {
    const payload = figuresToDhis2(
      [{ key: "new_patients", label: "x", value: 5, group: "Registrations", sourceIds: [] }],
      meta,
      { new_patients: "UID123", "orgUnit:NNW0062": "OU456" },
    );
    expect(payload.dataValues[0]).toEqual({ dataElement: "UID123", value: "5" });
    expect(payload.orgUnit).toBe("OU456");
    expect(payload._unmappedElements).toBeUndefined();
  });

  it("names unmapped elements so a partial export cannot pass as complete", () => {
    const payload = figuresToDhis2(
      [{ key: "new_patients", label: "x", value: 5, group: "Registrations", sourceIds: [] }],
      meta,
    );
    expect(payload._unmappedElements).toEqual(["new_patients"]);
  });
});
