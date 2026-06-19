# Product Spec — User Roles & Permissions (RBAC)

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Status:** Planned
**Reads with:** `modules-and-features.md`, `../architecture/security-and-compliance.md`

---

This document defines **who can use the system**, **what each role can do**, and
the **data-scope rules** that bound every action. It is the authority for the
access-control implementation in Phase 1 and the enforcement points throughout.

Access control has **two dimensions** that are always combined:

1. **Role** — what *kind* of action a user may take (the permission set).
2. **Data scope** — *which records* a user may act on (their facility, several
   facilities, or the whole LGA).

> A permission check passes only if **both** the role grants the action **and**
> the target record is within the user's data scope.

---

## 1. Roles

| Role | Who | Primary job in the system |
|---|---|---|
| **Records Clerk** | Front-desk / registration staff | Register patients, manage the queue, basic demographics |
| **Nurse / Midwife** | Clinical nursing staff | Clinical encounters, ANC, immunization, vitals, notes |
| **CHEW** | Community Health Extension Worker | Outreach, defaulter follow-up, community visits, basic encounters |
| **Doctor / Medical Officer** | Physician (where present) | Consultations, diagnoses, prescriptions, referrals |
| **Facility Administrator** | Officer-in-charge of a PHC | Facility config, staff for that facility, reports, record admin |
| **LGA Health Authority / M&E** | LGA-level oversight | Read across all facilities, LGA reports & dashboards |
| **System Administrator** | Technical operator | Platform config, all facilities, system health, no clinical edits by default |

Notes:

- A single person may hold **multiple roles** (common in small PHCs, e.g. a CHEW
  who also does registration). Permissions are the **union** of their roles.
- A user is **assigned to one or more facilities** (data scope). LGA and System
  roles are scoped to the whole LGA by definition.

---

## 2. Permission matrix

Legend: **C**reate · **R**ead · **U**pdate · **D**elete(soft) · **—** none ·
**R(scope)** = read within own data scope only.

| Capability | Records Clerk | Nurse/Midwife | CHEW | Doctor/MO | Facility Admin | LGA/M&E | System Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Register / edit patient demographics | C/R/U | C/R/U | C/R/U | R/U | C/R/U/D | R | R |
| View patient clinical record (EMR) | R (basic) | C/R/U | C/R/U | C/R/U | R | R | — |
| Record clinical encounter / vitals | — | C/R/U | C/R/U | C/R/U | R | R | — |
| Prescribe / treatment | — | C/R/U¹ | C/R/U¹ | C/R/U | R | R | — |
| Diagnose / assessment | — | C/R/U¹ | — | C/R/U | R | R | — |
| Create / manage referral | — | C/R/U | C/R/U | C/R/U | R/U | R | — |
| Manage ANC / maternal record | — | C/R/U | C/R/U | C/R/U | R | R | — |
| Record immunization dose | — | C/R/U | C/R/U | C/R/U | R | R | — |
| Manage the queue / workflow | C/R/U | C/R/U | C/R/U | R/U | C/R/U | R | — |
| Send / schedule SMS | — | C² | C² | C² | C/R/U | R | C/R/U |
| Edit SMS templates | — | — | — | — | C/R/U | — | C/R/U |
| Generate / view facility report | — | R | R | R | C/R | R | R |
| View / generate LGA rollups | — | — | — | — | R(own) | C/R | R |
| Lock / submit monthly report | — | — | — | — | C/U | — | — |
| Manage staff accounts | — | — | — | — | C/R/U/D (own facility) | R | C/R/U/D (all) |
| Manage facilities | — | — | — | — | U (own) | R | C/R/U/D (all) |
| Edit immunization / ANC schedule | — | — | — | — | C/R/U³ | — | C/R/U |
| Merge duplicate patients | — | — | — | — | C/U | — | C/U |
| View audit log | — | — | — | — | R (own facility) | R (LGA) | R (all) |
| View sync / system health | — | — | — | — | R (own) | — | C/R/U (all) |
| Configure system / integrations | — | — | — | — | — | — | C/R/U |

Footnotes:

1. Nurse/Midwife and CHEW prescribing/diagnosing scope follows PHC task-shifting
   norms; the build should make the **prescribe/diagnose permissions
   configurable per facility** because staffing varies (many PHCs have no
   resident doctor). Default as shown.
2. Clinical staff can trigger a reminder/recall for **their** patients; bulk and
   template management is admin-only.
3. Whether facility admins (vs. only system admin) may edit clinical schedules
   is **configurable**; default allows facility admin within their facility, but
   national-schedule changes should be coordinated (Principle 7).

---

## 3. Data-scope rules

- **Facility-scoped roles** (Records Clerk, Nurse/Midwife, CHEW, Doctor,
  Facility Admin) may act only on records belonging to a facility they are
  assigned to. A patient registered at Facility A is visible at Facility B
  **only** through an explicit, audited cross-facility access path (see §4).
- **LGA roles** (LGA/M&E) have **read** access across all facilities in the LGA,
  plus reporting; they do **not** edit clinical data.
- **System Administrator** has platform-wide technical access but **no clinical
  data editing** by default (separation of duties); any access to patient
  clinical content by a system admin is heavily audited and should be break-glass
  only.
- A **device** only holds/syncs data for the facilities its logged-in users are
  scoped to (reinforces scope at the storage layer — see
  `../architecture/offline-sync-design.md`).

---

## 4. Cross-facility patient access ("continuity of care")

Patients move between PHCs. v1 supports controlled cross-facility access:

- A clinician at Facility B can **search the LGA-wide patient index** (minimal
  identifying fields only) to find a patient registered elsewhere.
- Opening that patient's **full clinical record** from another facility is an
  **explicit, audited action** ("access record from Facility A") with a reason
  prompt. This is logged as a sensitive-access event.
- The patient's home facility is preserved; cross-facility encounters are
  attributed to the facility where they occurred.

This balances continuity of care with NDPA minimisation — staff don't get blanket
access to every record, but care isn't blocked when a patient travels.

---

## 5. Authentication requirements

- **Username/PIN or password** login; PIN option for fast clinic re-auth on a
  shared device. (Strength rules in `../architecture/security-and-compliance.md`.)
- **Shared-device aware**: quick user-switching with re-auth; auto-lock after
  inactivity; per-user session even on a shared tablet.
- **Offline authentication**: a user must be able to log in to a previously-used
  device while offline (cached, securely stored credentials/tokens) — otherwise
  the offline guarantee breaks. Design in security-and-compliance.
- **No shared logins.** Every action is attributable to a real user for audit.
- Optional later: device enrolment/registration so only approved devices sync.

---

## 6. Acceptance criteria (RBAC)

- [ ] Each capability in the matrix is enforced on the **server** (authoritative)
      and reflected in the **UI** (hide/disable what a user can't do).
- [ ] A facility-scoped user cannot read or modify another facility's records
      except via the audited cross-facility path (§4).
- [ ] LGA/M&E users can read and report across facilities but cannot edit
      clinical data.
- [ ] System admin cannot silently edit clinical content; any such access is
      break-glass and audited.
- [ ] Configurable permissions (prescribe/diagnose, schedule editing) can be
      toggled per facility without code changes.
- [ ] Offline login works on a previously-used device; deactivated users cannot
      log in even offline after their next sync.
- [ ] Every permission decision and sensitive access is recorded in the audit
      log with actor, action, target, scope, and timestamp.
