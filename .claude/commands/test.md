---
description: Pick, write, and run the one right test tier for a change.
argument-hint: "<change description>"
---

# /test

Spawn the **`tester`** agent.

**Change:** $ARGUMENTS

## Pick ONE tier and say why

| Tier               | Use when                                             | Location            |
|--------------------|-------------------------------------------------------|---------------------|
| Vitest unit        | Pure logic: schedules, dates, permissions, reporting  | Beside the source   |
| Playwright e2e     | A user-visible workflow across screens                | `apps/web/tests/e2e/` |
| Playwright offline | **Any clinic workflow.** Mandatory before a phase exits. | `apps/web/tests/e2e/` |
| supertest          | An API route, Phase 1 onward                          | `apps/api/test/`    |

**The test tooling is not installed yet.** If this change is the first to need a tier,
installing and configuring it is part of the job. Say exactly what you added.

## For any change to the local store or sync

Run the mandatory matrix from `docs/architecture/offline-sync-design.md` section 10: offline
create through delete then reconcile, no loss across crash and refresh and airplane cycles,
two-device edits per entity class covering every conflict rule including escalation, push
replay with no duplicate, resumable interrupted pull and push, and scope isolation.

## Rules

- Never use real patient data. Use the seeded demo facilities in `RUNNING.md`.
- Assert observable behaviour, not implementation detail.
- For a bug fix, write the reproduction first and watch it fail.
- No bare sleeps. Wait on state.
- Run the tests and paste the real output. If they fail, say so and show it.
