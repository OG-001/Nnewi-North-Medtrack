# Product Spec — Modules & Features

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Status:** Planned
**Reads with:** `user-roles-and-permissions.md`, `user-journeys.md`, `../architecture/data-model.md`

---

This document defines the **10 core modules** in functional detail: what each
does, its key features, representative **user stories**, and **acceptance
criteria** that the build must satisfy. It is the source of truth for *what*
to build; the `../architecture/` docs cover *how*, and the `../implementation/`
phase docs cover *when* and *in what order*.

Conventions used here:

- User stories: *As a `<role>`, I want `<capability>`, so that `<outcome>`.*
- `[MVP]` marks features required for the pilot MVP (phases 0–3, 6).
- Every feature is **offline-capable** unless explicitly marked `[online-only]`.

---

## Module 1 — Patient Registration  *(Phase 2)*

Register new patients quickly and find returning ones instantly.

### Features

- `[MVP]` New patient registration form: name, sex, date of birth (or estimated
  age), phone (primary contact for SMS), address (town/village within LGA),
  next-of-kin, occupation (optional), preferred language.
- `[MVP]` **System-generated MRN** (Medical Record Number) — unique, human-
  readable, facility-prefixed; works offline (see `../architecture/data-model.md`
  for the offline-safe ID scheme).
- `[MVP]` Optional NIN capture (never required; validated for format only).
- `[MVP]` **Duplicate detection** at point of registration: warn if a likely
  match exists (phone + name + DOB) before creating a new record.
- `[MVP]` Fast **patient search** by phone, name, or MRN with type-ahead over
  the local store.
- Patient type/category tags (e.g., antenatal, child <5, general) to drive
  module routing.
- Photo capture (optional, device camera) for visual identification.
- Mark patient deceased / inactive (with reason + audit).

### User stories

- As a **records clerk**, I want to register a new patient in under a minute, so
  that queues at the desk shrink.
- As a **records clerk**, I want to be warned if the patient is probably already
  registered, so that we don't create duplicate files.
- As a **nurse**, I want to pull up a returning patient by phone number, so that
  I see their history without hunting for a paper card.

### Acceptance criteria

- [ ] A new patient can be created and retrieved **fully offline**; the MRN is
      stable and never collides after sync.
- [ ] Searching an existing patient by partial phone/name returns results from
      the local store in < 300 ms on a mid-range device.
- [ ] Attempting to register a probable duplicate surfaces the existing
      record(s) with a "use existing / create anyway" choice.
- [ ] Required fields are validated; NIN is optional and format-checked only.
- [ ] Every create/update is attributed to a user and timestamped (audit).

---

## Module 2 — Electronic Medical Records (EMR)  *(Phase 2)*

The longitudinal clinical record: every visit, note, diagnosis, prescription,
and vital in one place.

### Features

- `[MVP]` **Patient summary screen**: demographics, alerts (allergies, chronic
  conditions), last visit, active programmes (ANC/EPI), and full visit history.
- `[MVP]` **Encounter (visit) record**: date, type, attending staff, presenting
  complaint, vitals (temp, BP, weight, height/length, MUAC for children),
  assessment/diagnosis, clinical notes.
- `[MVP]` **Prescriptions / treatment** given (free text + optional structured
  drug list).
- Diagnosis coding (lightweight, ICD-10 category list or a curated PHC-relevant
  subset; full ICD-10 optional/deferred).
- Allergies & chronic condition flags shown prominently on the summary.
- Attach referral (out to higher facility) with reason and destination.
- Vitals trend view (e.g., weight over time — feeds child growth & maternal).
- Timeline view of all encounters across modules (ANC, immunization, general).

### User stories

- As a **nurse/midwife**, I want every prior visit on one screen, so that I make
  decisions with full history.
- As a **doctor/medical officer**, I want allergies and chronic conditions
  flagged at the top, so that I avoid harmful prescriptions.
- As a **CHEW**, I want to record a visit during outreach offline, so that the
  record is complete when I sync later.

### Acceptance criteria

- [ ] A visit recorded offline appears in the patient's timeline immediately and
      survives sync without loss or duplication.
- [ ] The patient summary loads the full history for a typical patient in
      < 1 s on a mid-range device.
- [ ] Vitals captured in an encounter are reusable by the maternal and child
      modules (no double entry).
- [ ] Referrals are recorded with reason + destination and appear in reports.

---

## Module 3 — Maternal Health (ANC/PNC)  *(Phase 4)*

Antenatal care scheduling, pregnancy monitoring, follow-up, and referral.

### Features

- **Pregnancy / ANC episode**: register a pregnancy with LMP → auto-compute
  **EDD** and gestational age; gravida/para; risk factors.
- **ANC visit schedule engine**: generate the recommended contact schedule from
  a **configurable** model (WHO 2016 8-contact or focused 4-visit — Open
  question Q3). Each scheduled contact has a target date/window.
- **ANC visit record**: gestational age, weight, BP, fundal height, fetal heart
  rate, urine/blood tests, TT (tetanus) doses, IPTp (malaria prophylaxis) doses,
  IFA (iron/folate) supplementation, danger-sign screening.
- **Risk flagging**: auto-flag high-risk pregnancies (age, BP, parity, danger
  signs) for referral.
- **Defaulter tracking**: list of mothers who missed a scheduled ANC contact;
  feeds SMS reminders (Module 8) and CHEW follow-up.
- **Delivery outcome** capture: date, place, mode, outcome (live/still birth),
  baby details → can **create the newborn patient** and link mother↔child.
- **PNC (postnatal) follow-up** schedule and visits.
- **Referral tracking**: out-referrals with reason, destination, and (where
  known) outcome.

### User stories

- As a **midwife**, I want EDD and the full ANC schedule computed from LMP, so
  that I don't calculate dates by hand.
- As a **midwife**, I want a daily list of mothers due or overdue for ANC, so
  that follow-up is proactive, not reactive.
- As a **CHEW**, I want the defaulter list on my device for outreach, so that I
  can visit mothers who missed appointments.
- As a **midwife**, I want delivery to create the baby's record linked to the
  mother, so that immunization can start without re-registration.

### Acceptance criteria

- [ ] Entering LMP produces a correct EDD and a contact schedule matching the
      configured ANC model.
- [ ] A mother who misses a scheduled contact appears on the defaulter list and
      becomes eligible for an SMS reminder.
- [ ] High-risk criteria auto-flag the pregnancy and prompt referral.
- [ ] Recording a delivery can create a linked newborn patient with prefilled
      mother linkage.
- [ ] ANC indicators (TT, IPTp, IFA, visits, referrals) roll up into the monthly
      maternal report (Module 5).

---

## Module 4 — Immunization Tracking  *(Phase 5)*

Childhood (EPI) immunization records, scheduling, due/overdue tracking, and
reporting.

### Features

- **Immunization schedule engine**: per-child schedule generated from a
  **configurable EPI schedule** (antigens × age) — default representative
  schedule in `../architecture/data-model.md`, *editable by admins* and flagged
  "verify against current NPHCDA" (Open question Q2).
- **Per-child immunization card**: doses due, doses given (date, batch/lot, site,
  staff), doses missed, next due date.
- **Due / overdue lists**: children due today / this week / overdue, per antigen.
- **Missed-dose / defaulter alerts** → SMS reminders (Module 8) + outreach.
- **Catch-up logic**: when a child presents late, recompute remaining doses.
- **Adverse Event Following Immunization (AEFI)** capture (basic note + flag).
- **Vitamin A, deworming, growth monitoring** entries (commonly co-delivered on
  immunization days; growth feeds the EMR vitals trend).
- **Batch/lot tracking** on each dose (administration only; *stock* is deferred).

### User stories

- As a **nurse**, I want each child's due and overdue vaccines computed from
  their birth date, so that I know exactly what to give today.
- As a **nurse**, I want a list of children overdue for a dose, so that we can
  recall them.
- As a **caregiver** (beneficiary), I want an SMS before my child's next
  immunization, so that I don't miss it.
- As an **M&E officer**, I want antigen-level coverage and dropout figures, so
  that I can see programme performance.

### Acceptance criteria

- [ ] A child's schedule is generated correctly from DOB and the configured EPI
      schedule, including catch-up when presenting late.
- [ ] Recording a dose captures batch/lot, date, and staff; the next due date
      updates automatically.
- [ ] Overdue children appear on a defaulter list and are eligible for SMS.
- [ ] Antigen coverage and **Penta1→Measles1 dropout** compute correctly into
      the immunization report (Module 5).
- [ ] Editing the EPI schedule (admin) does not corrupt already-recorded doses.

---

## Module 5 — Reporting & Analytics  *(Phase 8)*

Turn day-to-day data into the monthly returns and dashboards the health system
needs.

### Features

- **Auto-generated monthly facility report** aligned to **NHMIS** summary data
  elements (registrations, ANC visits, deliveries, immunizations by antigen,
  referrals, etc.).
- **DHIS2-compatible export** (standard import file + CSV) — Open question Q4.
- **Immunization analytics**: coverage by antigen, dropout rates, defaulter
  counts.
- **Maternal analytics**: ANC attendance, TT/IPTp/IFA coverage, deliveries,
  referrals, high-risk counts.
- **Operational dashboards**: registrations over time, queue/throughput, active
  programmes — per facility and **rolled up to LGA** for the health authority.
- **Date-range and facility filters**; export to CSV/PDF.
- **Report review/lock**: officer-in-charge can review and "submit/lock" a
  monthly report so figures are stable once reported.

### User stories

- As an **officer-in-charge**, I want the monthly NHMIS report generated from
  the data we already entered, so that I stop compiling it by hand.
- As an **M&E / LGA officer**, I want LGA-wide rollups across all PHCs, so that I
  can compare facilities and plan.
- As an **officer-in-charge**, I want to export in a format DHIS2 accepts, so
  that I don't re-key into the national system.

### Acceptance criteria

- [ ] The monthly report's figures **reconcile** with the underlying records
      (auditable: each number drills down to its source rows).
- [ ] A DHIS2 import file is produced for a chosen month and validates against
      the agreed data-element mapping.
- [ ] LGA rollups aggregate correctly across facilities and exclude
      drafts/deleted records.
- [ ] A locked monthly report is immutable; later corrections are tracked as
      adjustments, not silent edits.
- [ ] Reports respect data-scope rules (a facility user sees only their facility;
      LGA users see all).

---

## Module 6 — Queue & Workflow Management  *(Phase 6)*

Manage the in-clinic flow from arrival to departure; cut waiting time.

### Features

- `[MVP]` **Daily queue**: add a patient to today's queue at check-in (new or
  returning), with a visit reason/service (general, ANC, immunization, etc.).
- `[MVP]` **Queue board / list** showing waiting, in-consultation, and completed,
  with wait-time indicators.
- `[MVP]` **Status transitions**: waiting → vitals → consultation → completed
  (configurable stations).
- Assign/claim a patient to a staff member or station.
- Priority/triage flag (e.g., emergency, elderly, infant) that re-orders.
- Per-station queues (e.g., separate immunization vs. general lines on EPI days).
- Daily attendance count auto-feeds reporting.

### User stories

- As a **records clerk**, I want to add an arriving patient to today's queue, so
  that the clinical team knows who is waiting and why.
- As a **nurse**, I want to pick the next waiting patient and move them through
  stations, so that flow is orderly.
- As an **officer-in-charge**, I want to see today's load and wait times, so
  that I can manage staffing.

### Acceptance criteria

- [ ] A patient can be queued and moved through statuses **offline**; the board
      reflects changes immediately on the device.
- [ ] Two devices at the same facility see a consistent queue after sync (queue
      state conflict rules per `../architecture/offline-sync-design.md`).
- [ ] Today's attendance derived from the queue matches the records created.
- [ ] Triage priority correctly re-orders the waiting list.

---

## Module 7 — Staff Management  *(accounts: Phase 1; admin UI: Phase 9)*

Manage the people who use the system and what they can do.

### Features

- Staff accounts: name, role, assigned facility/facilities, contact, status.
- Role assignment from the defined role set (see
  `user-roles-and-permissions.md`).
- Account lifecycle: invite/create, activate, deactivate, reset credentials.
- Per-facility staff directory.
- (Optional) duty/shift note field for context; not a full rostering system.

### User stories

- As a **facility administrator**, I want to create accounts for my staff and
  set their roles, so that each person has appropriate access.
- As a **system administrator**, I want to deactivate a departed staff member,
  so that access is revoked promptly.

### Acceptance criteria

- [ ] A new staff member can be created, assigned a role and facility, and can
      log in with least-privilege access for that role.
- [ ] Deactivating an account immediately blocks login and is audited.
- [ ] A staff member can be scoped to one or more facilities; their data access
      is limited to those facilities (except LGA/system roles).

---

## Module 8 — SMS Notification  *(Phase 7)*

Reminders and alerts to patients/caregivers via SMS; provider-agnostic.

### Features

- **Provider-agnostic SMS service** with **Africa's Talking** and **Termii**
  adapters (Open question Q5); failover/retry; delivery-status capture.
- **Template library** (editable by admin): appointment reminder, missed-visit
  recall, immunization due, ANC due, general notice. Supports **English and Igbo**
  template variants and merge fields (name, date, facility).
- **Triggers**: upcoming ANC contact, upcoming immunization due date, missed
  appointment (defaulter), plus manual/bulk send to a filtered patient list.
- **Scheduling & batching**: queue reminders ahead of due dates; send in
  off-peak windows; respect quiet hours.
- **Opt-out / consent**: per-patient SMS consent flag; honour opt-out; no SMS
  without a valid consent + phone.
- **Send log & audit**: every message, recipient, template, status, cost-bucket.
- `[online-only]` Actual dispatch requires connectivity; messages are **queued
  offline** and sent from the hub when online.

### User stories

- As a **caregiver/mother** (beneficiary), I want a reminder before my (child's)
  appointment, so that I attend on time.
- As a **midwife**, I want defaulters to be reminded automatically, so that I
  don't chase everyone by phone.
- As an **administrator**, I want to edit message templates in Igbo and English,
  so that messages are understood.

### Acceptance criteria

- [ ] Reminders generate from ANC/immunization due dates and send via the
      configured provider with delivery status recorded.
- [ ] A patient without consent or without a valid phone is never messaged.
- [ ] Provider can be switched (Africa's Talking ↔ Termii) via config without
      code changes; failover retries on a transient error.
- [ ] Messages composed offline are queued and dispatched once the hub is online,
      with no duplicates.
- [ ] Template edits (including Igbo variants) take effect for future sends.

---

## Module 9 — Offline Sync Engine  *(designed Phase 0, built Phase 3)*

The backbone that makes everything else work without reliable internet. Full
design in `../architecture/offline-sync-design.md`; summarised here as product
behaviour.

### Behaviour (product-visible)

- **Local-first**: all clinic work reads/writes the on-device store; the network
  is never on the critical path for care.
- **Background sync**: when connectivity returns, local changes push to the hub
  and hub changes pull down, incrementally and resumably.
- **Sync status indicator**: clear UI state — *synced / pending changes /
  syncing / offline / conflict* — with a last-synced timestamp.
- **Conflict handling**: deterministic rules (see offline-sync-design); the rare
  case needing human judgement is surfaced to an admin, never silently dropped.
- **Per-facility scoping**: a device syncs only the data it is entitled to (its
  facility/facilities), keeping the local store small and private.
- **Resilience**: interrupted sync resumes; partial failure never corrupts local
  data; nothing is lost on crash/refresh.

### User stories

- As a **nurse**, I want to keep working when the network drops, so that care
  never stops.
- As a **records clerk**, I want to see whether my data is saved and synced, so
  that I trust the system.
- As an **administrator**, I want conflicts surfaced (not hidden), so that data
  integrity is maintained.

### Acceptance criteria

- [ ] All MVP workflows complete with the network fully disabled, then reconcile
      correctly on reconnect.
- [ ] No data loss across crash/refresh/airplane-mode cycles.
- [ ] Concurrent edits to the same record resolve per the documented rules; any
      unresolved conflict is queued for admin review, not lost.
- [ ] Sync is incremental (changed records only) and resumable after
      interruption.
- [ ] A device only ever holds/syncs data for its authorised facility scope.

---

## Module 10 — Admin Dashboard  *(Phase 9)*

The control centre for facility and LGA administrators.

### Features

- **Facility management**: create/edit facilities (name, code, type, location);
  the LGA facility list (Open question Q1).
- **Staff & roles** management UI (front-end for Module 7).
- **Configuration**: edit the **immunization schedule**, **ANC schedule**, **SMS
  templates**, **service/queue stations**, and report parameters — all as data.
- **Patient record administration**: duplicate **merge** tool, record correction
  with audit, deceased/inactive handling.
- **Audit log viewer**: searchable, filterable trail of who did what, when.
- **Sync & system health**: sync status across devices, pending/conflict counts,
  data volume, last-sync per device.
- **LGA oversight view**: cross-facility dashboards and report access for the
  health authority (data-scope enforced).

### User stories

- As a **facility administrator**, I want to manage staff, facility settings, and
  templates without a developer, so that the system adapts to our needs.
- As an **administrator**, I want to merge duplicate patients, so that history is
  unified and reports aren't double-counted.
- As an **administrator**, I want to read the audit log, so that I can
  investigate and demonstrate accountability under NDPA.

### Acceptance criteria

- [ ] An admin can edit the immunization/ANC schedule and SMS templates and see
      the change reflected for new schedules/sends (without breaking existing
      records).
- [ ] Merging two patient records preserves all history under one MRN and is
      fully audited and reversible by record (or clearly final, by design).
- [ ] The audit log captures create/update/delete/login/permission events with
      actor, timestamp, and facility, and is searchable.
- [ ] Admin views respect data-scope (facility admins see their facility; LGA
      admins see the LGA).

---

## Cross-cutting feature requirements (apply to all modules)

- **Accessibility**: usable on small screens, large tap targets, readable
  contrast, keyboard/screen-reader friendly forms.
- **Internationalisation hooks**: UI strings centralised (full Igbo UI is
  deferred; SMS Igbo is in v1).
- **Audit everywhere**: every create/update/delete/login is attributable and
  timestamped.
- **Soft-delete + recovery**: records are soft-deleted (with audit), not hard
  destroyed, except per retention policy (Open question Q7).
- **Validation**: structured forms validate required fields and ranges (e.g.,
  plausible BP, weight) at entry, offline.
- **Performance budget**: see `../architecture/tech-stack-recommendation.md` for
  bundle and interaction targets on low-end devices.
