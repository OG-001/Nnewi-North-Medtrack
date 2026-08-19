---
description: Code review of the current changes. Reports BLOCK, WARN, or PASS.
argument-hint: "[scope]"
---

# /review

Spawn the **`reviewer`** agent to audit the current changes. Read-only.

**Scope:** $ARGUMENTS

## Checklist, highest consequence first

1. **Facility isolation.** Every read scope-filtered. Every permission check tests the role
   **and** the scope. A leak here exposes one Primary Health Centre's patients to another.
2. **The write path.** Every write goes through `apps/web/src/db/repository.ts`. A direct
   Dexie mutation from a component skips the outbox, the `rev` bump, and the audit event.
3. **Hard deletes.** No `DELETE FROM`, `DROP TABLE`, `TRUNCATE`, or non-soft Dexie delete.
4. **Secrets and patient data.** No committed key. No real patient data in a fixture, log,
   or comment. No identifier logged beside a token or message body.
5. **Offline behaviour.** Still works with the network down. No network call on the critical
   path for a clinic workflow. Pending and conflict states still visible.
6. **Correctness.** Date windows, month bucketing, null handling, switch exhaustiveness
   after an enum change.
7. **Conventions.** `.claude/rules/web-standards.md`: function declarations, no `any`,
   relative imports, reuse of existing primitives, the brand palette.

Ground every finding in an exact `path:line` with a concrete failure scenario. State which
high-consequence checks came back clean, so a silent gap is visible.

Then run `/comply`, and `/security` if the change touched patient data, permissions, sync,
or SMS.
