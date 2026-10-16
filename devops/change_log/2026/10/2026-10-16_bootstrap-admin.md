# First-administrator bootstrap, and a correction

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-16                     |
| Time      | 23:15 WAT                      |
| Author    | OG-001                         |
| Phase     | 10                             |
| Module    | 7 (Staff Management)           |

## Summary

`d2a5595` stopped the seed creating demo accounts on a non-local database. Correct, but it
left no way in: `POST /admin/staff` requires `facility_admin` or `system_admin`, which
requires a signed-in user, which requires a user to exist. A production database seeded with
the facility registry alone has none. The only routes in were to re-run the seed with
`SEED_DEMO_USERS=true`, planting accounts whose PINs are published in `RUNNING.md`, or to
write rows by hand.

`apps/api/prisma/bootstrap-admin.ts` creates exactly one administrator on an empty database,
and `pnpm db:bootstrap-admin` runs it.

This defect was introduced by the preceding commit and found by the owner asking whether
they could create the database before buying a domain. Answering that required tracing how
the first login would work, which is where the deadlock surfaced.

## Correction to an earlier claim

**Earlier in this session I reported that `RUNNING.md` and
`.claude/rules/shared-context.md` were factually wrong to say the door screen lists 76
facilities, because the database held 94. That was wrong, and the documents are correct.**
`2026-10-16_seed-demo-account-guard.md` records the mistaken claim as an open question; this
entry supersedes it.

`NNEWI_NORTH_FACILITIES` holds 76 entries, confirmed directly, and a seed into a brand-new
database produced exactly 76. The development database holds 94 because it has been seeded
repeatedly across months while the registry changed, and the seed upserts without removing
rows that have left the registry. Eighteen of its facilities are orphans from an earlier
version of the list.

The error came from treating a long-lived development database as evidence about the
registry. The authoritative source was the registry itself, and a fresh database settled it
in one command.

## Decisions taken

**One-shot, enforced by data.** The script refuses if any user exists, so it cannot later
add a second platform-wide administrator to a live system. The check is a row count, not a
flag, so it cannot be bypassed by forgetting.

**Minimum PIN of 8 characters, against a login schema that allows 4.** This is the only
account that reaches every facility in the LGA. Four digits is ten thousand guesses; rate
limiting slows that and does not make it acceptable. The cap stays at 12 because the login
schema will not accept more.

**The PIN comes from the environment, not an argument.** An argument is readable by anything
that can see the process table and lands in shell history.

**Scoped to every facility.** Its first job is creating the per-facility admins, and it
cannot administer a facility it cannot see. The output tells the operator to keep it for
break-glass use rather than daily work.

**Audited with a null actor.** There is no signed-in user to attribute this to, which is
itself the fact worth recording. The event is `bootstrap_admin_created` and names the
username, the roles and the facility count.

**Not exposed as an API route.** A self-service "create the first admin" endpoint has to
decide whether the database is empty at request time, and that is a race worth avoiding on
an endpoint that grants platform-wide access.

## Deviations from the plan

None. This repairs a defect from the preceding commit.

## Open questions surfaced

**The seed never removes a facility that has left the registry.** It upserts, so a
long-lived database accumulates orphans, as the development database demonstrates with 18 of
them. A facility removed from the registry stays selectable on the door screen. Not fixed
here: deleting facility rows touches data that clinical records may reference, so it needs
its own change with the soft-delete rules in view.

## Files changed

| File                                                | Change type |
|-----------------------------------------------------|-------------|
| `apps/api/prisma/bootstrap-admin.ts`                | added       |
| `package.json`                                      | modified    |
| `docs/operations/production-accounts-and-costs.md`  | modified    |
| `infra/cloudflare/README.md`                        | modified    |

## Change details

### `apps/api/prisma/bootstrap-admin.ts`

New. Reads `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PIN`, refuses on a missing
username, a PIN outside 8 to 12 characters, an empty facility registry, or any existing
user. Creates the account, scopes it to every facility and writes the audit event in one
transaction.

### `package.json`

```diff
     "db:seed": "pnpm --filter @phc/api seed",
+    "db:bootstrap-admin": "pnpm --filter @phc/api exec tsx prisma/bootstrap-admin.ts",
```

### Documentation

Step 8 of the ordered sequence in the accounts document, and step 4 of the Cloudflare
README, now create the administrator before provisioning staff. The Cloudflare README's
later steps were renumbered.

## Verification

Exercised against a purpose-built empty database, `phc_bootstrap_test`, then dropped.

| Case                              | Result |
|-----------------------------------|--------|
| Schema only, no facilities        | refused, told the operator to seed first |
| PIN `0000`                        | refused, 8 to 12 required |
| No username                       | refused |
| Valid input                       | created, scoped to 76 facilities |
| Second run                        | refused, 1 user already exists |

Then the end-to-end check that matters: a hub was started against that database, the
bootstrapped account signed in and received a token, and `POST /admin/staff` returned 201
creating a real nurse account with a six-digit PIN. The deadlock is genuinely broken, not
just plausibly.

The audit event was read back from the table: `bootstrap_admin_created`, actor null,
username recorded.

The development stack was confirmed unaffected afterwards, and the test database dropped.

`pnpm typecheck` clean.
