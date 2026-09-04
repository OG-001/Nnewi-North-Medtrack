/**
 * Display helpers must never throw on an incomplete record.
 *
 * Rows arrive from other devices, and one that is missing a name field used to
 * crash the whole patient list. A missing value has to degrade to a dash, not
 * take a clinic screen down.
 */
import { describe, expect, it } from "vitest";
import { displayName, fullName, initials, patientAge, titleCase } from "../format";

describe("name helpers tolerate incomplete records", () => {
  const complete = { first_name: "Ngozi", last_name: "Eze" };

  it("renders a complete name", () => {
    expect(displayName(complete)).toBe("Ngozi Eze");
    expect(fullName({ ...complete, other_names: "Chi" })).toBe("Eze Ngozi Chi");
    expect(initials(complete)).toBe("NE");
  });

  it("does not throw when a name field is missing", () => {
    for (const partial of [
      { first_name: "Ngozi" },
      { last_name: "Eze" },
      {},
      { first_name: null, last_name: null },
      { first_name: "", last_name: "" },
    ]) {
      expect(() => displayName(partial)).not.toThrow();
      expect(() => initials(partial)).not.toThrow();
      expect(() => fullName(partial)).not.toThrow();
    }
  });

  it("falls back to a readable placeholder rather than an empty string", () => {
    expect(displayName({})).toBe("Unnamed record");
    expect(fullName({})).toBe("Unnamed record");
    expect(initials({})).toBe("?");
  });

  it("uses the half of the name it does have", () => {
    expect(displayName({ first_name: "Ngozi" })).toBe("Ngozi");
    expect(initials({ last_name: "Eze" })).toBe("E");
  });
});

describe("age", () => {
  it("returns a dash with no date of birth", () => {
    expect(patientAge(null)).toBe("—");
    expect(patientAge(undefined)).toBe("—");
  });

  it("returns a dash rather than throwing on a malformed date", () => {
    expect(patientAge("not-a-date")).toBe("—");
  });
});

describe("titleCase", () => {
  it("humanises an enum value", () => {
    expect(titleCase("nurse_midwife")).toBe("Nurse Midwife");
  });

  it("tolerates a missing value", () => {
    expect(titleCase(undefined)).toBe("—");
    expect(titleCase(null)).toBe("—");
  });
});
