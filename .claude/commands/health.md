---
description: Run the Definition of Done sequence and report HEALTHY, DEGRADED, or BROKEN.
argument-hint: "[scope]"
---

# /health

Spawn the **`system-testing`** agent. Read and execute only; it never modifies source, tests,
configuration, or the lockfile.

**Scope:** $ARGUMENTS

## Sequence, from the repo root, in order

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**Stop at the first failure and report.** Running later steps on a broken tree produces
noise, not information.

## Two things to get right

- **`pnpm test` is not wired up.** No test script, no Vitest, no Playwright, no supertest.
  Report it as **NOT WIRED UP**, never as a pass. A repo without it cannot be `HEALTHY` for
  the purpose of a phase exit.
- **A module-not-found error is usually a stale install** after a branch switch. Re-run
  `pnpm install` once and say you did. But if `--frozen-lockfile` itself fails, that is a
  real finding: the lockfile and the manifests disagree. Do not rewrite the lockfile to work
  around it.

## Output

A table of Step, Result, Notes; the verbatim output of any failing step; the specific
Definition of Done items that remain unsatisfied; and a verdict of `HEALTHY`, `DEGRADED`, or
`BROKEN`, with each failure routed to its owning agent by name.
