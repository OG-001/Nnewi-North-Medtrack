# Environment bootstrap script

| Field  | Value                     |
|--------|---------------------------|
| Date   | 2026-09-23                |
| Time   | 17:52 WAT                 |
| Author | Implementation            |
| Phase  | 10, Deployment            |
| Module | n/a, tooling              |

## Summary

`infra/scripts/init-env.sh` creates the `.env` files the project needs, with
secrets generated on the machine that will use them.

The owner asked for the `.env` files to be created. They were not created
directly, for the reason below, and this script is the answer instead.

## Decisions taken

1. **A script the owner runs, rather than files written by tooling.**

   Global Constraint 1 forbids writing `.env` files, and
   `.claude/hooks/safety-gate.sh` enforces it deterministically. The constraint
   is right on its own terms, and there is a second reason that matters more
   here: a secret that passes through a transcript, a terminal history or an
   issue has already leaked. Generated locally by this script, it exists in one
   place only, and the script never prints it.

   Writing the files directly would also have meant bypassing a live guardrail
   through an indirect path, which is worse than the inconvenience it saves.

2. **It refuses to overwrite an existing `.env`.** Rotating `JWT_SECRET` signs
   everyone out, and rotating `BACKUP_PASSPHRASE` makes every existing backup
   permanently unreadable. `--force` exists for a deliberate rotation and says
   so.

3. **`umask 077` before writing**, so the file is created `600` rather than
   being briefly world-readable and chmoded afterwards.

4. **Production mode asks for the three values it cannot invent**: the domain,
   the certificate email and the DPO contact. It warns, rather than silently
   accepting, when the DPO contact is left blank, because a Data Protection
   Officer nobody can reach does not satisfy the accountability principle.

5. **Development mode takes `--db-port`.** A port collision on 5432 is common
   and was hit on this machine, so the script accommodates it rather than
   producing a `DATABASE_URL` that silently points at somebody else's database.

## Deviations from the plan

None. This implements Global Constraint 1 rather than working around it.

## Open questions surfaced

None.

## Files changed

| File                              | Change type |
|-----------------------------------|-------------|
| `infra/scripts/init-env.sh`       | added       |
| `docs/operations/environment-setup.md` | modified |
| `docs/operations/deployment-runbook.md` | modified |

## Change details

### `infra/scripts/init-env.sh`

New. Two modes.

```bash
./infra/scripts/init-env.sh                  # apps/api/.env for development
./infra/scripts/init-env.sh --db-port 55432  # when 5432 is taken
./infra/scripts/init-env.sh --prod           # infra/.env for the pilot server
```

Generates `JWT_SECRET` in development, and `POSTGRES_PASSWORD`, `JWT_SECRET`
and `BACKUP_PASSPHRASE` in production, each 48 bytes of CSPRNG output. The
production file carries the controller, DPO and retention settings decided on
2026-09-23, and `SMS_ENABLED=false`.

### `docs/operations/environment-setup.md`

Section 7 now leads with the script and keeps the manual steps beneath it, for
a reader who would rather see what is being written.

## Verification

Exercised in a throwaway git repository, so no `.env` in this project was
written by tooling. The throwaway secrets were scrubbed afterwards.

| Check | Result |
|-------|--------|
| Development mode writes `apps/api/.env` | created, permissions `600` |
| Production mode writes `infra/.env` | created, permissions `600` |
| Generated secrets | 64 characters each, all three distinct |
| Secrets printed to stdout | none |
| Second run against an existing file | refused, non-zero exit |
| Generated production file against the stack | `docker compose config` renders; every required variable present |
| Controller, retention and SMS values reach the api service | confirmed in the rendered config |
| `infra/scripts/secret-scan.sh` | clean over 385 tracked files |

Testing: no automated test added. The script's effect is creating a file outside
the repository's tracked tree, and the verification above exercises both modes
and both failure paths.
