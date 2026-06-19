# Phase 1 — Identity, RBAC & Facilities

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 1 — Identity, RBAC & facilities
**Depends on:** Phase 0
**Status:** Planned

---

## 1. Objective

Implement authentication (including **offline-capable** login and PIN re-auth on
shared devices), the **facility registry** for Nnewi North LGA, **staff accounts**
with **role + data-scope** assignment, and the cross-cutting **RBAC guard** and
**audit log** — so that from this phase onward every feature is access-controlled
and attributable, and a real user can log in (online once, then offline) and see
only their facility's data.

## 2. Prerequisites / entry criteria

- Phase 0 exit gate passed (scaffold, ORM, PWA shell, CI).
- Role model + RBAC matrix confirmed
  (`../product/user-roles-and-permissions.md`).
- Security baseline reviewed (`../architecture/security-and-compliance.md`).
- **Open question Q1** (participating PHC list) — not blocking; seed a
  configurable list and let admins add facilities. Confirm before LGA rollout.

## 3. Scope

**In scope**

- **Facilities**: `facility` entity + CRUD (system admin); seed Nnewi North LGA
  facilities (configurable; Q1).
- **Users & roles**: `user_account`, `role_assignment`, per-facility permission
  config; account lifecycle (invite/create/activate/deactivate/reset).
- **Auth**: password (argon2id) + optional PIN; JWT access + rotating refresh;
  login/refresh/logout/pin endpoints; **offline auth** (securely-stored revocable
  token envelope on enrolled devices); **auto-lock** + re-auth in the PWA.
- **RBAC guard** (role × data-scope) applied app-wide; UI permission gating.
- **Audit module**: append-only `audit_event` + interceptor; logs auth events,
  permission changes, sensitive access.
- **PWA**: login/lock screens; user/session handling on shared devices; scope-
  aware data boundaries wired (even before bulk data exists).

**Out of scope**

- Patient/clinical data (Phase 2).
- The full bulk sync protocol (Phase 3) — auth tokens for sync are defined here,
  sync transport is Phase 3.
- Admin **UI** for managing staff/facilities at scale (Phase 9) — minimal admin
  endpoints + a basic screen are enough here.

## 4. Task breakdown

1. **Facility entity + endpoints** (`../architecture/data-model.md` §3.1;
   `../architecture/api-design.md` §5) + seed loader for the LGA list (Q1).
2. **User & role model**: `user_account`, `role_assignment`, per-facility
   permission flags; create/deactivate/reset flows; password hashing (argon2id).
3. **Auth service**: `login`, `refresh`, `logout`, `pin`; JWT with claims
   (`sub`, `roles[]`, `facilityScope[]`, `deviceId`); refresh rotation/revocation.
4. **Offline auth**: device enrolment on first online login; cache a securely-
   stored, short-TTL, revocable token envelope; PWA can authenticate offline on
   an enrolled device; deactivation enforced at next sync.
5. **RBAC guard**: NestJS guard combining `@Roles()` + data-scope; default-deny;
   `OUT_OF_SCOPE`/`FORBIDDEN` per the error model; unit-tested bypass attempts.
6. **Audit module**: append-only table + interceptor; log login/failed-login,
   logout, role/permission change, account lifecycle, sensitive access.
7. **PWA auth UX**: login, **auto-lock** + PIN resume, user switching on shared
   tablets, scope-aware shell, "you are offline / logged in offline" states.
8. **Tests**: unit (auth, guard, scope), API (supertest authz matrix), e2e
   (login → offline login on enrolled device → auto-lock → resume).

## 5. Deliverables

- Facility registry + seeded LGA facilities (configurable).
- Staff accounts with role + facility scope; lifecycle flows.
- Working auth: online + **offline** login, PIN re-auth, auto-lock.
- App-wide **RBAC guard** + **audit log**.
- Authz test suite (matrix from the RBAC doc) green.
- Change-log entry; Q1 status recorded.

## 6. Acceptance / exit criteria

- [ ] A seeded admin can create a facility, create a user, assign role + scope.
- [ ] A facility-scoped user logs in and is limited to their facility; an
      out-of-scope request returns 403; LGA user can read across; system admin
      cannot edit clinical data (none exists yet, but the guard enforces it).
- [ ] **Offline login works** on a previously-enrolled device; a deactivated
      user cannot log in/sync after the next online check.
- [ ] Auto-lock + PIN resume works on a shared device; sessions are per-user.
- [ ] Every auth/permission event is in the **audit log** with actor + time +
      facility.
- [ ] RBAC matrix tests (`../product/user-roles-and-permissions.md` §2) pass,
      enforced **server-side**.
- [ ] **Exit gate:** owner reviews the role model behaviour and offline-auth
      trade-off (deactivation latency) before Phase 2.

## 7. Governance & guardrails

- **Server-side enforcement is authoritative**; UI gating is convenience only.
- **No shared logins**; every action attributable (audit).
- **Separation of duties**: system admin has no default clinical edit.
- Offline-token TTL kept short; document the deactivation-latency residual risk
  for the DPO (`../architecture/security-and-compliance.md` §2).
- Secrets (JWT key, etc.) via env/secret store only.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Offline auth weakens revocation | Short offline-token TTL; revoke at next sync; document residual risk |
| RBAC gaps (privilege escalation) | Default-deny guard; scripted bypass/out-of-scope tests; review |
| Shared-device session bleed | Per-user sessions; auto-lock; explicit user switch with re-auth |
| Wrong/incomplete facility list (Q1) | Configurable + admin-addable; confirm before rollout, not blocking now |
| Audit log gaps | Interceptor at the guard layer so coverage is structural, not per-route |

## 9. Hand-off

Phase 2 consumes: authenticated, scoped users; the facility registry; the RBAC
guard + audit interceptor (so patient/EMR endpoints are access-controlled and
audited by construction); and the offline-auth foundation the sync engine
(Phase 3) builds on.
