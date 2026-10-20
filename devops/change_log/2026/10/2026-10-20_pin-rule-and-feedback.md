# One PIN rule, and feedback that names the problem

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-20                     |
| Time      | 17:05 WAT                      |
| Author    | OG-001                         |
| Phase     | 1 / 9                          |
| Module    | 7 (Staff Management)           |

## Summary

Creating a staff account returned `400 Bad Request` three times with nothing to act on. Two
defects behind it.

The PIN rule was written three times and the three disagreed. Login accepted 4 to 12
characters of any kind, staff creation accepted only 4 to 6 digits, and the break-glass
bootstrap script demanded 8 to 12. The administrator created by that script could therefore
never have been created through the admin screen it was using.

And the hub's clear message never reached the user. A validation failure sends a generic
`message` of "Request body failed validation" with the useful part in `details`. The client
read only `message` and dropped `details`, so "PIN must be 4 to 6 digits" arrived at the
form as an opaque 400.

## Decisions taken

**One file owns the rule.** `packages/shared/src/pin.ts` holds the bounds, the weak-PIN
list, the schemas and the message text. Both the hub and the client import it, so the form
and the server cannot say different things about the same mistake.

**Two policies and one input bound, stated as such.** There genuinely are different rules: a
clinic PIN is typed many times a day on a shared tablet, sometimes with gloves, so it is
short and numeric; the break-glass account reaches every facility in the LGA, so it is long.
Login is not a policy at all, it is a sanity bound that must accept anything the system can
issue. Rejecting a credential the system itself created locks a user out of their own
account and looks like a wrong PIN.

**Login's bounds are derived, not written.** `LOGIN_PIN_MIN` and `LOGIN_PIN_MAX` are
computed from the two policies, so widening either cannot lock anyone out. A test asserts
the derivation, because the original defect was exactly this drifting.

**Bounds unchanged.** Staff PINs stay 4 to 6 digits. Raising the floor would invalidate the
seeded demo accounts and the offline tests that sign in with them, which is a larger change
than the defect warrants. **The weakness remains and is the owner's to decide:** six digits
is a million combinations, and the admin screen cannot issue anything stronger even though
login would accept it.

**One problem reported, the most useful one.** `describeStaffPinProblem` returns a single
message. Someone who typed four letters needs to know digits are required; telling them the
length is also wrong adds nothing. It also now rejects any single repeated digit, not only
the five listed values.

**Feedback arrives as the field is filled in.** The form calls the same function, so no
request is made for a mistake that can be seen locally, and the message is identical to the
one the hub would send. The server still enforces the rule: the client check is feedback,
not security.

**Field names are humanised for display.** `pin` becomes "Pin" rather than appearing raw in
a sentence shown to a nurse.

## Deviations from the plan

None.

## Open questions surfaced

**A 4 to 6 digit PIN is weak and the ceiling is unreachable from the UI.** Login accepts up
to 12 characters; the admin screen can only issue 6 digits. Raising the staff minimum to 6,
or allowing longer PINs for administrative roles, is a policy call with a known cost: the
demo accounts and the offline test suite sign in with 4-digit PINs.

**The seed bypasses the rule entirely.** `prisma/seed.ts` hashes PINs directly, which is why
demo accounts exist with `1111` and `0000` despite both being blacklisted. Harmless while it
only runs locally, and the host guard keeps it off production, but the rule is not enforced
everywhere it could be.

## Files changed

| File                                         | Change type |
|----------------------------------------------|-------------|
| `packages/shared/src/pin.ts`                 | added       |
| `packages/shared/src/index.ts`               | modified    |
| `packages/shared/test/pin.test.ts`           | added       |
| `apps/api/src/admin/admin.dto.ts`            | modified    |
| `apps/api/src/auth/auth.dto.ts`              | modified    |
| `apps/api/prisma/bootstrap-admin.ts`         | modified    |
| `apps/web/src/lib/api.ts`                    | modified    |
| `apps/web/src/components/StaffAdmin.tsx`     | modified    |
| `apps/web/e2e/hub-account-adoption.spec.ts`  | modified    |

## Change details

### `packages/shared/src/pin.ts`

New. `WEAK_PINS`, the staff and break-glass bounds, `LOGIN_PIN_MIN`/`MAX` derived from them,
`STAFF_PIN_HINT` for field labels, `describeStaffPinProblem` for the message, and three Zod
schemas built on top.

### `apps/api/src/admin/admin.dto.ts` and `auth/auth.dto.ts`

```diff
-export const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits")...
-  pin: pinSchema,
+import { staffPinSchema } from "@phc/shared";
+  pin: staffPinSchema,
```

```diff
-  pin: z.string().min(4).max(12),
+  // Input bound only, never policy: see packages/shared/src/pin.ts.
+  pin: loginPinSchema,
```

### `apps/web/src/lib/api.ts`

`parseError` now folds `details` into the message and keeps them on `ApiError`.

```diff
+      if (details?.length) {
+        message = details
+          .map((d) => (d.field && d.field !== "(body)" ? `${labelFor(d.field)}: ${d.issue}` : d.issue))
+          .join(" ");
+      }
```

### `apps/web/src/components/StaffAdmin.tsx`

The label reads from `STAFF_PIN_HINT`, the help text turns red and states the problem as the
field is typed, the input carries `aria-invalid` and `aria-describedby`, and `submitNew`
returns early rather than making a request that will fail.

## Verification

Reproduced the original failure against a running hub, then confirmed each case end to end:

| PIN entered | Message now returned                                        |
|-------------|-------------------------------------------------------------|
| `48213765`  | PIN is too long. It must be 4 to 6 digits.                   |
| `nurse1`    | PIN must be digits only, 4 to 6 digits.                      |
| `73`        | PIN is too short. It must be 4 to 6 digits.                  |
| `1234`      | That PIN is too easily guessed. Choose something less obvious.|
| `730194`    | accepted, account created                                    |

Nine new unit tests, including that login accepts every PIN both policies can issue and that
its bounds are derived rather than hand-written.

Full gate clean: lint, typecheck, build. 245 unit and hub tests pass with 12 skipped. All 12
end-to-end tests pass, run against the local database so nothing touched production.

**A defect found only by running it.** The first attempt returned `500` with
`Cannot read properties of undefined (reading '_parse')`. The hub resolves `@phc/shared` to
its compiled CommonJS output, and only `packages/shared` had not been rebuilt, so
`loginPinSchema` was `undefined` at runtime and every login failed. `pnpm typecheck` passes
regardless, because TypeScript path-maps the package to source. Rebuilding the shared
package fixed it. Anything touching `packages/shared` needs `pnpm --filter @phc/shared build`
before the hub will see it.

**A second one in the test suite.** Two adoption tests depended on a hub account created by
hand in an earlier session, and failed once it was cleaned up. The spec now provisions its
own fixture through the admin API and verifies it is usable before running, so a pass cannot
depend on manual setup.
