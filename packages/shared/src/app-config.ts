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
import { ANTIGENS, ANC_MODELS, QUEUE_STATIONS, ROLES } from "./enums";
import { PERMISSIONS, type Permission } from "./permissions";
import type { Role } from "./enums";
import { DEFAULT_EPI_SCHEDULE, type ImmunizationSchedule } from "./immunization-schedule";
import { ANC_MODEL_ITEMS, type AncModelItem } from "./anc-model";

/** Config keys the hub stores and the device caches. */
export const CONFIG_KEYS = [
  "immunization_schedule",
  "anc_model",
  "queue_stations",
  "facility_permissions",
] as const;
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

// ---- Queue stations ----

/**
 * Stations are **relabelled, reordered, and switched off** through config, not
 * invented. `QueueStation` is a typed enum stored on every queue row, so a
 * genuinely new station would need a code change and a local-store migration.
 *
 * What a PHC actually needs is covered: one with no pharmacy switches it off,
 * one that calls vitals something else relabels it. Recorded as a deliberate
 * limit rather than presented as full freedom.
 */
export const queueStationSchema = z.object({
  key: z.enum(QUEUE_STATIONS),
  label: z.string().min(1).max(40),
  order: z.number().int().min(0).max(50),
  active: z.boolean(),
});

export const queueStationsConfigSchema = z
  .object({ stations: z.array(queueStationSchema).min(1) })
  .superRefine((config, ctx) => {
    const keys = config.stations.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stations"], message: "Each station may appear once" });
    }
    // Every known station must be present, even if switched off: a queue row
    // already recorded at a missing station would have nowhere to belong.
    for (const known of QUEUE_STATIONS) {
      if (!keys.includes(known)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stations"],
          message: `Station "${known}" cannot be removed; switch it off instead`,
        });
      }
    }
    if (!config.stations.some((s) => s.active)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stations"], message: "At least one station must stay active" });
    }
  });

export interface QueueStationConfig {
  stations: { key: (typeof QUEUE_STATIONS)[number]; label: string; order: number; active: boolean }[];
}

const DEFAULT_STATION_LABELS: Record<(typeof QUEUE_STATIONS)[number], string> = {
  registration: "Registration",
  vitals: "Vitals",
  consultation: "Consultation",
  pharmacy: "Pharmacy",
};

export const DEFAULT_QUEUE_STATIONS: QueueStationConfig = {
  stations: QUEUE_STATIONS.map((key, index) => ({
    key,
    label: DEFAULT_STATION_LABELS[key],
    order: index,
    active: true,
  })),
};

/** Active stations, in the configured order. The queue flow follows this. */
export function activeStations(config: QueueStationConfig) {
  return [...config.stations].filter((s) => s.active).sort((a, b) => a.order - b.order);
}

// ---- Per-facility permission toggles ----

/**
 * A facility may **withdraw** a permission from a role, never add one.
 *
 * `rbac-and-scope.md` section 3: per-facility permissions "can never exceed the
 * role matrix". So this is a deny list, not a grant list. A PHC with no
 * prescribing cover switches `prescribe` off for its nurses; nothing here can
 * give a clerk a clinical permission the matrix withholds.
 */
export const facilityPermissionsConfigSchema = z.object({
  facilities: z.record(
    z.string().min(1),
    z.record(z.enum(ROLES), z.array(z.enum(PERMISSIONS))),
  ),
});

export interface FacilityPermissionsConfig {
  /** facilityId -> role -> permissions withdrawn at that facility. */
  facilities: Record<string, Partial<Record<Role, Permission[]>>>;
}

export const DEFAULT_FACILITY_PERMISSIONS: FacilityPermissionsConfig = { facilities: {} };

/** Permissions withdrawn from `roles` at `facilityId`. */
export function withdrawnPermissions(
  config: FacilityPermissionsConfig,
  facilityId: string | null,
  roles: Role[],
): Permission[] {
  if (!facilityId) return [];
  const forFacility = config.facilities?.[facilityId];
  if (!forFacility) return [];
  const denied = new Set<Permission>();
  for (const role of roles) {
    for (const permission of forFacility[role] ?? []) denied.add(permission);
  }
  return [...denied];
}

// ---- The config bundle a device caches ----

export interface AppClinicalConfig {
  immunization_schedule: ImmunizationSchedule;
  anc_model: AncModelConfig;
  queue_stations: QueueStationConfig;
  facility_permissions: FacilityPermissionsConfig;
}

export const DEFAULT_CLINICAL_CONFIG: AppClinicalConfig = {
  immunization_schedule: DEFAULT_EPI_SCHEDULE,
  anc_model: { model: "who_2016_8", items: ANC_MODEL_ITEMS.who_2016_8 },
  queue_stations: DEFAULT_QUEUE_STATIONS,
  facility_permissions: DEFAULT_FACILITY_PERMISSIONS,
};

/** Validate a config value for `key`. Returns the parsed value or the issues. */
export function validateConfig(
  key: ConfigKey,
  value: unknown,
):
  | { ok: true; value: AppClinicalConfig[ConfigKey] }
  | { ok: false; issues: { field: string; issue: string }[] } {
  const schema =
    key === "immunization_schedule"
      ? immunizationScheduleSchema
      : key === "anc_model"
        ? ancModelConfigSchema
        : key === "queue_stations"
          ? queueStationsConfigSchema
          : facilityPermissionsConfigSchema;
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
