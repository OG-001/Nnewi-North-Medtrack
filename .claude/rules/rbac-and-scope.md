# Roles, permissions, and facility data scope

**Applies to:** `packages/shared/src/permissions.ts`, `packages/shared/src/enums.ts`,
`apps/web/src/lib/session.tsx`, `apps/web/src/lib/scope.ts`, every page and repository
query, and every future `apps/api/` route guard.

**Authority:** `docs/product/user-roles-and-permissions.md`.

---

## 1. The two-dimension rule (Global Constraint 7)

Access control has two dimensions and they are **always combined**:

1. **Role**: what kind of action a user may take.
2. **Data scope**: which records the user may act on.

> A permission check passes only if the role grants the action **and** the target record is
> within the user's data scope.

Checking one half without the other is a security defect, not a style issue. A nurse who may
record an immunization dose may not record it against another facility's child.

---

## 2. The seven roles

| Role identifier  | Data scope                                  |
|------------------|----------------------------------------------|
| `records_clerk`  | Their assigned facilities only               |
| `nurse_midwife`  | Their assigned facilities only               |
| `chew`           | Their assigned facilities only               |
| `doctor`         | Their assigned facilities only               |
| `facility_admin` | Their own facility                           |
| `lga_authority`  | Read across the whole LGA, no clinical edits |
| `system_admin`   | Platform-wide, no clinical edits by default  |

A person may hold several roles and their permissions are the **union**. The permission
identifiers themselves live in `packages/shared/src/permissions.ts` as the `PERMISSIONS`
tuple; the role grants live in `ROLE_PERMISSIONS`. Change the matrix there, never inline in
a component.

---

## 3. Separation of duties

- **`lga_authority` reads, it does not edit clinical data.** Reporting and oversight only.
- **`system_admin` has no default clinical-data edit.** Any access by a system admin to
  patient clinical content is break-glass and heavily audited. If you are writing a code
  path that lets a system admin quietly edit a clinical row, stop and raise it.
- Per-facility configurable permissions (prescribing, diagnosing, schedule editing) may be
  toggled per facility but **can never exceed the role matrix**.

---

## 4. Data-scope enforcement points

| Layer                  | Where                             | Status         |
|------------------------|------------------------------------|----------------|
| Scoped authentication  | `apps/web/src/lib/session.tsx`     | Enforced now   |
| Client-side data scope | `apps/web/src/lib/scope.ts`        | Enforced now   |
| Server-side sync scope | `apps/api/` sync module            | Not built      |

`useScope()` in `apps/web/src/lib/scope.ts` returns `isLgaWide`, `currentFacilityId`,
`facilityIds` (null meaning all facilities), and an `inScope(record)` predicate that also
rejects soft-deleted rows. **Every list and detail read must pass through it.** A query that
reads a Dexie table without a scope filter is a finding.

The client-side layer is a usability and defence-in-depth measure, not the production
guarantee. **The production guarantee is server-side and does not exist yet.** Never claim
otherwise in a report, a change record, or a comment.

---

## 5. Cross-facility access (Global Constraint 8)

Patients move between PHCs, so continuity of care is supported, but never by widening a
query.

- A clinician may search an **LGA-wide patient index** exposing minimal identifying fields
  only. Not the clinical record.
- Opening a full record belonging to another facility is an **explicit action with a reason
  prompt**, logged as a `sensitive_access` audit event.
- The patient's home facility is preserved. A cross-facility encounter is attributed to the
  facility where it happened.

This is the Nigeria Data Protection Act minimisation principle expressed in code: staff do
not get blanket access to every record, and care is not blocked when a patient travels.

---

## 6. Authentication requirements

- **Per-user accounts only. No shared logins**, because every action must be attributable
  for the audit trail.
- Username with PIN or password. The PIN exists for fast re-auth on a shared clinic tablet
  after a full login, not as the only credential.
- **Offline login must work** on a previously used device, otherwise the offline guarantee
  breaks. Cached credentials are securely stored and revocable.
- A deactivated user loses offline access at the device's next online check. Keep the
  offline token time-to-live short so that window stays small, and document the residual
  risk rather than hiding it.
- Auto-lock after inactivity, with re-auth to resume. Critical on shared devices.

---

## 7. What gets audited

Every one of these writes an `audit_event` with actor, action, entity, facility, timestamp,
and device:

create, update, soft delete, login, logout, failed login, permission or role change,
cross-facility `sensitive_access`, patient merge, report lock, configuration change,
conflict resolution, and break-glass access.

The audit log is **append-only** and read-only to viewers. A facility admin sees their own
facility, `lga_authority` sees the LGA, `system_admin` sees everything.

---

## 8. Review checklist for any change touching access

- [ ] Does every new read filter by facility scope, or is it deliberately LGA-wide with a
      role check that permits it?
- [ ] Does every new write check the role permission **and** the target's scope?
- [ ] Do soft-deleted rows stay out of the result?
- [ ] Does the UI hide or disable what the role cannot do, in addition to the data layer
      refusing it?
- [ ] Is a new cross-facility path reason-prompted and audited?
- [ ] Is the permission expressed in `packages/shared/src/permissions.ts` rather than
      hard-coded at the call site?
