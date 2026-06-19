# Phase 6 — Queue & Workflow Management

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 6 — Queue & workflow (Module 6)
**Depends on:** Phase 3 (may run in parallel with Phases 4, 5) — **completes the MVP**
**Status:** Planned

---

## 1. Objective

Implement the in-clinic **daily queue and workflow**: check-in to today's queue
with a service reason, a **queue board** showing waiting / in-progress /
completed with wait times and triage priority, **status transitions** across
configurable stations, and staff assignment — all offline-capable and converging
across devices via sync — so clinics run an orderly flow, cut waiting time, and
produce accurate daily attendance. **This phase completes the pilot MVP
(0,1,2,3,6).**

## 2. Prerequisites / entry criteria

- Phase 3 done: offline + sync foundation; patient + encounter (Phase 2).
- Queue data model + the **state-priority conflict rule** confirmed
  (`../architecture/data-model.md` §3.7; `../architecture/offline-sync-design.md`
  §5–6).

## 3. Scope

**In scope**

- **Check-in**: add a patient (new or returning) to today's queue with a service
  (`general`/`anc`/`immunization`/`pnc`/`other`) and station.
- **Queue board**: waiting / in-progress / completed, wait-time indicators,
  triage priority re-ordering.
- **Status transitions**: configurable stations (registration → vitals →
  consultation → …); claim/assign to staff/station.
- **Triage priority** (normal/priority/emergency) re-orders the waiting list.
- **Per-station queues** (e.g., separate immunization vs. general lines on EPI
  days).
- **Daily attendance** derived from the queue (feeds Phase 8 reporting).
- **Offline + multi-device convergence**: queue state syncs; concurrent edits
  resolve via **state-priority** (`completed` > `in_progress` > `waiting`,
  `given` > `due`; ties → last-writer).
- Link a queue entry to the **encounter** created during the visit (Phase 2).

**Out of scope**

- Cross-day scheduling / appointments (v1 is same-day queue; SMS reminders are
  Phase 7).
- Reporting dashboards (Phase 8) — attendance is *captured* here.

## 4. Task breakdown

1. **`queue_entry` entity** + Dexie indexes (`facility_id, queue_date, status`).
2. **Check-in flow**: from search/registration → queue with service + station +
   priority.
3. **Queue board UI**: columns by status; wait-time badges; priority ordering;
   per-station filter; live updates from the local store.
4. **Status transitions + assignment**: move through stations; claim next;
   complete; left-without-being-seen.
5. **Encounter link**: opening/serving a queued patient ties to the Phase 2
   encounter.
6. **Attendance derivation**: daily counts by service/station for reporting.
7. **Sync conflict**: confirm/implement **state-priority** rule for queue status;
   two-device convergence test.
8. **RBAC + audit**: clerk + clinical staff per matrix; transitions audited.
9. **Tests**: unit (priority ordering, attendance derivation), API (authz),
   **offline e2e** (Journey 5: check-in → move through stations → complete →
   two-device convergence after sync).

## 5. Deliverables

- Daily queue + board with status, stations, triage, assignment.
- Offline-capable, multi-device-convergent queue (state-priority).
- Daily attendance derivation for reporting.
- Offline e2e + unit tests green; change-log entry.
- **MVP milestone:** with this phase, the pilot MVP (0,1,2,3,6) is complete.

## 6. Acceptance / exit criteria

- [ ] A patient can be queued and moved through statuses/stations **offline**;
      the board updates immediately on the device.
- [ ] Two devices at the same facility converge to a **consistent queue** after
      sync (state-priority rule verified).
- [ ] Triage priority correctly re-orders the waiting list.
- [ ] Daily **attendance** derived from the queue matches the records created.
- [ ] Queue transitions are RBAC-scoped + audited.
- [ ] **Exit gate (MVP gate):** an end-to-end **pilot dry-run** on the MVP set
      (register → queue → record visit → offline → sync → attendance) passes;
      owner approves MVP for a pilot site.

## 7. Governance & guardrails

- **Offline-first** + state-priority convergence are non-negotiable for the
  shared board.
- Stations are **config** (admin-editable; full UI in Phase 9).
- Attendance must reconcile with records (no phantom counts) — feeds reporting.
- RBAC-scoped + audited.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Queue diverges across devices | State-priority conflict rule; two-device convergence test in e2e |
| Double-counted attendance | Derive attendance from de-duplicated queue/records; reconcile in tests |
| Confusing multi-station UX | Mirror real clinic flow; clerk/nurse walkthrough; keep taps minimal |
| Stale queue at day boundary | Scope queue by `queue_date`; clear/rollover logic tested |

## 9. Hand-off

Phase 8 (reporting) consumes daily **attendance/throughput** from the queue.
With Phases 0–3 + 6 complete, the **MVP is pilot-ready**; Phases 4, 5, 7, 8, 9,
10 extend it to full v1. Phase 7 will add the *cross-day* reminder layer the
same-day queue intentionally omits.
