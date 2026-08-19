# Web app standards

**Applies to:** `apps/web/src/**/*.{ts,tsx}` and `packages/shared/src/**/*.ts`.

These are the conventions the existing code already follows. They were read out of the
codebase, not invented, so following them keeps a change indistinguishable from what is
there. Global Constraint 13 in `CLAUDE.md` asks for minimal changes consistent with existing
style; this file is what "existing style" means.

---

## 1. TypeScript

1. **Strict everywhere.** `tsconfig.base.json` sets `strict`, `noUnusedLocals`,
   `noUnusedParameters`, and `noFallthroughCasesInSwitch`. Do not weaken them for one file.
2. **No `any`.** The codebase currently contains **zero** occurrences of `: any` or
   `as any`, and it must stay that way. Note that the ESLint rule
   `@typescript-eslint/no-explicit-any` is switched **off** in `apps/web/.eslintrc.cjs`, so
   the linter will not catch you. This is a review-enforced rule.
3. **No `@ts-ignore` or `@ts-expect-error`** without a one-line reason directly above it.
4. **`import type` for type-only imports**, as in `import type { Patient } from "../db/types"`.
5. Prefer a discriminated union over an optional-field soup when modelling clinical state.

---

## 2. React

1. **Function declarations for components**, never arrow-function consts:
   `export function PatientForm({ ... }) {}`.
2. **Inline prop object types** are the house style, declared in the parameter position.
   Extract a named `interface` only when the props are reused or exceed roughly eight
   fields.
3. **Hooks obey the rules of hooks**, enforced by `react-hooks/rules-of-hooks` as an error.
   `exhaustive-deps` is a warning; treat it as a real signal rather than silencing it.
4. **`useLiveQuery` from `dexie-react-hooks`** is how a component reads the local store, so
   the UI updates reactively when the store changes. Do not hand-roll a `useEffect` fetch
   against Dexie.
5. **Read through the scope helper.** Every query goes through `useScope()` and
   `notDeleted()` from `apps/web/src/lib/scope.ts`. See
   [`rbac-and-scope.md`](rbac-and-scope.md).
6. **Write through the repository layer.** Never mutate a Dexie table from a component. See
   [`offline-sync.md`](offline-sync.md).

---

## 3. Imports

- **Relative paths inside `apps/web/src`**, matching the existing code:
  `../db/db`, `../lib/scope`, `../components/ui`.
- **`@phc/shared`** for anything from the shared package. It resolves directly to
  `packages/shared/src/index.ts` through aliases in both `apps/web/tsconfig.json` and
  `apps/web/vite.config.ts`, with no build step, so client and server types cannot drift.
- An `@/*` alias pointing at `apps/web/src` **is configured in both files but is not used
  anywhere yet**. Do not introduce it piecemeal: a file mixing `@/lib/scope` and
  `../lib/scope` is worse than either convention applied consistently. If the owner wants
  the switch, it is a separate mechanical change across the whole tree.

---

## 4. Styling

1. **Tailwind utility classes in the markup.** No CSS modules, no styled-components.
2. **The brand palette is `brand-50` to `brand-950`**, a dark-green scale defined in
   `apps/web/tailwind.config.js`, with `brand-900` (`#14532d`) as the primary. The same
   colour drives the PWA theme and install splash in `apps/web/vite.config.ts`.
3. **Standard Tailwind colours are used semantically** and that is intentional here:
   `slate` for text and neutral surfaces, `amber` for warnings, `red` for danger and
   alerts, `sky` for informational. Follow the established meaning; do not introduce a
   fourth accent colour without a design reason.
4. **Reuse the component classes** defined under `@layer components` in
   `apps/web/src/index.css` before writing a new utility stack: `.btn`, `.btn-primary`,
   `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.input`, `.label`, `.card`, `.badge`,
   `.nav-link`, `.nav-link-active`.
5. **Reuse the primitives in `apps/web/src/components/ui.tsx`** before building a new one:
   `PageHeader`, `StatCard`, `Badge`, `EmptyState`, `Modal`, `Avatar`, and the rest.
6. **Icons come from `apps/web/src/components/icons.tsx`.** No external icon library.
   Adding an icon means adding it to that file.

---

## 5. Designing for the real device

The target is a low-end Android phone on a slow network in a clinic. That changes what
"good" means:

- **Touch targets are large.** Staff use these one-handed, sometimes with gloves.
- **Every screen must be usable offline** and must never show a spinner waiting on a
  network call for a clinic workflow.
- **Show sync state honestly.** `SyncStatusIndicator` surfaces Offline, Pending (n),
  Syncing, Synced, and Conflict. Never hide a pending or conflicted state to make the UI
  look calm.
- **Keep the bundle small.** A new dependency needs a reason that survives the question
  "what does this cost a nurse on a 3G connection".
- Portrait orientation is the declared default in the PWA manifest.

---

## 6. Shared package boundaries

`packages/shared` holds domain logic the future NestJS API will also need: enums, the
permission matrix, MRN generation, estimated-date-of-delivery arithmetic, the immunization
and antenatal schedule engines, the facility registry, and app configuration.

- **It must not import from `apps/web`.** The dependency runs one way.
- **No React, no Dexie, no browser APIs** in `packages/shared`. It has to run in Node.
- Anything the API will duplicate belongs here instead. Duplicated domain logic between the
  PWA and the hub is how the two drift apart and how a dose gets counted twice.
- Export it through `packages/shared/src/index.ts`, which re-exports every module.

---

## 7. Severity when auditing

A violation of rules 1 to 6 is a **WARNING** on its own. It escalates to **CRITICAL** when
combined with a missing facility-scope check, a bypass of the repository layer, a hard
delete, or a committed secret.

---

## 8. Commands

Run from the repo root. Full list in [`repo-commands.md`](repo-commands.md).

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```
