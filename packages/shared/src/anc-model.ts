/**
 * ANC schedule models — editable config (data-model §4.2, Open question Q3).
 * Default WHO-2016 8-contact; focused 4-visit also selectable. The engine turns
 * an LMP into a list of scheduled contacts (target date + window).
 */
import type { AncModel } from "./enums";
import { addDays, gestationalAgeWeeks } from "./dates";

export interface AncModelItem {
  contactNumber: number;
  targetGaWeeks: number;
  windowWeeks: number;
}

export const ANC_MODEL_ITEMS: Record<AncModel, AncModelItem[]> = {
  who_2016_8: [
    { contactNumber: 1, targetGaWeeks: 12, windowWeeks: 2 },
    { contactNumber: 2, targetGaWeeks: 20, windowWeeks: 2 },
    { contactNumber: 3, targetGaWeeks: 26, windowWeeks: 2 },
    { contactNumber: 4, targetGaWeeks: 30, windowWeeks: 2 },
    { contactNumber: 5, targetGaWeeks: 34, windowWeeks: 1 },
    { contactNumber: 6, targetGaWeeks: 36, windowWeeks: 1 },
    { contactNumber: 7, targetGaWeeks: 38, windowWeeks: 1 },
    { contactNumber: 8, targetGaWeeks: 40, windowWeeks: 1 },
  ],
  focused_4: [
    { contactNumber: 1, targetGaWeeks: 12, windowWeeks: 4 },
    { contactNumber: 2, targetGaWeeks: 22, windowWeeks: 3 },
    { contactNumber: 3, targetGaWeeks: 30, windowWeeks: 2 },
    { contactNumber: 4, targetGaWeeks: 36, windowWeeks: 2 },
  ],
};

export const ANC_MODEL_LABELS: Record<AncModel, string> = {
  who_2016_8: "WHO 2016 — 8 contacts",
  focused_4: "Focused ANC — 4 visits",
};

export interface ComputedAncContact {
  contactNumber: number;
  targetGaWeeks: number;
  targetDate: Date;
  windowStart: Date;
  windowEnd: Date;
}

/** Generate ANC contacts from LMP for the chosen model. */
export function computeAncSchedule(
  lmp: Date,
  model: AncModel = "who_2016_8",
): ComputedAncContact[] {
  return ANC_MODEL_ITEMS[model].map((it) => {
    const targetDate = addDays(lmp, it.targetGaWeeks * 7);
    return {
      contactNumber: it.contactNumber,
      targetGaWeeks: it.targetGaWeeks,
      targetDate,
      windowStart: addDays(targetDate, -it.windowWeeks * 7),
      windowEnd: addDays(targetDate, it.windowWeeks * 7),
    };
  });
}

/**
 * Risk auto-flagging (modules-and-features Module 3): age, parity, BP, danger
 * signs. Returns the set of risk flags that apply.
 */
export interface RiskInput {
  ageYears?: number;
  para?: number;
  systolic?: number;
  diastolic?: number;
  previousCs?: boolean;
  dangerSigns?: string[];
}

export function computeRiskFlags(input: RiskInput): string[] {
  const flags: string[] = [];
  if (input.ageYears != null && (input.ageYears < 18 || input.ageYears >= 35))
    flags.push("age_risk");
  if (input.para != null && input.para >= 5) flags.push("grand_multipara");
  if (
    (input.systolic != null && input.systolic >= 140) ||
    (input.diastolic != null && input.diastolic >= 90)
  )
    flags.push("hypertension");
  if (input.previousCs) flags.push("previous_cs");
  if (input.dangerSigns && input.dangerSigns.length > 0) flags.push("danger_sign");
  return flags;
}

export { gestationalAgeWeeks };
