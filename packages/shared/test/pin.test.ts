import { describe, expect, it } from "vitest";
import {
  BREAK_GLASS_PIN_MAX,
  BREAK_GLASS_PIN_MIN,
  LOGIN_PIN_MAX,
  LOGIN_PIN_MIN,
  STAFF_PIN_MAX_DIGITS,
  STAFF_PIN_MIN_DIGITS,
  breakGlassPinSchema,
  describeStaffPinProblem,
  loginPinSchema,
  staffPinSchema,
} from "../src/pin";

describe("staff PIN rule", () => {
  it("accepts a plain clinic PIN", () => {
    expect(describeStaffPinProblem("730194")).toBeNull();
    expect(staffPinSchema.safeParse("730194").success).toBe(true);
  });

  it("names the actual problem rather than restating the rule", () => {
    // The whole point: a nurse should learn what is wrong with what she typed.
    expect(describeStaffPinProblem("73")).toMatch(/too short/i);
    expect(describeStaffPinProblem("7301945")).toMatch(/too long/i);
    expect(describeStaffPinProblem("nurse1")).toMatch(/digits only/i);
    expect(describeStaffPinProblem("")).toMatch(/enter a pin/i);
  });

  it("reports one problem, the most useful one", () => {
    // Four letters are both non-numeric and, as digits, nothing. Saying "digits
    // only" is the actionable half; adding a length complaint helps nobody.
    const problem = describeStaffPinProblem("abcd");
    expect(problem).toMatch(/digits only/i);
    expect(problem).not.toMatch(/too short|too long/i);
  });

  it("refuses PINs an attacker tries first", () => {
    for (const weak of ["0000", "1111", "1234", "123456"]) {
      expect(describeStaffPinProblem(weak), weak).toMatch(/easily guessed/i);
    }
    // Repeated digits of any length, not only the listed ones.
    expect(describeStaffPinProblem("5555")).toMatch(/repeated digit/i);
  });

  it("the schema message is the same text the form shows", () => {
    // If these drift, a user is told one thing by the field and another by the
    // server for the same mistake.
    const r = staffPinSchema.safeParse("73");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(describeStaffPinProblem("73"));
    }
  });
});

describe("break-glass PIN rule", () => {
  it("requires more than a clinic PIN", () => {
    expect(breakGlassPinSchema.safeParse("730194").success).toBe(false);
    expect(breakGlassPinSchema.safeParse("48213765").success).toBe(true);
  });
});

describe("the three layers cannot lock anyone out", () => {
  it("login accepts every staff PIN the system can issue", () => {
    for (const pin of ["7301", "730194"]) {
      expect(staffPinSchema.safeParse(pin).success, pin).toBe(true);
      expect(loginPinSchema.safeParse(pin).success, pin).toBe(true);
    }
  });

  it("login accepts every break-glass PIN the system can issue", () => {
    for (const pin of ["48213765", "482137659012"]) {
      expect(breakGlassPinSchema.safeParse(pin).success, pin).toBe(true);
      expect(loginPinSchema.safeParse(pin).success, pin).toBe(true);
    }
  });

  it("login's bounds are derived, not hand-written", () => {
    // This is the regression guard. The original defect was three hand-written
    // rules drifting: an account was created that login would have refused.
    expect(LOGIN_PIN_MIN).toBe(Math.min(STAFF_PIN_MIN_DIGITS, BREAK_GLASS_PIN_MIN));
    expect(LOGIN_PIN_MAX).toBe(Math.max(STAFF_PIN_MAX_DIGITS, BREAK_GLASS_PIN_MAX));
  });
});
