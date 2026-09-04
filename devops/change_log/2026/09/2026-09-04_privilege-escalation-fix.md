# CRITICAL: privilege escalation through staff administration

| Field  | Value                          |
|--------|--------------------------------|
| Date   | 2026-09-04                     |
| Time   | 15:38 WAT                      |
| Author | Implementation                 |
| Phase  | 9, Admin dashboard and staff   |
| Module | 7 Staff Management             |

## Summary

A facility administrator could take over an LGA-wide account and read every
facility's patient data.

The escalation, verified end to end against the running hub before the fix:

1. A system administrator provisions an M&E officer with `lga_authority`, based
   at a single PHC. This is a realistic posting, not a contrived one.
2. The facility administrator of that PHC resets the officer's PIN. This
   returned `201`.
3. They sign in as the officer and receive `scope: null`, which is LGA-wide
   read access to all 76 facilities.

Under `.claude/rules/ndpa-compliance.md` section 7 this is **CRITICAL**: a read
path missing its facility-scope check.

## Cause

`assertMayAdministerFacilities` checked only that the target's facilities were
inside the caller's scope. It never considered the target's **roles**.

That is sufficient while every elevated account happens to be attached to all 76
facilities, which is how the seed provisions `lga` and `sysadmin`: the overlap
check then fails and the reset is refused. The protection came from the shape of
the seed data, not from a rule. An officer attached to one site has complete
overlap with that site's administrator, and the guard passes.

The existing tests missed it because they asserted a facility administrator
cannot **grant** an elevated role. They never asserted anything about
administering an account that **already holds** one.

## The fix

`assertMayAdministerUser` refuses any non-system-administrator acting on an
account that holds `lga_authority` or `system_admin`, applied to `update`,
`resetPin`, and the staff list.

**The boundary is the target's privileges, not their facilities or their job
title.** A facility administrator managing another facility administrator is
lateral: same scope, same powers, no escalation, and it stays allowed. Requiring
a system administrator for that would strand a PHC whose only administrator is
locked out, and the system administrator may be one person covering the whole
LGA and not reachable on a clinic morning.

Elevated accounts are also hidden from a facility administrator's staff list. A
`403` on an account they can see is confusing, and listing it advertises an
account worth attacking.

## Decisions taken

1. **Privilege, not title, is the boundary.** "Should an admin reset another
   admin's PIN" was the wrong question. Two facility administrators at one PHC
   are peers. An LGA officer is not, wherever they are posted.

2. **Hide rather than merely refuse.** Data minimisation, and it removes the
   temptation.

3. **Facility administrators keep full authority over facility-bound staff.**
   The fix must not make the role useless: running their own PHC's staff is the
   whole point of it, and PHC staffing is thin.

## Deviations from the plan

None. This restores what `.claude/rules/rbac-and-scope.md` section 3 already
required: `lga_authority` and `system_admin` are separated from facility-scoped
duties.

## Open questions surfaced

The open question recorded in
`devops/change_log/2026/09/2026-09-04_server-side-administration.md`, whether a
facility administrator may reset another administrator's PIN, is **answered**:
yes for a facility-bound peer, never for an account holding a cross-facility
role. It was a security question wearing a policy question's clothes.

## Files changed

| File                                  | Change type |
|---------------------------------------|-------------|
| `apps/api/src/admin/staff.service.ts` | modified    |
| `apps/api/test/admin-staff.test.ts`   | modified    |

## Change details

### `apps/api/src/admin/staff.service.ts`

```diff
@@ -44,6 +44,27 @@
+  /**
+   * A facility administrator may not administer a user who holds a
+   * cross-facility role, even one attached to their own facility.
+   */
+  private assertMayAdministerUser(principal: Principal, target: { roles: string[] }) {
+    if (this.isSystemAdmin(principal)) return;
+    const elevated = (target.roles as Role[]).filter((r) => ELEVATED_ROLES.includes(r));
+    if (elevated.length) {
+      throw ApiError.forbidden(
+        `Only a system administrator may administer an account holding: ${elevated.join(", ")}`,
+      );
+    }
+  }
```

Applied at both call sites, and to the list:

```diff
@@ update()
     );
+    this.assertMayAdministerUser(principal, existing);
     if (dto.roles) this.assertMayGrantRoles(principal, dto.roles as Role[]);

@@ resetPin()
     );
+    this.assertMayAdministerUser(principal, existing);

@@ list()
-    return users.map((u) => this.present(u));
+    const visible = this.isSystemAdmin(principal)
+      ? users
+      : users.filter((u) => !(u.roles as Role[]).some((r) => ELEVATED_ROLES.includes(r)));
+    return visible.map((u) => this.present(u));
```

### `apps/api/test/admin-staff.test.ts`

Seven tests, built around a single-site `lga_authority` officer, which is the
configuration the old guard could not defend. They assert the escalation is
refused for PIN reset, disable and role strip; that the account is hidden from
the list; that a system administrator can still administer it; and that a
facility administrator retains authority over ordinary staff and over a peer
administrator.

## Verification

| Check | Result |
|-------|--------|
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | clean |
| shared / web / api suites | 66 / 25 / 108 passed |
| `apps/api/test/admin-staff.test.ts` | 28 passed |
| `apps/api/test/e2e-sync.sh` | 18 passed |
| `infra/scripts/secret-scan.sh` | clean |

The original exploit was replayed against the fixed hub: the PIN reset now
returns `403`, and the count of elevated accounts visible to a facility
administrator is zero.

The accounts these probes created were disabled, not deleted, per Global
Constraint 3.
