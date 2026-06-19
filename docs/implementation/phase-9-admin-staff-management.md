# Phase 9 — Admin Dashboard & Staff Management

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 9 — Admin dashboard & staff management (Modules 7 & 10)
**Depends on:** Phases 1 & 8
**Status:** Planned

---

## 1. Objective

Deliver the **admin control centre**: full UIs for **facility management**,
**staff & roles** (front-end for the Phase 1 model), **configuration** of the
immunization/ANC schedules, SMS templates, and queue stations (all as data),
**patient duplicate merge**, the **audit-log viewer**, **sync/system health**,
and the **LGA oversight** view — so facility and LGA administrators can run and
adapt the system without a developer, and meet NDPA accountability needs.

## 2. Prerequisites / entry criteria

- Phase 1 (accounts/roles/RBAC/audit) and Phase 8 (reports/dashboards) done.
- Phases 4/5/7 done (so schedules + templates exist to manage).
- **Open question Q8** (final product name/branding) — applied here in UI polish.

## 3. Scope

**In scope**

- **Facility management UI**: create/edit facilities (name, code, type, location)
  — the LGA list (Q1).
- **Staff & roles UI**: create/invite/deactivate/reset; assign role + facility
  scope; per-facility permission toggles (prescribe/diagnose/schedule-edit).
- **Configuration UIs** (data, not code): **immunization schedule** (versioned,
  edit-safe), **ANC model**, **SMS templates** (EN/IG), **queue stations**, report
  parameters.
- **Patient merge tool**: review candidates side-by-side; merge histories under a
  surviving MRN; audited.
- **Audit-log viewer**: searchable/filterable by actor/action/entity/facility/
  date; read-only; scope-enforced.
- **Sync & system health**: per-device sync status, pending/conflict counts,
  the **conflict-review queue** (from Phase 3 escalation), data volume,
  last-sync; system health endpoints surfaced.
- **LGA oversight**: cross-facility dashboards + report access (scope-enforced).
- **Branding/naming** finalised (Q8) via the single config value.

**Out of scope**

- Production deployment/hardening/rollout (Phase 10).
- New clinical features (this phase is administration over existing modules).

## 4. Task breakdown

1. **Facility mgmt UI** over Phase 1 endpoints.
2. **Staff & roles UI**: lifecycle + role/scope + per-facility permission toggles
   (bounded by the role matrix).
3. **Config UIs**: immunization schedule (versioned, edit-safe per Phase 5), ANC
   model (Phase 4), SMS templates EN/IG (Phase 7), queue stations (Phase 6).
4. **Merge tool**: candidate review + merge (Module 10/Journey 10); audited;
   triggers report recompute.
5. **Audit viewer**: search/filter; scope-enforced; export.
6. **Sync/system health**: device sync overview + **conflict-review queue**
   resolution UI; health/metrics surfaced.
7. **LGA oversight**: rollup dashboards + report access (scope: lga).
8. **Branding**: apply final name/theme via central config (Q8); accessibility
   pass.
9. **RBAC + audit + tests**: facility admin = own facility; system admin = all;
   LGA = read LGA; unit/API/e2e incl. merge-correctness and audit coverage.

## 5. Deliverables

- Admin UIs: facilities, staff/roles, configuration, merge, audit viewer,
  sync/system health, LGA oversight.
- Conflict-review queue resolution UI (closes the Phase 3 escalation loop).
- Final branding/name applied via config.
- Tests green; change-log entry; Q8 (+ Q1 final list) recorded.

## 6. Acceptance / exit criteria

- [ ] An admin edits the **immunization/ANC schedule** and **SMS templates** and
      the change applies to **future** schedules/sends **without breaking
      existing records**.
- [ ] **Merging** two patients preserves all history under one MRN, is fully
      **audited**, and corrects double-counting in reports.
- [ ] The **audit-log viewer** shows create/update/delete/login/permission/
      sensitive-access events with actor/time/facility and is searchable +
      scope-enforced.
- [ ] **Sync/system health** shows per-device status + the conflict-review queue;
      an admin can resolve an escalated conflict.
- [ ] Admin views respect **data-scope** (facility admin → own; LGA → LGA; system
      admin → all, no clinical edit).
- [ ] Final product name/branding applied via the single config value (Q8).
- [ ] **Exit gate:** owner reviews admin capabilities + Journey 9 & 10.

## 7. Governance & guardrails

- Configurable permissions/schedules **cannot exceed** the role matrix / corrupt
  history (versioned schedules; edit-safety from Phases 4/5).
- **Merge is audited** and corrects reports; no silent record loss.
- **System admin** has no default clinical edit; break-glass only, audited.
- Audit viewer is **read-only** + scope-enforced.
- Branding via central config (rename = one edit; Q8).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Config edits corrupt existing records | Versioned schedules; edit-safety tests (Phases 4/5); bind records to versions |
| Bad merge loses history | Side-by-side review; audited, recompute reports; test merge correctness |
| Over-broad admin permissions | Bound to role matrix; per-facility toggles capped; tested |
| Audit viewer leaks across scope | Scope-enforced queries; tested for cross-scope access |
| Late branding churn | Central config value; theme tokens; do branding once here |

## 9. Hand-off

Phase 10 consumes a feature-complete v1 (all modules + admin) and takes it to
production: deployment, NDPA hardening, backups/restore, performance/security
verification, training, UAT, and **pilot → LGA rollout**.
