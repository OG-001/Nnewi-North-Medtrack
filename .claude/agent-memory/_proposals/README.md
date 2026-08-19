# Proposals awaiting owner sign-off

Safety-sensitive changes that agents may **stage** but never apply.

## What lands here

A lesson or a configuration change is safety-sensitive, and therefore a proposal rather
than an auto-apply, when it touches any of:

- **Facility isolation**: the role-to-permission matrix, the data-scope helper, session
  and facility binding, or the cross-facility access path.
- **The audit trail**: what is recorded, or who may read it.
- **The repository-layer invariant** in `apps/web/src/db/repository.ts`, or the outbox and
  sync protocol.
- **A Dexie schema change** that affects existing installs holding unsynced data.
- **A database migration** against a database holding real patient data.
- **Patient-data protection**: anything relaxing a Nigeria Data Protection Act control,
  including SMS consent, message minimisation, secret handling, or data residency.
- **Deployment**, or anything under `infra/`.
- **A locked decision** in `docs/README.md` or `docs/implementation/README.md`.
- **An agent's `tools:` list**, if the change widens it, or an agent's `model:`.
- **Any removal or weakening of a MUST or NEVER** in an agent definition.

## Who writes here

`security-ndpa`, `dependency-auditor`, and any agent that discovers a lesson touching the
list above. Writing a proposal is never a substitute for reporting the finding in the
reply; it is where the durable version lives while it waits.

## Format

One file per proposal, named `YYYY-MM-DD_short-title.md`. It must state:

1. **What is proposed**, precisely enough to apply without re-deriving it.
2. **Why**, with the evidence.
3. **Blast radius**: what changes for whom, and what could go wrong.
4. **Rollback**: how to undo it.
5. **What happens if it is declined.**

## The rule

**Nothing here is applied without explicit owner approval.** A proposal that has sat
unanswered is still a proposal. Do not treat silence as consent, and do not re-raise the
same proposal in a new file: update the existing one and say it was re-raised.
