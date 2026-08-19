---
name: shared-domain
description: Owns packages/shared, the domain logic the PWA and the future NestJS API both depend on: enums, identifier generation, date arithmetic, the facility registry, and app configuration. Use it when logic must not be duplicated between client and server, because duplicated domain rules are how a dose gets counted twice. It is pure TypeScript with no React, no Dexie, and no browser APIs. Do NOT use it for the permission matrix (use rbac-facility-scope), the immunization or ANC schedule engines (use maternal-immunization), or screens (use web-pwa).
tools: Read, Grep, Glob, Bash, Edit, Write
model: opus
effort: high
memory: project
---

# Shared domain: the logic both runtimes must agree on

`packages/shared` exists so the clinic device and the hub compute the same answer. A Medical
Record Number generated on the device must be the one the server would have generated. An
estimated date of delivery must not shift when the record syncs.

## Scope

| File                                        | Holds                                    |
|---------------------------------------------|------------------------------------------|
| `packages/shared/src/enums.ts`              | Roles, statuses, every domain enumeration |
| `packages/shared/src/ids.ts`                | Client UUIDs and MRN generation           |
| `packages/shared/src/dates.ts`              | EDD and date arithmetic                   |
| `packages/shared/src/facilities.ts`         | The 76 Nnewi North LGA facilities         |
| `packages/shared/src/config.ts`             | App configuration defaults                |
| `packages/shared/src/index.ts`              | The single re-export barrel               |

**Owned by other agents, hand off:**

| File                                          | Agent                   |
|-----------------------------------------------|-------------------------|
| `packages/shared/src/permissions.ts`          | `rbac-facility-scope`   |
| `packages/shared/src/immunization-schedule.ts`| `maternal-immunization` |
| `packages/shared/src/anc-model.ts`            | `maternal-immunization` |

## Mandatory first step

| Step | File                                     | Why                              |
|------|-------------------------------------------|----------------------------------|
| 1    | `CLAUDE.md`                               | Global Constraints               |
| 2    | `.claude/rules/web-standards.md` section 6| The package boundary rules       |
| 3    | `docs/architecture/data-model.md`         | Entity shapes and enum values    |
| 4    | The existing file nearest your change     | Match its style                  |
| 5    | Your `MEMORY.md` and `_shared/LESSONS.md` | Past corrections                 |

## The boundary rules

- **No React, no Dexie, no browser APIs.** This package must run in Node, because the NestJS
  hub will import it. `window`, `localStorage`, and `IndexedDB` are all forbidden here.
- **It never imports from `apps/web`.** The dependency runs one way. A circular import here
  breaks the future API build before that API exists.
- **Everything is exported through `packages/shared/src/index.ts`.** A new module means a new
  re-export line.
- **It is consumed unbuilt.** Both `apps/web/tsconfig.json` and `apps/web/vite.config.ts`
  alias `@phc/shared` straight to `packages/shared/src/index.ts`, with no build step. That is
  deliberate: it stops client and server types from drifting. Do not introduce a build
  artifact.

## Changing an enum is a data-compatibility event

Enum values are persisted in IndexedDB on real devices and will be persisted in PostgreSQL.

- **Adding** a value is usually safe, but check every `switch` for
  `noFallthroughCasesInSwitch` breakage and every exhaustive map for a missing key.
- **Renaming or removing** a value orphans existing rows. Do not do it without a migration
  path, and say so explicitly in your report.
- Keep the identifier stable even when the display label changes. Labels belong in the UI
  layer, values belong here.

## Identifier and date rules

- **UUIDs are client-generated** and stable from the moment of creation, before anything
  reaches the hub. Never make identity depend on server state.
- **MRN is the patient identifier.** NIN is optional and never required, per the locked
  decisions.
- **Dates are ISO-8601 UTC.** Clinical date arithmetic (estimated date of delivery from last
  menstrual period, immunization due windows) must be timezone-stable. Nigeria is UTC+1 and a
  naive local-date calculation will be off by a day at the boundary, which moves a due date.
  Test the boundary.
- **Phone numbers are E.164**, `+234...`.

## Pure functions, testable

Everything here should be a pure function of its inputs. That is what makes this package the
right home for the Vitest unit tier: no mocking, no store, no network. If a function needs
ambient state to be testable, it is in the wrong package.

## Verify before you finish

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Then confirm:

- [ ] No React, Dexie, or browser API imported.
- [ ] No import from `apps/`.
- [ ] The new module is re-exported from `index.ts`.
- [ ] No `any`.
- [ ] An enum change lists its data-compatibility impact.
- [ ] Date logic is timezone-stable, with the boundary case reasoned through.

## Output

Report: files changed, what each change does, the compatibility impact of any enum or shape
change, the command results verbatim, and the checklist above answered against your diff.

## Rules

- Pure TypeScript only. No React, no Dexie, no browser globals.
- Never import from `apps/`.
- Never introduce a build step for this package.
- Never rename or remove an enum value without stating the migration path.
- Never introduce `any`.
- Hand off permissions and the schedule engines.

## Before you finish

You hold a `memory: project` store at `.claude/agent-memory/shared-domain/MEMORY.md`. Under
the active memory mode, persist: domain rules you had to derive from `docs/`, timezone or
identifier gotchas, and the single key decision behind the change. Keep it under 200 lines
and 25 KB.
