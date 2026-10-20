# First-contact sign-in for hub-only accounts

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-20                     |
| Time      | 14:40 WAT                      |
| Author    | OG-001                         |
| Phase     | 1 / 3                          |
| Module    | 7 (Staff Management)           |

## Summary

A device could sign in only with an account already in its own IndexedDB. Accounts reach a
device by syncing down, syncing needs an enrolled device, enrolment needs a hub session, and
a hub session was attempted only *after* a successful local sign-in. So a freshly installed
device could sign in only with an account the client-side demo seed had planted. A real
deployment had no way in at all.

The owner hit this directly: the administrator created on the production database with
`pnpm db:bootstrap-admin` was refused with "Unknown username", at every facility, because
the browser had never heard of it.

Sign-in now consults the hub when, and only when, the local store has no answer. On success
the account is written locally, so every later sign-in takes the offline path.

## Decisions taken

**Local first, unchanged.** The hub is consulted only when the device cannot answer, so a
working offline sign-in never waits on the network. That ordering is the offline guarantee
and was not touched.

**Three distinct outcomes, not two.** `establishHubSession` flattens every failure to null,
which is right for a best-effort session alongside an existing login but useless here.
`adoptAccountFromHub` returns `ok`, `rejected` or `hub_unreachable`, because the user needs
a different message for each. Telling a nurse on a dead network that her PIN is wrong would
be the worst of the three.

**One message for every hub rejection.** Unknown username, wrong PIN, not provisioned for
this facility and revoked device all return "Username or PIN not recognised." The hub is
internet-facing, so distinguishing them would turn the sign-in form into a username oracle
for every account in the LGA. The local path keeps its specific messages, because those
accounts are already on the device and their existence is not a secret from whoever holds
it.

Verified the hub itself does not leak either: a wrong PIN and an unknown username both
return 401.

**The hub is authoritative on scope.** A null scope means LGA-wide and is stored as the full
local registry, so the sign-in check and every later scope filter see an explicit list
rather than a special case. Only facilities the hub granted are written, so the isolation
rules still hold.

**Adoption also runs when the username is known locally but the facility is not.** The hub
may have widened an account's scope since the last sync, and it is the authority on that.

**Written straight to the table, not through the repository layer.** This is hub data
arriving, exactly like the sync engine's apply path, which bypasses the repository for the
same reason. Going through `createRecord` would append an outbox entry and push the account
back to the hub that just sent it.

**The PIN is cached locally**, because offline sign-in for the adopted account is the entire
point. The local store is not encrypted; that residual risk is already documented and
mitigated by device encryption, auto-lock and purge on logout. Not caching it would mean the
account works online and fails offline, which is worse than the documented risk.

**No second hub login.** Adoption already signs in, enrols and syncs, so the opportunistic
`establishHubSession` call is skipped in that case.

## Deviations from the plan

None.

## Open questions surfaced

- **The log-out control is icon-only with a `title` and no `aria-label`.** It is reachable,
  since the accessible name falls back to the title, but a label would be better on a
  primary control. Found while writing the test.
- **The local `UserAccount.pin` field is still commented "demo-only local auth".** That
  comment predates the hub and is now misleading: it is the real offline credential.

## Files changed

| File                                           | Change type |
|------------------------------------------------|-------------|
| `apps/web/src/lib/hub-session.ts`              | modified    |
| `apps/web/src/lib/session.tsx`                 | modified    |
| `apps/web/e2e/hub-account-adoption.spec.ts`    | added       |

## Change details

### `apps/web/src/lib/hub-session.ts`

New `adoptAccountFromHub`, returning the three-case `AdoptOutcome`. It checks reachability
separately from the login so "no hub here" stays distinguishable from "the hub said no",
signs in, enrols, purges out-of-scope data, writes the account to `db.users`, refreshes
config and syncs.

### `apps/web/src/lib/session.tsx`

```diff
-      const u = candidates.find((c) => c.facility_ids.includes(selectedFacilityId));
-      if (!u) {
-        return candidates.length
-          ? { ok: false, error: "That account is not provisioned for this facility." }
-          : { ok: false, error: "Unknown username." };
-      }
+      let u = candidates.find((c) => c.facility_ids.includes(selectedFacilityId));
+      let adoptedFromHub = false;
+
+      if (!u) {
+        const adopted = await adoptAccountFromHub(uname, pin, selectedFacilityId);
+        if (adopted.outcome === "ok") {
+          u = adopted.account;
+          adoptedFromHub = true;
+        } else if (adopted.outcome === "rejected") {
+          return { ok: false, error: "Username or PIN not recognised." };
+        } else {
+          return candidates.length
+            ? { ok: false, error: "That account is not provisioned for this facility." }
+            : { ok: false, error: "Unknown username, and the sync hub is unreachable." };
+        }
+      }
```

```diff
-      void establishHubSession(uname, pin, selectedFacilityId);
+      if (!adoptedFromHub) void establishHubSession(uname, pin, selectedFacilityId);
```

### `apps/web/e2e/hub-account-adoption.spec.ts`

Five end-to-end tests against the production build and a live hub, skipping when no hub
answers. They cover adoption on a device that provably does not hold the account, offline
sign-in afterwards, a wrong PIN, an unknown username, and an unreachable hub.

## Verification

This is an authentication change, so it was tested end to end in a real browser rather than
against mocks. Five tests, all passing, against the production build and the hub backed by
the production database:

| Case                                        | Expected                        |
|---------------------------------------------|---------------------------------|
| Hub-only account, device has never held it  | signs in                        |
| Same account afterwards, network cut        | signs in from cache             |
| Wrong PIN                                   | "Username or PIN not recognised"|
| Unknown username                            | same neutral message            |
| Hub unreachable                             | says the hub is unreachable     |

The first test asserts the premise by reading IndexedDB directly and confirming the account
is absent before attempting sign-in, so a pass cannot come from the account already being
there.

No regressions: the existing offline suite passes 7 of 7, and the hub suites pass 130 with
12 skipped. Those were run against the local container, deliberately, so write-heavy
integration tests did not touch the production database. Confirmed afterwards that the
production database still holds 76 facilities, one user and zero clinical rows.

`pnpm lint`, `pnpm typecheck` and `pnpm build` clean.

Two false starts worth recording. `signOutCompletely` clears localStorage without reloading,
so the app stayed on the previous screen and the sign-in form never rendered; the spec
reloads. And the first hub-side test account was given a 13-character PIN, which the login
schema rejects at 12, so every login returned 400 including the valid one.
