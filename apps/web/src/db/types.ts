/**
 * Local (Dexie/IndexedDB) record shapes. Mirror architecture/data-model.md.
 * Every synced entity carries the §2 common columns via `BaseRecord`.
 */
import type {
  AncModel,
  AncScheduleStatus,
  Antigen,
  DoseStatus,
  EncounterOutcome,
  EncounterType,
  Language,
  PatientStatus,
  PregnancyStatus,
  QueuePriority,
  QueueService,
  QueueStation,
  QueueStatus,
  Role,
  Sex,
} from "@phc/shared";

/** Common columns on every synced table (data-model §2). */
export interface BaseRecord {
  id: string; // client-generated UUID
  facility_id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  rev: number; // monotonic per-record revision (conflict detection)
  deleted_at: string | null; // soft delete
  origin_device_id: string;
}

export interface Facility extends BaseRecord {
  code: string; // short MRN-friendly code, e.g. NNW0062
  name: string;
  type: "phc" | "health_post" | "model_phc" | "referral";
  /** Registry classification (from the LGA facility master list). */
  facility_type?: "primary" | "secondary";
  ownership?: "public" | "private";
  /** Full national code, e.g. 04/14/1/1/0062. */
  national_code?: string;
  /** 4-digit facility number, unique within the LGA, e.g. 0062. */
  facility_number?: string;
  ward?: string;
  town?: string;
  lga: string;
  state: string;
  contact_phone?: string;
  active: boolean;
}

export interface UserAccount extends BaseRecord {
  full_name: string;
  username: string;
  pin: string; // demo-only local auth (real auth is backend Phase 1)
  phone: string;
  status: "invited" | "active" | "disabled";
  roles: Role[];
  facility_ids: string[]; // data scope
  last_login_at: string | null;
}

export interface Patient extends BaseRecord {
  mrn: string;
  home_facility_id: string;
  first_name: string;
  last_name: string;
  other_names?: string;
  sex: Sex;
  date_of_birth: string | null;
  dob_estimated: boolean;
  phone_primary: string;
  phone_alt?: string;
  address_town?: string;
  ward?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  next_of_kin_relation?: string;
  occupation?: string;
  preferred_language: Language;
  sms_consent: boolean;
  nin?: string;
  status: PatientStatus;
  deceased_date?: string;
  deceased_reason?: string;
  category_tags: string[];
  allergies: string[];
  chronic_conditions: string[];
}

export interface PatientLink extends BaseRecord {
  from_patient_id: string;
  to_patient_id: string;
  relation: "mother_of" | "child_of" | "guardian_of";
}

export interface Encounter extends BaseRecord {
  patient_id: string;
  encounter_date: string;
  type: EncounterType;
  attending_user_id: string;
  presenting_complaint?: string;
  notes?: string;
  outcome?: EncounterOutcome;
  // vitals (kept inline — 1:1 in practice for a PHC visit)
  temperature_c?: number;
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  resp_rate?: number;
  weight_kg?: number;
  height_cm?: number;
  muac_mm?: number;
  spo2?: number;
  // assessment
  diagnosis?: string;
  prescription?: string;
  queue_entry_id?: string;
}

export interface Referral extends BaseRecord {
  patient_id: string;
  encounter_id?: string;
  reason: string;
  destination_facility: string;
  urgency: "routine" | "urgent" | "emergency";
  referred_by: string;
  outcome?: string;
}

export interface Pregnancy extends BaseRecord {
  patient_id: string;
  lmp: string;
  edd: string;
  gravida?: number;
  para?: number;
  anc_model: AncModel;
  risk_flags: string[];
  status: PregnancyStatus;
}

export interface AncScheduleItem extends BaseRecord {
  pregnancy_id: string;
  patient_id: string;
  contact_number: number;
  target_date: string;
  window_start: string;
  window_end: string;
  status: AncScheduleStatus;
  anc_visit_id?: string;
}

export interface AncVisit extends BaseRecord {
  pregnancy_id: string;
  patient_id: string;
  encounter_id?: string;
  visit_date: string;
  gestational_age_weeks: number;
  weight_kg?: number;
  systolic?: number;
  diastolic?: number;
  fundal_height_cm?: number;
  fetal_heart_rate?: number;
  urine_protein?: string;
  pcv_or_hb?: number;
  tt_dose_number?: number;
  iptp_dose_number?: number;
  ifa_given: boolean;
  danger_signs: string[];
  next_target_date?: string;
}

export interface Delivery extends BaseRecord {
  pregnancy_id: string;
  patient_id: string;
  delivery_date: string;
  place: "facility" | "home" | "other_facility";
  mode: "svd" | "assisted" | "cs";
  outcome: "live_birth" | "still_birth" | "neonatal_death";
  birth_weight_kg?: number;
  baby_patient_id?: string;
  attended_by?: string;
}

export interface ImmunizationDose extends BaseRecord {
  patient_id: string;
  schedule_item_id: string;
  antigen: Antigen;
  dose_label: string;
  status: DoseStatus;
  due_date: string;
  given_date?: string;
  batch_lot?: string;
  site?: string;
  given_by?: string;
  notes?: string;
}

export interface QueueEntry extends BaseRecord {
  patient_id: string;
  queue_date: string;
  service: QueueService;
  station: QueueStation;
  status: QueueStatus;
  priority: QueuePriority;
  assigned_user_id?: string;
  checked_in_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface SmsMessage extends BaseRecord {
  patient_id: string;
  template_key: string;
  language: Language;
  rendered_body: string;
  to_phone: string;
  status:
    | "queued"
    | "sent"
    | "delivered"
    | "failed"
    | "skipped_no_consent";
  scheduled_for: string;
  triggered_by: "reminder_job" | "manual" | "bulk";
}

export interface MonthlyReport extends BaseRecord {
  period_year: number;
  period_month: number;
  status: "draft" | "locked";
  generated_at: string;
  locked_by?: string;
  locked_at?: string;
  figures: Record<string, number>;
}

/** Append-only audit (data-model §3.10). */
export interface AuditEvent {
  id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  facility_id: string;
  at: string;
  details?: Record<string, unknown>;
  device_id: string;
}

/** Local change-log of mutations not yet acked by the hub (outbox). */
export interface OutboxEntry {
  localSeq?: number; // auto-increment (local only)
  entity_type: string;
  entity_id: string;
  op: "upsert" | "delete";
  payload: unknown;
  rev: number;
  created_at: string;
  status: "pending" | "in_flight" | "acked" | "conflict";
}

export interface SyncMeta {
  key: string; // singleton "meta"
  server_seq_watermark: number;
  last_sync_at: string | null;
  device_id: string;
}
