---
description: Write the change-log entry and update affected run docs after a change.
argument-hint: "<change description>"
---

# /docs

Spawn the **`documentation`** agent. Markdown only; it never touches source code.

**Change:** $ARGUMENTS

## Destination

`devops/change_log/YYYY/MM/YYYY-MM-DD_short-title.md`, **numeric month**, kebab-case title of
2 to 5 words. For phase work, lead with the phase: `YYYY-MM-DD_phase-N-short-title.md`.

## Required sections

Summary. Decisions taken. Deviations from the plan. Open questions surfaced. Files changed.
Change details with a **mandatory `diff` excerpt per modified file, including line numbers**.

"None" is a valid answer for Decisions, Deviations, and Open questions. Silence is not.

## Report faithfully

- If a gate was skipped, say which and why, in the exact required wording.
- If a test failed and the change shipped anyway, record it with the output.
- Never describe the NestJS hub, server-side scope enforcement, live SMS, or the test
  harness as working. If the change moved something across that line, update the
  implemented-versus-deferred list in `RUNNING.md`.
- **Never put real patient data in a change record.** It is a durable file in a repository
  with a public remote.

## Then check

1. Which acceptance boxes in `docs/implementation/phase-N-*.md` now get ticked. Ticking them
   is `phase-plan-author`'s write, not yours.
2. Whether the change resolved an open question Q1 to Q9.
3. Whether `RUNNING.md` needs updating.
