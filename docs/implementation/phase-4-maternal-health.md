# Phase 4 — Maternal Health (ANC/PNC)

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 4 — Maternal health (Module 3)
**Depends on:** Phase 3 (may run in parallel with Phases 5, 6)
**Status:** Planned

---

## 1. Objective

Implement antenatal care: a **pregnancy/ANC episode** with LMP→EDD and a
**configurable ANC schedule engine**, **ANC visit** recording (TT/IPTp/IFA,
danger-sign screening, fundal height, etc.), **risk flagging + referral**,
**defaulter tracking**, **delivery outcome** (with linked newborn creation), and
**PNC follow-up** — all offline-capable and syncing — so midwives and CHEWs can
proactively follow pregnancies through to delivery and the postnatal period.

## 2. Prerequisites / entry criteria

- Phase 3 done: offline + sync foundation; patient + encounter + vitals (Phase 2).
- **Open question Q3** resolved (ANC model: WHO-2016 8-contact default vs.
  focused 4-visit) — or ship both as config with the documented default.
- ANC/maternal data model confirmed (`../architecture/data-model.md` §3.5).

## 3. Scope

**In scope**

- **Pregnancy/ANC episode**: register with LMP → compute **EDD** (Naegele) +
  gestational age; gravida/para; risk factors.
- **ANC schedule engine**: generate `anc_schedule_item`s from the configurable
  `anc_model` (Q3); target dates/windows; status (scheduled/attended/missed).
- **ANC visit**: gestational age, weight, BP, fundal height, FHR, urine/blood
  tests, **TT** dose tracking, **IPTp** doses, **IFA** supplementation, danger-
  sign screening, counselling, next target date. Reuses Phase 2 vitals.
- **Risk flagging**: auto-flag high-risk (age, BP, parity, danger signs) → prompt
  **referral** (reuses Phase 2 referral).
- **Defaulter tracking**: list of mothers who missed a contact (offline-available
  for CHEW outreach); becomes SMS-eligible in Phase 7.
- **Delivery**: outcome capture; **create linked newborn patient** (mother↔child
  link); start PNC schedule.
- **PNC**: postnatal follow-up schedule + visits.
- Conflict classes confirmed against `../architecture/offline-sync-design.md` §5
  (ANC visits = append-only; schedule-item status = state-priority).

**Out of scope**

- SMS dispatch (Phase 7) — defaulters are *flagged* here; reminders sent there.
- Maternal report figures (Phase 8) — but capture all fields the report needs.
- Newborn **immunization** (Phase 5) — the link is created here; EPI starts there.

## 4. Task breakdown

1. **Pregnancy entity** + EDD/GA computation (shared util in `packages/shared`).
2. **ANC schedule engine**: generate contacts from `anc_model` config; expose
   due/overdue queries.
3. **ANC visit form** + entity; reuse vitals; capture TT/IPTp/IFA/danger-signs;
   mark schedule item attended; set next target.
4. **Risk rules**: configurable high-risk criteria → flag + referral prompt.
5. **Defaulter list**: `GET /maternal/defaulters?facility=&asOf=`; offline-
   available list for outreach; outcome capture.
6. **Delivery + newborn**: delivery form; create linked newborn `patient`
   (prefilled, mother link); start PNC schedule.
7. **PNC**: schedule + visit capture.
8. **RBAC + audit**: nurse/midwife/CHEW/doctor per matrix; all writes audited.
9. **Tests**: unit (EDD/GA, schedule gen, risk rules, catch-up of missed), API
   (authz), **offline e2e** (register pregnancy → record visits → miss one →
   defaulter list → delivery → newborn created → all syncs).

## 5. Deliverables

- ANC episode + schedule engine (configurable model).
- ANC visit capture with TT/IPTp/IFA + danger-sign screening.
- Risk flagging + referral; defaulter list (offline).
- Delivery outcome + linked newborn; PNC schedule.
- Offline e2e + unit tests green; change-log entry; Q3 recorded.

## 6. Acceptance / exit criteria

- [ ] LMP produces correct EDD + a contact schedule matching the configured ANC
      model; works offline.
- [ ] A missed scheduled contact puts the mother on the **defaulter list**
      (SMS-eligible flag set for Phase 7).
- [ ] High-risk criteria auto-flag and prompt a referral.
- [ ] Recording a delivery can **create a linked newborn patient** with mother
      linkage prefilled.
- [ ] All maternal fields the monthly report needs (ANC1/ANC4+, TT2+, IPTp, IFA,
      deliveries, referrals, high-risk) are captured and queryable.
- [ ] Maternal data created offline reconciles correctly (append-only visits;
      state-priority schedule status).
- [ ] **Exit gate:** midwife-led walkthrough of Journey 3 (ANC → delivery →
      newborn) passes.

## 7. Governance & guardrails

- **ANC schedule is config, not code** (master plan Principle 7; Q3).
- Clinical defaults (risk criteria, intervention schedules) reviewed with a
  clinician; flagged "verify against current WHO/NPHCDA guidance".
- All writes RBAC-scoped + audited; offline-first preserved.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wrong ANC model encoded | Configurable model (Q3); clinician review; default documented |
| EDD/GA math errors | Single shared, unit-tested utility; test boundary cases |
| Defaulter list inaccurate | Derive from schedule-item status; test miss/catch-up; offline-available |
| Newborn link errors | Atomic create+link; test mother↔child linkage and dedup |
| Double entry of vitals | Reuse Phase 2 vitals structure |

## 9. Hand-off

Phase 7 (SMS) consumes the **defaulter + upcoming-contact** signals to send
reminders. Phase 8 (reporting) consumes ANC/delivery/referral data for the
maternal section. Phase 5 (immunization) consumes the **linked newborn** to start
the EPI schedule.
