/**
 * SMS domain rules. The consent gate is the highest-stakes function here:
 * messaging a patient who never consented is a CRITICAL compliance finding
 * under the Nigeria Data Protection Act, so it is tested from every angle.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SMS_TEMPLATES,
  checkSmsGate,
  normalizeToE164,
  renderTemplate,
  segmentCount,
  selectBody,
  templateFields,
  validateTemplateBody,
  withinSendWindow,
} from "../src/sms";

describe("consent gate", () => {
  const base = { sms_consent: true, phone_primary: "08031234567", status: "active" };

  it("allows a consenting active patient with a usable number", () => {
    const result = checkSmsGate(base);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.to).toBe("+2348031234567");
  });

  it("never messages a patient who has not consented", () => {
    const result = checkSmsGate({ ...base, sms_consent: false });
    expect(result).toEqual({ allowed: false, reason: "no_consent" });
  });

  it("never messages a patient with no usable phone number", () => {
    for (const phone of [null, undefined, "", "12345", "not a phone"]) {
      const result = checkSmsGate({ ...base, phone_primary: phone });
      expect(result, `phone: ${String(phone)}`).toEqual({
        allowed: false,
        reason: "no_valid_phone",
      });
    }
  });

  it("never messages a patient who is not active", () => {
    // Messaging a deceased patient's number would be a serious harm.
    for (const status of ["deceased", "transferred", "inactive"]) {
      const result = checkSmsGate({ ...base, status });
      expect(result).toEqual({ allowed: false, reason: "patient_inactive" });
    }
  });

  it("checks consent before anything else", () => {
    // A patient with no consent and no phone reports the consent failure: the
    // absence of consent is the reason we must not send, regardless.
    const result = checkSmsGate({ sms_consent: false, phone_primary: null });
    expect(result).toEqual({ allowed: false, reason: "no_consent" });
  });

  it("defaults to English when no language is recorded", () => {
    const result = checkSmsGate(base);
    if (result.allowed) expect(result.language).toBe("en");
  });

  it("uses the patient's preferred language", () => {
    const result = checkSmsGate({ ...base, preferred_language: "ig" });
    if (result.allowed) expect(result.language).toBe("ig");
  });
});

describe("phone normalisation", () => {
  it("accepts the forms staff actually type", () => {
    for (const input of [
      "08031234567",
      "8031234567",
      "2348031234567",
      "+2348031234567",
      "+234 803 123 4567",
      "0803-123-4567",
    ]) {
      expect(normalizeToE164(input), input).toBe("+2348031234567");
    }
  });

  it("rejects anything that is not a Nigerian mobile number", () => {
    for (const input of ["", null, undefined, "0", "080312345", "0803123456789", "abc"]) {
      expect(normalizeToE164(input), String(input)).toBeNull();
    }
  });

  it("rejects a national part starting with zero", () => {
    expect(normalizeToE164("+2340031234567")).toBeNull();
  });
});

describe("template rendering", () => {
  it("substitutes merge fields", () => {
    const body = "Hello {{name}}, your visit is on {{date}} at {{facility}}.";
    expect(renderTemplate(body, { name: "Ngozi", date: "12 Sep", facility: "PHC Otolo" })).toBe(
      "Hello Ngozi, your visit is on 12 Sep at PHC Otolo.",
    );
  });

  it("never leaves a raw placeholder in a patient-facing message", () => {
    const rendered = renderTemplate("Hello {{name}}, see you {{date}}.", { name: "Ada" });
    expect(rendered).not.toContain("{{");
    expect(rendered).toBe("Hello Ada, see you .");
  });

  it("tolerates whitespace inside a placeholder", () => {
    expect(renderTemplate("Hi {{ name }}", { name: "Ada" })).toBe("Hi Ada");
  });

  it("lists the fields a body references, without duplicates", () => {
    expect(templateFields("{{name}} {{date}} {{name}}")).toEqual(["name", "date"]);
  });
});

describe("template validation at edit time", () => {
  it("accepts every seeded template in both languages", () => {
    for (const template of Object.values(DEFAULT_SMS_TEMPLATES)) {
      for (const body of Object.values(template.bodies)) {
        expect(validateTemplateBody(body), body).toEqual([]);
      }
    }
  });

  it("rejects an unknown merge field", () => {
    const problems = validateTemplateBody("Hello {{patient_nam}}");
    expect(problems).toHaveLength(1);
    expect(problems[0].issue).toContain("Unknown merge field");
  });

  it("rejects an empty body", () => {
    expect(validateTemplateBody("   ")).toContainEqual({
      field: "body",
      issue: "Message body cannot be empty",
    });
  });

  it("rejects a body longer than three segments", () => {
    const problems = validateTemplateBody("x".repeat(500));
    expect(problems.some((p) => p.issue.includes("three SMS segments"))).toBe(true);
  });
});

describe("language selection", () => {
  it("returns the Igbo variant when requested", () => {
    const body = selectBody(DEFAULT_SMS_TEMPLATES.anc_reminder, "ig");
    expect(body).toContain("Ndewo");
  });

  it("falls back to English when a variant is blank", () => {
    const template = { ...DEFAULT_SMS_TEMPLATES.anc_reminder, bodies: { en: "English only", ig: "" } };
    expect(selectBody(template, "ig")).toBe("English only");
  });
});

describe("segment count, for the cost bucket", () => {
  it("counts a short message as one segment", () => {
    expect(segmentCount("Hello")).toBe(1);
    expect(segmentCount("x".repeat(160))).toBe(1);
  });

  it("counts a concatenated message by its 153-character segments", () => {
    expect(segmentCount("x".repeat(161))).toBe(2);
    expect(segmentCount("x".repeat(306))).toBe(2);
    expect(segmentCount("x".repeat(307))).toBe(3);
  });

  it("counts an empty body as nothing", () => {
    expect(segmentCount("")).toBe(0);
  });
});

describe("quiet hours", () => {
  it("allows sends inside the default daytime window", () => {
    expect(withinSendWindow(8)).toBe(true);
    expect(withinSendWindow(19)).toBe(true);
  });

  it("blocks sends outside it", () => {
    // Nobody should be woken at 03:00 by a clinic reminder.
    expect(withinSendWindow(3)).toBe(false);
    expect(withinSendWindow(20)).toBe(false);
    expect(withinSendWindow(23)).toBe(false);
  });

  it("handles a window that wraps past midnight", () => {
    const overnight = { startHour: 20, endHour: 8 };
    expect(withinSendWindow(22, overnight)).toBe(true);
    expect(withinSendWindow(2, overnight)).toBe(true);
    expect(withinSendWindow(12, overnight)).toBe(false);
  });

  it("treats an equal start and end as no restriction", () => {
    expect(withinSendWindow(3, { startHour: 0, endHour: 0 })).toBe(true);
  });
});
