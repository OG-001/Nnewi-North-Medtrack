# Server-side staff, facility and audit administration

| Field  | Value                              |
|--------|------------------------------------|
| Date   | 2026-09-04                         |
| Time   | 15:27 WAT                          |
| Author | Implementation                     |
| Phase  | 9, Admin dashboard and staff       |
| Module | 7 Staff Management, 10 Admin       |

## Summary

Staff, facility and audit administration existed only on the device. The admin
screen wrote to the local Dexie store, which meant **disabling a staff account
revoked nothing**: the row was relabelled locally while the account stayed active
at the hub and could still sign in on any other device. A staff account created
at one facility existed nowhere else, so it could not authenticate at all.

The server-side administration in `api-design.md` section 5 is now built, and the
admin screen uses it.

- `GET/POST /api/v1/admin/staff`, `PATCH /api/v1/admin/staff/:id`,
  `POST /api/v1/admin/staff/:id/reset-pin`
- `GET /api/v1/facilities` (public, for the door screen), plus
  `POST` and `PATCH` for a system administrator
- `GET /api/v1/audit` with filters and cursor paging, and
  `GET /api/v1/audit/actions`

## Decisions taken

1. **This lives in `apps/api`, not a new `backend/` folder.** The owner asked for
   a folder named `backend`. `apps/api` already **is** the backend, and the
   monorepo layout (`apps/*`, `packages/*`) is a locked decision in `CLAUDE.md`.
   Renaming it would touch both Dockerfiles, the compose files, the scripts, the
   agent routing rules and every doc, for no functional gain, so it was raised
   with the owner rather than done silently.

2. **Privilege escalation is blocked at the role boundary.** A facility
   administrator runs the staff of their own PHC and may not grant
   `lga_authority` or `system_admin`, because both read across every facility in
   the LGA. Only a system administrator may. The UI disables those checkboxes and
   the hub refuses them regardless: the UI is a courtesy, the server is the rule.

3. **Deactivation revokes, it does not relabel.** Setting a staff account to
   disabled revokes its refresh tokens and its devices in the same transaction.
   The short-lived access token expires on its own, and the device loses offline
   access at its next online check. A reset PIN revokes sessions too: if the
   reason for the reset was a compromise, leaving the old sessions alive defeats
   it.

4. **An administrator cannot deactivate their own account.** Locking the last
   administrator out of a facility is a support incident with no in-app recovery.

5. **A facility is deactivated, never deleted.** Staff, patients and an audit
   trail hang off it. It disappears from the default list and from the sign-in
   door screen, and `?includeInactive=true` still returns it.

6. **The facility list endpoint is public.** The door screen shows it before
   anyone signs in. It carries no patient data and no staff data.

7. **Obvious PINs are refused.** `0000`, `1234` and friends are rejected at the
   schema. A PIN is fast re-auth on a shared tablet, not the only credential, but
   the ones every attacker tries first are not worth having.

8. **The audit viewer reads from the hub when connected.** The local log holds
   only this device's own events, and presenting that to an administrator as "the
   audit log" would be misleading: the events they most need to see, another
   nurse's cross-facility access, a config change, a report lock, happened
   elsewhere. Offline it falls back to local events, labelled as such.

9. **Facility-less events are visible only to cross-facility roles.** A config
   change has no facility to scope it to, so a facility-bound viewer never sees
   it rather than seeing it unscoped.

## Deviations from the plan

The owner asked for the folder to be named `backend`. It was not renamed, for the
reason in decision 1. If the owner still wants the rename after seeing that, it is
a mechanical change across the whole repository and should be its own commit.

`apps/web/src/pages/Admin.tsx` still lists facilities from the local seeded
registry rather than `GET /facilities`. The two are seeded identically, so they
agree today, and the endpoint exists for when they stop agreeing.

## Open questions surfaced

- **New:** a facility administrator can currently reset the PIN of any staff
  member at their facility, including another administrator. Whether that is
  correct, or whether administrator PINs should only be resettable by a system
  administrator, is a policy question for the owner.

## Files changed

| File                                          | Change type |
|-----------------------------------------------|-------------|
| `apps/api/src/admin/admin.dto.ts`             | added       |
| `apps/api/src/admin/staff.service.ts`         | added       |
| `apps/api/src/admin/staff.controller.ts`      | added       |
| `apps/api/src/admin/facilities.service.ts`    | added       |
| `apps/api/src/admin/facilities.controller.ts` | added       |
| `apps/api/src/admin/audit.service.ts`         | added       |
| `apps/api/src/admin/audit.controller.ts`      | added       |
| `apps/api/src/admin/admin.module.ts`          | modified    |
| `apps/api/test/admin-staff.test.ts`           | added       |
| `apps/web/src/lib/admin-api.ts`               | added       |
| `apps/web/src/components/StaffAdmin.tsx`      | added       |
| `apps/web/src/components/AuditLog.tsx`        | added       |
| `apps/web/src/pages/Admin.tsx`                | modified    |
| `infra/scripts/secret-scan.sh`                | modified    |

## Change details

### `apps/web/src/pages/Admin.tsx`

The staff tab wrote directly to the local store, which is what made deactivation
a no-op beyond the device.

```diff
@@ -165,17 +71,4 @@
 function StaffTab() {
-  const { user } = useSession();
-  const users = useLiveQuery(() => db.users.toArray(), [], []);
-
-  async function toggle(id: string, status: "active" | "disabled") {
-    await db.users.update(id, { status, updated_at: new Date().toISOString() });
-    ...
-  }
+  return <StaffAdmin />;
 }
```

### `apps/api/src/admin/staff.service.ts`

Deactivation revokes in the same transaction as the status change.

```diff
+      if (dto.status && dto.status !== "active") {
+        await tx.refreshToken.updateMany({
+          where: { userId, revokedAt: null },
+          data: { revokedAt: new Date() },
+        });
+        await tx.device.updateMany({
+          where: { userId, revokedAt: null },
+          data: { revokedAt: new Date() },
+        });
+      }
```

### `infra/scripts/secret-scan.sh`

The scanner flagged this very change-log entry, because the prose describing the
earlier scanner fix contains the literal placeholder `user:password`. Added to
the placeholder list, and re-verified in both directions.

```diff
-      matches=$(echo "$matches" | grep -vEi 'CHANGE_ME|YOUR_|...|xxxx' || true)
+      matches=$(echo "$matches" | grep -vEi 'CHANGE_ME|YOUR_|...|xxxx|user:password|username:password|user:pass@' || true)
```

## Verification

| Check | Result |
|-------|--------|
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | clean |
| shared / web / api suites | 66 / 25 / 101 passed |
| `apps/api/test/admin-staff.test.ts` | 21 passed |
| `apps/api/test/e2e-sync.sh` | 18 passed |
| `infra/scripts/secret-scan.sh` | clean, and catches a planted credential |

The two tests that matter most both pass: a facility administrator is refused
when granting `lga_authority` or `system_admin`, or when creating staff at
another facility; and an account that is disabled can no longer sign in at all,
where before the disable only changed a local label.

Verified through the browser: the staff tab lists 11 accounts from the hub, the
signed-in administrator's own row has no Disable button, a previously disabled
account offers Re-enable, and the cross-facility role checkboxes are disabled for
a facility administrator.
