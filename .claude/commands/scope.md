---
description: Work on roles, permissions, facility data scope, cross-facility access, or audit.
argument-hint: "<change description>"
---

# /scope

Spawn the **`rbac-facility-scope`** agent.

**Change:** $ARGUMENTS

A defect here does not crash anything. It quietly shows a nurse at one Primary Health Centre
the patients of another, which is a breach under the Nigeria Data Protection Act 2023.
Nothing else in this repository fails as silently.

## The rule that governs everything

> A permission check passes only if the role grants the action **and** the target record is
> within the user's data scope.

Both halves. Always. A role check alone is not access control.

## The three isolation layers

| Layer                  | Where                          | Status        |
|------------------------|---------------------------------|---------------|
| Scoped authentication  | `apps/web/src/lib/session.tsx`  | Enforced now  |
| Client-side data scope | `apps/web/src/lib/scope.ts`     | Enforced now  |
| Server-side sync scope | `apps/api/`                     | **Not built** |

**Always state the layer-3 gap.** A tampered client today is constrained only by the client.

## Cross-facility access

Never widen a query to make a screen work. The LGA-wide index exposes minimal identifying
fields only; opening a record from another facility is an explicit, reason-prompted action
logged as `sensitive_access`.

## Rules

- Permissions live in `packages/shared/src/permissions.ts`. **Never hard-code a role name at
  a call site.**
- `lga_authority` and `system_admin` do not edit clinical data outside audited break-glass.
- Never edit or delete an audit row.
- After the change, grep the whole tree for regressions and report any pre-existing gap you
  find, even if you did not introduce it:

```bash
rg 'roles\.includes\(' apps/web/src packages/shared/src
rg 'db\.\w+\.(toArray|where|get)\(' apps/web/src --glob '!src/db/**'
```
