# Demo staff accounts gated out of non-local databases

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-16                     |
| Time      | 20:10 WAT                      |
| Author    | OG-001                         |
| Phase     | 10                             |
| Module    | 7 (Staff Management)           |

## Summary

`pnpm db:seed` created the demo staff accounts unconditionally, with no guard of any kind.
Among them is `sysadmin`, PIN `0000`, holding `system_admin` across all 94 facilities, and
`lga`, PIN `6666`, holding `lga_authority` LGA-wide. Every PIN is four digits and every one
is published in `RUNNING.md`.

Running that command against a production database would hand anyone who has read this
public repository full access to every patient record in the LGA.

The seed now decides from where `DATABASE_URL` points. A local host gets the demo accounts;
anything else gets the facility registry only.

## How this was found

While answering the owner's question about setting up the production database. The
immediately preceding commit, `08c5f5a`, added `infra/cloudflare/README.md` with the step
"Load the facility registry: `pnpm db:seed`", which is exactly the instruction that would
have created those accounts on production. The defect predates that file, but that file
would have caused it to be executed.

Worth recording plainly: the dangerous instruction was written in this repository by the
assistant one commit earlier, and found only because a later question prompted reading the
seed script rather than trusting its name. "Load the facility registry" is what the script
is for; creating a platform-wide admin is not something its name suggests.

## Decisions taken

**The guard reads the target, not a flag.** An opt-in environment variable only protects
people who remember it, and the failure is silent and permanent: once the account exists,
nothing in the application points it out. Deciding from `DATABASE_URL` makes the safe
outcome the default, including for someone who has never read this entry.

**`DATABASE_URL` is parsed, not string-matched.** `new URL(...).hostname` is compared
against the loopback names. A substring test would treat
`postgresql://u:p@prod.example.com/localhost` as local.

**A URL that will not parse counts as remote.** When the target cannot be established, the
safe answer is that it is not local.

**`SEED_DEMO_USERS=true` still overrides**, for a throwaway staging database that genuinely
wants the demo logins. It is documented as something never to set against real patient data.

**The facility registry still seeds in every environment.** It is hub-authoritative
configuration and production needs it. Splitting the command in two was considered and
rejected: it would leave the dangerous half reachable by name, and a reader who typed the
wrong one would get no warning.

**The skip is loud.** The script prints what it did and did not do, and why. A guard that
silently does less is how someone concludes the seed failed and reaches for the override.

## Deviations from the plan

None. This was unplanned work, found while answering a question.

## Open questions surfaced

**`RUNNING.md` and `.claude/rules/shared-context.md` both say the door screen lists 76
facilities. The registry holds 94.** Not fixed here because it is unrelated to this defect,
but it is a factual error in two reader-facing documents.

**The local database had 92 facilities and now has 94**, because the seed upserts the
current registry and had not been re-run since the registry grew. Harmless, but it means
the 92 figure quoted earlier in this session was stale.

**No real staff accounts exist anywhere yet.** Production will need them provisioned through
the admin screens before anyone can sign in, and that is now a go-live step rather than
something the seed does.

## Files changed

| File                                      | Change type |
|-------------------------------------------|-------------|
| `apps/api/prisma/seed.ts`                 | modified    |
| `infra/cloudflare/README.md`              | modified    |
| `docs/operations/deployment-runbook.md`   | modified    |

## Change details

### `apps/api/prisma/seed.ts`

Two helpers, and an early return before the user block.

```diff
+function targetIsLocal(): boolean {
+  const url = process.env.DATABASE_URL;
+  if (!url) return false;
+  try {
+    const host = new URL(url).hostname.toLowerCase();
+    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
+  } catch {
+    return false;
+  }
+}
+
+function demoUsersAllowed(): boolean {
+  if (process.env.SEED_DEMO_USERS === "true") return true;
+  return targetIsLocal();
+}
```

```diff
+  if (!demoUsersAllowed()) {
+    const facilities = await prisma.facility.count();
+    console.log(`Seeded ${facilities} facilities.`);
+    console.log("Demo staff accounts were SKIPPED: DATABASE_URL is not a local host.");
+    ...
+    return;
+  }
+
   for (const number of provisioned) {
```

The file header now states that the seed has two parts with different safety properties.

### `infra/cloudflare/README.md`

The seeding step now states what is and is not seeded against a remote target, and says
never to set the override against real patient data.

### `docs/operations/deployment-runbook.md`

```diff
 | `bash infra/scripts/secret-scan.sh` clean | No credential in the repo |
+| No demo staff account exists on the target | `sysadmin`/`0000` is published in `RUNNING.md` |
```

## Verification

Exercised both paths against a real database rather than reasoned about.

| Target                                   | Result |
|------------------------------------------|--------|
| Loopback, `127.0.0.1:55432`              | 94 facilities and 133 users |
| Non-loopback, `172.27.126.54:55432`      | 94 facilities, demo accounts skipped |

Both pointed at the same reachable PostgreSQL instance, so the only variable was the
hostname in the URL. An unreachable host was tried first and was a useless test: the
facility loop fails before the guard is reached, which is why the real check used a
reachable database addressed two different ways.

`pnpm typecheck` clean.

Testing: no automated test added. The guard reads process environment and calls a live
database, so a unit test would assert on a mock of the thing being guarded. The two-way
manual exercise above is the meaningful check.
