/**
 * Dexie/IndexedDB store — the on-device system of record (offline-sync-design §2).
 * Indexes follow data-model §7 (search by phone/mrn/name; queue by date/status;
 * doses by patient/status/due; anc items by status/target).
 */
import Dexie, { type Table } from "dexie";
import type {
  AncScheduleItem,
  AncVisit,
  AuditEvent,
  Delivery,
  Encounter,
  Facility,
  ImmunizationDose,
  MonthlyReport,
  OutboxEntry,
  Patient,
  PatientLink,
  Pregnancy,
  QueueEntry,
  Referral,
  SmsMessage,
  SyncMeta,
  UserAccount,
} from "./types";

export class PhcDatabase extends Dexie {
  facilities!: Table<Facility, string>;
  users!: Table<UserAccount, string>;
  patients!: Table<Patient, string>;
  patientLinks!: Table<PatientLink, string>;
  encounters!: Table<Encounter, string>;
  referrals!: Table<Referral, string>;
  pregnancies!: Table<Pregnancy, string>;
  ancScheduleItems!: Table<AncScheduleItem, string>;
  ancVisits!: Table<AncVisit, string>;
  deliveries!: Table<Delivery, string>;
  immunizationDoses!: Table<ImmunizationDose, string>;
  queueEntries!: Table<QueueEntry, string>;
  smsMessages!: Table<SmsMessage, string>;
  monthlyReports!: Table<MonthlyReport, string>;
  auditEvents!: Table<AuditEvent, string>;
  outbox!: Table<OutboxEntry, number>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super("phc-track");
    this.version(1).stores({
      facilities: "id, code, active",
      users: "id, username, status",
      patients:
        "id, mrn, phone_primary, first_name, last_name, home_facility_id, status, *category_tags",
      patientLinks: "id, from_patient_id, to_patient_id",
      encounters: "id, patient_id, encounter_date, type, [patient_id+encounter_date]",
      referrals: "id, patient_id, encounter_id",
      pregnancies: "id, patient_id, status",
      ancScheduleItems:
        "id, pregnancy_id, patient_id, status, target_date, [status+target_date]",
      ancVisits: "id, pregnancy_id, patient_id, visit_date",
      deliveries: "id, pregnancy_id, patient_id",
      immunizationDoses:
        "id, patient_id, status, due_date, [patient_id+status], [status+due_date]",
      queueEntries:
        "id, patient_id, queue_date, status, [facility_id+queue_date+status]",
      smsMessages: "id, patient_id, status, scheduled_for",
      monthlyReports: "id, [period_year+period_month], status",
      auditEvents: "id, actor_user_id, entity_id, at",
      outbox: "++localSeq, entity_id, status",
      syncMeta: "key",
    });
  }
}

export const db = new PhcDatabase();
