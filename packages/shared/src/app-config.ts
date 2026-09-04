/**
 * Editable clinical configuration (Global Constraint 9: schedules and templates
 * are configuration, not code).
 *
 * The immunization schedule and the ANC contact model must be changeable when
 * national guidance changes, without a release. That makes them data, and data
 * that determines when a child is due a vaccine has to be validated before it
 * is saved: a schedule with a negative age or a duplicate dose would silently
 * mis-schedule every child registered afterwards.
 *
 * The hub is authoritative for config (offline-sync-design section 5). Devices
 * read it and cache it so they keep working offline; they never push edits
 * through the outbox.
 */
import { z } from "zod";
import { ANTIGENS, ANC_MODELS } from "./enums";
import { DEFAULT_EPI_SCHEDULE, type ImmunizationSchedule } from "./immunization-schedule";
import { ANC_MODEL_ITEMS, type AncModelItem } from "./anc-model";

/** Config keys the hub stores and the device caches. */
export const CONFIG_KEYS = ["immunization_schedule", "anc_model"] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

// ---- Immunization schedule ----

export const immunizationScheduleItemSchema = z.object({
  id: z.string().min(1),
  antigen: z.enum(ANTIGENS),
  doseLabel: z.string().min(1).max(60),
  // A dose at a negative age, or beyond ~6 years, is a data-entry error rather
  // than a schedule anyone intends.
  recommendedAgeDays: z.number().int().min(0).max(2200),
  minAgeDays: z.number().int().min(0).max(2200),
  windowDays: z.number().int().min(0).max(365),
  order: z.number().int().min(0),
});

export const immunizationScheduleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    source: z.enum(["NPHCDA", "WHO", "custom"]),
    verifyAgainstCurrentGuidance: z.boolean(),
    items: z.array(immunizationScheduleItemSchema).min(1).max(60),
  })
  .superRefine((schedule, ctx) => {
    const labels = new Set<string>();
    for (const item of schedule.items) {
      if (labels.has(item.doseLabel)) {
        // Reporting counts doses by label, so a duplicate would double-count.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items"],
          message: `Duplicate dose label "${item.doseLabel}"`,
        });
      }
      labels.add(item.doseLabel);

      if (item.minAgeDays > item.recommendedAgeDays) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items"],
          message: `"${item.doseLabel}": minimum age is after the recommended age`,
        });
      }
    }
  });

// ---- ANC model ----

export const ancModelItemSchema = z.object({
  contactNumber: z.number().int().min(1).max(20),
  // A pregnancy is ~40 weeks; a contact beyond 45 is not a real target.
  targetGaWeeks: z.number().int().min(1).max(45),
  windowWeeks: z.number().int().min(0).max(8),
});

export const ancModelConfigSchema = z
  .object({
    model: z.enum(ANC_MODELS),
    items: z.array(ancModelItemSchema).min(1).max(20),
  })
  .superRefine((config, ctx) => {
    const numbers = config.items.map((i) => i.contactNumber);
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Contact numbers must be unique",
      });
    }
    const sorted = [...config.items].sort((a, b) => a.contactNumber - b.contactNumber);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].targetGaWeeks < sorted[i - 1].targetGaWeeks) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items"],
          message: "Later contacts must not target an earlier gestational age",
        });
      }
    }
  });

export interface AncModelConfig {
  model: (typeof ANC_MODELS)[number];
  items: AncModelItem[];
}

// ---- The config bundle a device caches ----

export interface AppClinicalConfig {
  immunization_schedule: ImmunizationSchedule;
  anc_model: AncModelConfig;
}

export const DEFAULT_CLINICAL_CONFIG: AppClinicalConfig = {
  immunization_schedule: DEFAULT_EPI_SCHEDULE,
  anc_model: { model: "who_2016_8", items: ANC_MODEL_ITEMS.who_2016_8 },
};

/** Validate a config value for `key`. Returns the parsed value or the issues. */
export function validateConfig(
  key: ConfigKey,
  value: unknown,
):
  | { ok: true; value: AppClinicalConfig[ConfigKey] }
  | { ok: false; issues: { field: string; issue: string }[] } {
  const schema = key === "immunization_schedule" ? immunizationScheduleSchema : ancModelConfigSchema;
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { ok: true, value: parsed.data as AppClinicalConfig[ConfigKey] };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      field: i.path.join(".") || key,
      issue: i.message,
    })),
  };
}
