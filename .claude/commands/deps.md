---
description: Audit the installed dependency tree for advisories, staleness, and licence risk.
argument-hint: "[scope]"
---

# /deps

Spawn the **`dependency-auditor`** agent. Read-only; it never installs, upgrades, or edits a
manifest or lockfile.

**Scope:** $ARGUMENTS

## Commands, all read-only

```bash
pnpm audit
pnpm -r outdated
pnpm licenses list
pnpm why <package>
```

Also check the base images in `infra/`: `postgres:16-alpine` and `redis:7-alpine`.

## A raw advisory list is not an answer

For each finding, establish whether it is **reachable** in this application, whether it is
direct or transitive, what it actually allows, and whether it touches patient data. Rank by
real risk here, not by the published score. Say plainly when a high-scored advisory is not
reachable, and equally plainly when a moderate one is.

## Licence rating

Use the table in `.claude/rules/ndpa-compliance.md` section 8, and the five-step protocol:
read the actual LICENSE text, scan for addendum keywords, check for dual licensing, scan the
README, then classify. **Permissive with any addendum is BLACK.** Never trust a
`package.json` `license` field alone.

Note that **this repository has no `LICENSE` file of its own**, so the project licence is
undecided and a copyleft dependency's implications cannot be fully assessed. That is a
question for the owner.

## Also flag

Bundle weight. The target is a low-end Android phone on a slow network, so a heavy
dependency has a cost measured in a nurse's waiting time.

Write the report to `devops/dependency-reports/YYYY-MM-DD_audit.md` and hand every
remediation to a named agent with an urgency.
