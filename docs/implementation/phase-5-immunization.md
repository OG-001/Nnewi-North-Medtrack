# Phase 5 — Immunization Tracking

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 5 — Immunization tracking (Module 4)
**Depends on:** Phase 3 (may run in parallel with Phases 4, 6)
**Status:** Planned

---

## 1. Objective

Implement childhood immunization: a **configurable EPI schedule engine** that
computes each child's **due/overdue** doses from DOB, **dose recording**
(antigen, date, batch/lot, site, staff) with automatic next-due, **catch-up**
logic for late presenters, **defaulter lists**, **AEFI** capture, and co-delivered
**Vitamin A / deworming / growth monitoring** — all offline-capable and syncing —
so nurses know exactly what to give each child and the programme can track
coverage and dropout.

## 2. Prerequisites / entry criteria

- Phase 3 done: offline + sync; patient + vitals (Phase 2); newborn linkage
  available from Phase 4 (not strictly blocking — children can also be registered
  directly).
- **Open question Q2** resolved (current NPHCDA immunization schedule) — or ship
  the seed schedule in `../architecture/data-model.md` §4.1 as **editable config**
  flagged "verify against current NPHCDA".
- Immunization data model confirmed (`../architecture/data-model.md` §3.6).

## 3. Scope

**In scope**

- **EPI schedule config** (`immunization_schedule` + `_item`, versioned,
  admin-editable) seeded from §4.1.
- **Schedule engine**: per-child `immunization_record` + computed
  `immunization_dose` rows (due dates from DOB + schedule); **catch-up**
  recompute when a child presents late; respect `min_age_days`.
- **Per-child immunization card**: due / given / overdue, next due.
- **Dose recording**: antigen, date, **batch/lot**, site, staff → auto-update
  next due.
- **Due / overdue lists**: due today/this week, overdue, per antigen
  (`GET /immunization/due`, `/immunization/defaulters`).
- **AEFI** capture (note + flag).
- **Co-delivered**: Vitamin A, deworming, **growth monitoring** (weight/MUAC via
  Phase 2 vitals).
- **Coverage/dropout** computations exposed for reporting incl. **Penta1→Measles1
  dropout**.
- Conflict classes confirmed (`offline-sync-design.md` §5: doses = append-only;
  dose status = state-priority; schedule = hub-authoritative config).

**Out of scope**

- SMS reminders (Phase 7) — overdue children are *flagged* here.
- Vaccine **stock / cold-chain** (deferred, master plan §9) — only *administration*
  + batch are tracked.
- Report rendering (Phase 8) — but expose the computations it needs.

## 4. Task breakdown

1. **Schedule config**: seed §4.1; admin-editable, versioned; ensure edits don't
   corrupt already-recorded doses.
2. **Schedule engine**: generate per-child due dates from DOB + active schedule;
   `min_age` guard; **catch-up** recompute for late presenters.
3. **Immunization card** UI: due/given/overdue + next due, computed live.
4. **Dose recording**: capture antigen/date/batch/site/staff; advance next due;
   validate against min age (422 `BUSINESS_RULE_VIOLATION` if too early).
5. **Due/overdue + defaulter** queries + lists (offline-available for outreach).
6. **AEFI** capture + flag.
7. **Co-delivered services**: Vitamin A, deworming, growth (reuse vitals).
8. **Coverage/dropout** computations (antigen coverage; Penta1→Measles1 dropout).
9. **RBAC + audit**; **tests**: unit (schedule gen, catch-up, dropout math),
   API (authz, min-age rule), **offline e2e** (Journey 4: register child → due
   list → record doses → next due → overdue → defaulter → sync).

## 5. Deliverables

- Configurable EPI schedule + per-child schedule engine with catch-up.
- Immunization card; dose recording with batch; due/overdue/defaulter lists.
- AEFI capture; Vitamin A/deworming/growth.
- Coverage + Penta1→Measles1 dropout computations.
- Offline e2e + unit tests green; change-log entry; Q2 recorded.

## 6. Acceptance / exit criteria

- [ ] A child's schedule generates correctly from DOB + configured EPI schedule,
      including **catch-up** when presenting late; works offline.
- [ ] Recording a dose captures **batch/lot** + staff and updates next due
      automatically; doses before min age are rejected with a clear rule error.
- [ ] Overdue children appear on the **defaulter list** (SMS-eligible flag for
      Phase 7).
- [ ] Antigen coverage and **Penta1→Measles1 dropout** compute correctly.
- [ ] **Editing the EPI schedule (admin) does not corrupt** already-recorded
      doses.
- [ ] Immunization data created offline reconciles correctly.
- [ ] **Exit gate:** nurse-led walkthrough of Journey 4 (EPI day) passes.

## 7. Governance & guardrails

- **EPI schedule is config, not code** (Principle 7; Q2); flagged "verify vs.
  current NPHCDA".
- Schedule **versioning**: changing the schedule must not rewrite history.
- Min-age and clinical rules reviewed with a clinician.
- RBAC-scoped + audited; offline-first preserved.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Schedule out of date / wrong antigens | Editable, versioned config (Q2); clinician verification before pilot |
| Catch-up logic errors | Unit-test late-presenter scenarios across antigens |
| Schedule edit corrupts existing doses | Version schedules; bind doses to a schedule version; test edit safety |
| Dropout/coverage miscomputed | Unit-test against worked examples; reconcile with source rows |
| Confusion with stock tracking | Scope note: administration + batch only; stock deferred |

## 9. Hand-off

Phase 7 (SMS) consumes the **due + overdue (defaulter)** signals for reminders.
Phase 8 (reporting) consumes doses, coverage, and dropout for the immunization
report section + DHIS2 export.
