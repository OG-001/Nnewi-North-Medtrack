---
description: Policy audit of changed files against the 14 Global Constraints. Graded verdict.
argument-hint: "[scope]"
---

# /comply

Spawn the **`compliance`** agent. Read-only. This is the LAST gate before the owner.

**Scope:** $ARGUMENTS

## Audit all 14 Global Constraints

Walk every one in `CLAUDE.md` section 3 and record a verdict for each, even "not applicable
to this diff". Never spot-check.

Then audit **process**, which a code-focused review misses:

- Was there a plan, and did the owner approve it? (Constraint 11)
- Did `reviewer` run first? (Constraint 12)
- Does a change record exist under `devops/change_log/YYYY/MM/`? (Constraint 13)
- Was any test or documentation skip declared in the exact required wording?
- Does the change match what the phase document committed to?

Then run the **honesty audit**: does any report, comment, or change record claim that the
NestJS hub, server-side scope enforcement, live SMS dispatch, or the test harness works?
None of them exist. Asserting otherwise is CRITICAL.

## Verdict

`BLOCK`, `APPROVE WITH CONDITIONS`, or `APPROVE`. Conditions are concrete actions with a
named owner, not advice.
