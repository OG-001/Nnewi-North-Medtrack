# Environment generator hardening

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-09-23                     |
| Time      | 18:05 WAT                      |
| Author    | Claude Opus 5                  |
| Phase     | 10                             |
| Module    | n/a (deployment tooling)       |

## Summary

`infra/scripts/init-env.sh` generates the `.env` files this project needs, with secrets
created by a CSPRNG on the machine that will use them so they never travel through a
transcript. Running it for real on a development machine exposed three defects that only
appear when the script is executed, not when it is read.

The first is a file-permission defect with a security consequence. The script sets
`umask 077` before writing, which applies only to files it **creates**. On a `--force`
re-run the target already exists, the heredoc truncates it in place, and the existing mode
survives. The file was created `0664`, world-readable, while the script printed
`Created ... (permissions 600).` The message was false, and the file held a JWT signing
secret and a database password.

The second is a port collision. `PORT` was hard-coded to `3000`, which was already held by
an unrelated container on this machine, so the hub could not bind.

The third is that development runs reported `Not yet designated` for the data controller
and Data Protection Officer on `GET /api/v1/system/compliance`, because the development
branch of the script omitted the accountability and retention variables that the production
branch writes.

A fourth, cosmetic: `--help` printed lines 2 to 20 of the file, cutting the closing sentence
in half after a usage line was added.

## Decisions taken

`chmod 600` is now explicit after each heredoc rather than relying on `umask`. A umask is a
mask on creation, so it is the wrong tool for a path that can truncate an existing file.
Stating the permission in the output while not enforcing it is worse than doing neither,
because it invites the reader to skip the check.

The port collision produces a **warning, not a failure**. The script writes configuration;
it does not own the machine's port allocation, and a port that is busy now may be free when
the hub actually starts. The warning names the remedy so the reader is not left guessing.

Development now mirrors production's non-secret accountability and retention values. A
compliance endpoint that reads correctly in production and wrongly in development trains
the reader to discount it.

`PHC_DPO_CONTACT` is deliberately left **empty** in the development branch. It is a real
personal contact address, and the repository is the wrong home for one. The production
branch prompts for it interactively and warns when it is skipped.

## Deviations from the plan

None.

## Open questions surfaced

`infra/.env.example` carries the designated officers' real names, committed in `1d18485`.
The governing rule in `.claude/rules/ndpa-compliance.md` says the template must contain
placeholder values only. A DPO's name is published deliberately through
`GET /api/v1/system/compliance`, so this is not a leak, but it does contradict the rule as
written. The owner should decide whether to relax the rule for accountability values or move
the names out of the template and into `infra/.env` alone.

`infra/.env` has not been generated. It needs a real domain, a certificate notification
address and the DPO contact, none of which are guessable.

## Files changed

| File                                  | Change type |
|---------------------------------------|-------------|
| `infra/scripts/init-env.sh`           | modified    |

## Change details

### `infra/scripts/init-env.sh`

Explicit `chmod 600` after both heredocs, replacing reliance on `umask 077`:

```diff
@@ -91,7 +91,13 @@ SMS_ENABLED=false
 SMS_REMINDERS_ENABLED=false
 EOF
 
+  chmod 600 "$TARGET"   # explicit: --force truncates, keeping the old file's mode
   echo "Created $TARGET (permissions 600)."
```

```diff
@@ -175,6 +175,7 @@ SMS_REMINDERS_ENABLED=false
 EOF
 
+chmod 600 "$TARGET"   # explicit: --force truncates, keeping the old file's mode
 echo "Created $TARGET (permissions 600). Secrets were generated locally and not printed."
```

A configurable API port with a collision warning:

```diff
@@ -33,6 +33,7 @@ while [ $# -gt 0 ]; do
     --db-port) DB_PORT="${2:?--db-port needs a value}"; shift ;;
+    --api-port) API_PORT="${2:?--api-port needs a value}"; shift ;;
     --force) FORCE="yes" ;;
```

```diff
@@ -91,6 +91,11 @@
+  if command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q ":${API_PORT} "; then
+    echo
+    echo "WARNING: something is already listening on port ${API_PORT}." >&2
+    echo "         The hub will fail to start. Re-run with --api-port <free port> --force." >&2
+  fi
```

Accountability and retention mirrored into the development file:

```diff
@@ -73,7 +73,17 @@ REFRESH_TOKEN_TTL_DAYS="30"
-PORT=3000
+PHC_DATA_CONTROLLER="Ogechukwu Eleodimuo"
+PHC_DPO_NAME="Ogechukwu Eleodimuo"
+PHC_DPO_CONTACT=""
+PHC_RETENTION_GENERAL_YEARS=10
+PHC_RETENTION_MATERNITY_YEARS=25
+PHC_RETENTION_CHILD_UNTIL_AGE=18
+
+PORT=${API_PORT}
```

Help range extended so the closing sentence is not cut in half:

```diff
@@ -38,1 +38,1 @@
-    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
+    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
```

## Verification

Reproduced the permission defect in a throwaway repository: a pre-existing `0664` file
re-generated with `--force` came out `0664` before the fix and `0600` after it.

On this machine, after regenerating `apps/api/.env`: mode `600`, a 64-character
`JWT_SECRET`, database port `55432`, hub listening on `3100`, `nurse` / `2222` issuing a
token, an authenticated `POST /sms/send` returning `503 SMS_DISABLED`, and
`GET /system/compliance` reporting the controller, a 10-year general and 25-year maternity
retention, and SMS off.

Testing: no automated test added. This is a generator for gitignored files with no import
graph; the verification above was performed by running it.
