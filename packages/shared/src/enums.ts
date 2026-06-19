/**
 * Clinical & system enums — the single source of truth shared by web and (future)
 * API. Mirrors architecture/data-model.md.
 */

// ---- Roles (data-model §3.2, user-roles-and-permissions.md) ----
export const ROLES = [
  "records_clerk",
  "nurse_midwife",
  "chew",
  "doctor_mo",
  "facility_admin",
  "lga_authority",
  "system_admin",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  records_clerk: "Records / Registration Clerk",
  nurse_midwife: "Nurse / Midwife",
  chew: "Community Health Extension Worker",
  doctor_mo: "Doctor / Medical Officer",
  facility_admin: "Facility Administrator",
  lga_authority: "LGA Health Authority / M&E",
  system_admin: "System Administrator",
};

// ---- Patient ----
export const SEXES = ["female", "male"] as const;
export type Sex = (typeof SEXES)[number];

export const PATIENT_STATUSES = ["active", "inactive", "deceased"] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export const LANGUAGES = ["en", "ig"] as const;
export type Language = (typeof LANGUAGES)[number];

// ---- Encounter (EMR) ----
export const ENCOUNTER_TYPES = [
  "general",
  "anc",
  "immunization",
  "pnc",
  "outreach",
  "emergency",
] as const;
export type EncounterType = (typeof ENCOUNTER_TYPES)[number];

export const ENCOUNTER_OUTCOMES = [
  "treated",
  "referred",
  "admitted",
  "followup",
] as const;
export type EncounterOutcome = (typeof ENCOUNTER_OUTCOMES)[number];

// ---- Maternal ----
export const PREGNANCY_STATUSES = [
  "active",
  "delivered",
  "lost",
  "referred_out",
] as const;
export type PregnancyStatus = (typeof PREGNANCY_STATUSES)[number];

export const ANC_SCHEDULE_STATUSES = [
  "scheduled",
  "attended",
  "missed",
] as const;
export type AncScheduleStatus = (typeof ANC_SCHEDULE_STATUSES)[number];

export const ANC_MODELS = ["who_2016_8", "focused_4"] as const;
export type AncModel = (typeof ANC_MODELS)[number];

// ---- Immunization (data-model §3.6 / §4.1) ----
export const ANTIGENS = [
  "bcg",
  "opv",
  "hepb",
  "penta",
  "pcv",
  "rota",
  "ipv",
  "measles",
  "yellow_fever",
  "men_a",
  "vitamin_a",
] as const;
export type Antigen = (typeof ANTIGENS)[number];

export const DOSE_STATUSES = [
  "due",
  "given",
  "missed",
  "not_applicable",
] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

// ---- Queue (data-model §3.7) ----
export const QUEUE_SERVICES = [
  "general",
  "anc",
  "immunization",
  "pnc",
  "other",
] as const;
export type QueueService = (typeof QUEUE_SERVICES)[number];

export const QUEUE_STATUSES = [
  "waiting",
  "in_progress",
  "completed",
  "left_without_being_seen",
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QUEUE_PRIORITIES = ["normal", "priority", "emergency"] as const;
export type QueuePriority = (typeof QUEUE_PRIORITIES)[number];

export const QUEUE_STATIONS = [
  "registration",
  "vitals",
  "consultation",
  "pharmacy",
] as const;
export type QueueStation = (typeof QUEUE_STATIONS)[number];

// ---- Sync state machine (offline-sync-design §4) ----
export const SYNC_STATES = [
  "offline",
  "pending",
  "syncing",
  "synced",
  "conflict",
] as const;
export type SyncState = (typeof SYNC_STATES)[number];
