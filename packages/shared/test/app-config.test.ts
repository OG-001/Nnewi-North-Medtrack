/**
 * Clinical configuration validation.
 *
 * These values decide when a child is due a vaccine and when a pregnant woman
 * is due a contact. A bad edit here mis-schedules every patient registered
 * afterwards, silently, so the validation is worth testing as carefully as the
 * engines that consume it.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLINICAL_CONFIG,
  validateConfig,
  computeAncSchedule,
  computeChildSchedule,
  DEFAULT_EPI_SCHEDULE,
  activeStations,
  withdrawnPermissions,
  can,
} from "../src/index";

const validItem = {
  id: "bcg-0",
  antigen: "bcg" as const,
  doseLabel: "BCG",
  recommendedAgeDays: 0,
  minAgeDays: 0,
  windowDays: 14,
  order: 1,
};
const validSchedule = {
  id: "s1",
  name: "Test schedule",
  source: "NPHCDA" as const,
  verifyAgainstCurrentGuidance: true,
  items: [validItem],
};

describe("immunization schedule config", () => {
  it("accepts the shipped default", () => {
    const result = validateConfig("immunization_schedule", DEFAULT_EPI_SCHEDULE);
    expect(result.ok).toBe(true);
  });

  it("rejects a schedule with no doses", () => {
    const result = validateConfig("immunization_schedule", { ...validSchedule, items: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects a negative age", () => {
    const result = validateConfig("immunization_schedule", {
      ...validSchedule,
      items: [{ ...validItem, recommendedAgeDays: -1 }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate dose label, which would double-count in reporting", () => {
    const result = validateConfig("immunization_schedule", {
      ...validSchedule,
      items: [validItem, { ...validItem, id: "bcg-1", order: 2 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].issue).toContain("Duplicate dose label");
  });

  it("rejects a minimum age later than the recommended age", () => {
    const result = validateConfig("immunization_schedule", {
      ...validSchedule,
      items: [{ ...validItem, recommendedAgeDays: 42, minAgeDays: 60 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].issue).toContain("minimum age is after");
  });

  it("rejects an unknown antigen", () => {
    const result = validateConfig("immunization_schedule", {
      ...validSchedule,
      items: [{ ...validItem, antigen: "not_a_vaccine" }],
    });
    expect(result.ok).toBe(false);
  });

  it("reports the field so an admin can see what to fix", () => {
    const result = validateConfig("immunization_schedule", { ...validSchedule, name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].field).toContain("name");
  });
});

describe("ANC model config", () => {
  const valid = { model: "who_2016_8" as const, items: [{ contactNumber: 1, targetGaWeeks: 12, windowWeeks: 2 }] };

  it("accepts the shipped default", () => {
    expect(validateConfig("anc_model", DEFAULT_CLINICAL_CONFIG.anc_model).ok).toBe(true);
  });

  it("rejects duplicate contact numbers", () => {
    const result = validateConfig("anc_model", {
      ...valid,
      items: [
        { contactNumber: 1, targetGaWeeks: 12, windowWeeks: 2 },
        { contactNumber: 1, targetGaWeeks: 20, windowWeeks: 2 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].issue).toContain("unique");
  });

  it("rejects contacts that go backwards in gestational age", () => {
    const result = validateConfig("anc_model", {
      ...valid,
      items: [
        { contactNumber: 1, targetGaWeeks: 30, windowWeeks: 2 },
        { contactNumber: 2, targetGaWeeks: 12, windowWeeks: 2 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].issue).toContain("earlier gestational age");
  });

  it("rejects a gestational age beyond a plausible pregnancy", () => {
    const result = validateConfig("anc_model", {
      ...valid,
      items: [{ contactNumber: 1, targetGaWeeks: 60, windowWeeks: 2 }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("engines honour edited configuration", () => {
  it("schedules a child against an edited immunization schedule", () => {
    const edited = {
      ...DEFAULT_EPI_SCHEDULE,
      items: [{ ...validItem, doseLabel: "BCG", recommendedAgeDays: 3 }],
    };
    const doses = computeChildSchedule(new Date("2026-01-01T00:00:00Z"), edited);
    expect(doses).toHaveLength(1);
    expect(doses[0].doseLabel).toBe("BCG");
    // Three days after birth, per the edited schedule rather than the default.
    expect(doses[0].dueDate.toISOString().slice(0, 10)).toBe("2026-01-04");
  });

  it("schedules ANC contacts against an edited model", () => {
    const contacts = computeAncSchedule(new Date("2026-01-01T00:00:00Z"), "who_2016_8", [
      { contactNumber: 1, targetGaWeeks: 10, windowWeeks: 1 },
      { contactNumber: 2, targetGaWeeks: 24, windowWeeks: 2 },
    ]);
    expect(contacts).toHaveLength(2);
    expect(contacts[0].targetGaWeeks).toBe(10);
  });

  it("falls back to the built-in model when no override is given", () => {
    const contacts = computeAncSchedule(new Date("2026-01-01T00:00:00Z"), "who_2016_8");
    expect(contacts.length).toBeGreaterThan(1);
  });
});

describe("queue stations config", () => {
  const valid = {
    stations: [
      { key: "registration", label: "Front desk", order: 0, active: true },
      { key: "vitals", label: "Vitals", order: 1, active: true },
      { key: "consultation", label: "Consultation", order: 2, active: true },
      { key: "pharmacy", label: "Pharmacy", order: 3, active: false },
    ],
  };

  it("accepts the shipped default", () => {
    expect(validateConfig("queue_stations", DEFAULT_CLINICAL_CONFIG.queue_stations).ok).toBe(true);
  });

  it("allows relabelling and switching a station off", () => {
    const result = validateConfig("queue_stations", valid);
    expect(result.ok).toBe(true);
  });

  it("refuses to drop a station that queue rows may already reference", () => {
    const result = validateConfig("queue_stations", {
      stations: valid.stations.filter((s) => s.key !== "pharmacy"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].issue).toContain("cannot be removed");
  });

  it("refuses a duplicate station", () => {
    const result = validateConfig("queue_stations", {
      stations: [...valid.stations, { key: "vitals", label: "Again", order: 9, active: true }],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses switching every station off", () => {
    const result = validateConfig("queue_stations", {
      stations: valid.stations.map((s) => ({ ...s, active: false })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].issue).toContain("At least one station");
  });

  it("lists active stations in the configured order", () => {
    const ordered = activeStations({
      stations: [
        { key: "pharmacy", label: "Pharmacy", order: 1, active: true },
        { key: "registration", label: "Front desk", order: 0, active: true },
        { key: "vitals", label: "Vitals", order: 2, active: false },
        { key: "consultation", label: "Consultation", order: 3, active: true },
      ],
    });
    expect(ordered.map((s) => s.key)).toEqual(["registration", "pharmacy", "consultation"]);
  });
});

describe("per-facility permission toggles", () => {
  const config = {
    facilities: {
      "fac-0062": { nurse_midwife: ["prescribe"] as const },
    },
  };

  it("accepts a deny list", () => {
    expect(validateConfig("facility_permissions", config).ok).toBe(true);
  });

  it("rejects an unknown permission", () => {
    const result = validateConfig("facility_permissions", {
      facilities: { "fac-0062": { nurse_midwife: ["fly_a_plane"] } },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = validateConfig("facility_permissions", {
      facilities: { "fac-0062": { wizard: ["prescribe"] } },
    });
    expect(result.ok).toBe(false);
  });

  it("withdraws only at the facility that configured it", () => {
    expect(withdrawnPermissions(config, "fac-0062", ["nurse_midwife"])).toEqual(["prescribe"]);
    expect(withdrawnPermissions(config, "fac-0060", ["nurse_midwife"])).toEqual([]);
    expect(withdrawnPermissions(config, null, ["nurse_midwife"])).toEqual([]);
  });

  it("withdraws only for the roles it names", () => {
    expect(withdrawnPermissions(config, "fac-0062", ["doctor_mo"])).toEqual([]);
  });
});

describe("can() with facility withdrawals", () => {
  it("grants a permission the role matrix allows", () => {
    expect(can(["nurse_midwife"], "prescribe")).toBe(true);
  });

  it("withdraws it when the facility has switched it off", () => {
    expect(can(["nurse_midwife"], "prescribe", ["prescribe"])).toBe(false);
  });

  it("cannot be used to grant beyond the role matrix", () => {
    // A withdrawal list is a deny list. Nothing here can give a clerk a
    // permission the matrix withholds, whatever is configured.
    expect(can(["records_clerk"], "prescribe", [])).toBe(false);
    expect(can(["records_clerk"], "prescribe")).toBe(false);
  });

  it("leaves other permissions alone", () => {
    expect(can(["nurse_midwife"], "immunization.record", ["prescribe"])).toBe(true);
  });
});
