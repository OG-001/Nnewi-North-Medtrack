# Phase 8 — Reporting & Analytics

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 8 — Reporting & analytics (Module 5)
**Depends on:** Phases 4, 5, 6
**Status:** Planned

---

## 1. Objective

Implement **auto-generated monthly facility reports** aligned to **NHMIS** data
elements, a **DHIS2-compatible export**, **immunization** and **maternal**
analytics (coverage, dropout, ANC attendance), **operational dashboards** per
facility and **rolled up to the LGA**, and a **review/lock** workflow — every
figure **drilling down to its source records** — so the monthly return is a
by-product of normal use, not manual compilation.

## 2. Prerequisites / entry criteria

- Phases 4, 5, 6 done (maternal, immunization, queue/attendance data exists).
- **Open question Q4** resolved: live DHIS2 instance + credentials, or export-file
  only (default: export file). Final **NHMIS data-element mapping** confirmed with
  the LGA M&E (`../architecture/data-model.md` §5).
- Reporting model confirmed (`../architecture/data-model.md` §3.9, §5).

## 3. Scope

**In scope**

- **Monthly report generator**: compute NHMIS-aligned figures (registrations,
  attendance, ANC1/ANC4+, TT/IPTp/IFA, deliveries, referrals, immunization by
  antigen, fully-immunized child, Penta1→Measles1 dropout, Vitamin A) from source
  records, per facility + month.
- **Drill-down**: every figure links to its underlying rows (auditability).
- **Review & lock**: officer-in-charge reviews then **locks/submits**; locked
  figures immutable; later corrections tracked as **adjustments**.
- **DHIS2 export**: produce a standard **import file** (+ CSV/PDF) mapped to the
  agreed data elements; no live API in v1 unless Q4 says otherwise.
- **Analytics dashboards**: immunization (coverage/dropout/defaulters), maternal
  (ANC attendance, interventions, deliveries), operational (registrations,
  queue throughput) — per facility and **LGA rollup** (scope-enforced).
- Date-range + facility filters; CSV/PDF export.

**Out of scope**

- Predictive analytics / ML.
- Live two-way DHIS2 API integration unless Q4 mandates it (export file is the
  v1 contract).
- Admin config UI (Phase 9) — report parameters editable via config now.

## 4. Task breakdown

1. **Aggregation layer**: SQL/queries computing each NHMIS data element from
   source rows; reusable, tested, reconcilable.
2. **Monthly report** entity + generator (`GET /reports/monthly`); `figures`
   JSONB; draft state.
3. **Drill-down**: each figure exposes the query/rows behind it.
4. **Review/lock**: `POST /reports/monthly/:id/lock`; immutability; adjustments
   model.
5. **DHIS2 export**: map figures → dataElement/category-combo per Q4 mapping;
   produce import file + CSV/PDF (`/reports/monthly/:id/export`).
6. **Dashboards**: facility + **LGA rollup** views; coverage/dropout/ANC/queue;
   filters; scope-enforced.
7. **RBAC + audit**: facility report = facility admin/staff read; LGA rollups =
   LGA/M&E; lock = officer-in-charge; report locks + exports audited.
8. **Tests**: unit (each data-element computation vs. worked examples; dropout),
   API (authz, scope, lock immutability), integration (DHIS2 file validates;
   figures reconcile with source; LGA rollup excludes drafts/deleted).

## 5. Deliverables

- Auto-generated, drill-down-able monthly facility report (NHMIS-aligned).
- Review/lock workflow with adjustments.
- DHIS2 import file + CSV/PDF export.
- Immunization/maternal/operational dashboards; facility + LGA rollups.
- Tests green; change-log entry; Q4 + NHMIS mapping recorded.

## 6. Acceptance / exit criteria

- [ ] Monthly report figures **reconcile** with underlying records; each number
      **drills down** to its source rows.
- [ ] A **DHIS2 import file** is produced for a chosen month and validates
      against the agreed mapping.
- [ ] **LGA rollups** aggregate correctly across facilities and **exclude**
      drafts/deleted records.
- [ ] A **locked** monthly report is **immutable**; corrections are tracked as
      adjustments, not silent edits.
- [ ] Reports respect **data-scope** (facility user → own facility; LGA → all).
- [ ] Penta1→Measles1 dropout and antigen coverage match Phase 5 computations.
- [ ] **Exit gate:** Journey 7 (month-end → generate → lock → DHIS2 export)
      demonstrated; M&E confirms the export is usable.

## 7. Governance & guardrails

- **Figures must reconcile** to source — no opaque numbers.
- **Locked = immutable**; corrections auditable (adjustments).
- **Scope-enforced** rollups; LGA reads, doesn't edit clinical data.
- Final NHMIS/DHIS2 mapping confirmed with the LGA (Q4) — don't invent elements.
- No fabricated metrics anywhere (master-plan + repo research standards).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Report figures don't match NHMIS definitions | Confirm mapping with LGA M&E (Q4); unit-test each element vs. worked examples |
| Double-counting (duplicates, cross-facility) | Reconcile with source; dedupe; exclude drafts/deleted; merge tool (Phase 9) |
| DHIS2 file rejected on import | Validate against the target config; dry-run import in staging |
| Heavy aggregation slows the hub | Pre-aggregate/materialise where needed; run generation as a job |
| Locked-report corrections mishandled | Adjustments model + audit; no silent edits |

## 9. Hand-off

Phase 9 (admin) surfaces report access, the **audit log**, **sync/system health**,
config (schedules/templates/stations), and the **patient merge** tool that keeps
report figures clean. Phase 10 verifies reporting end-to-end on the pilot data
before go-live.
