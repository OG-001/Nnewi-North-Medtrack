# Compose host ports made configurable

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-16                     |
| Time      | 14:05 WAT                      |
| Author    | OG-001                         |
| Phase     | 10                             |
| Module    | n/a (infrastructure)           |

## Summary

`infra/docker-compose.yml` hardcoded all four of its published host ports, so the file
could only run on a machine where 8080, 5432, 6379 and 3000 were all free. On the
development machine every one of those is held by an unrelated stack, which made
`docker compose up` unusable rather than merely inconvenient. The host side of each mapping
is now an overridable variable with the previous value as its default.

This was found while starting the application, not by reading the file. The documented
`docker compose -f infra/docker-compose.yml up -d postgres` step in `RUNNING.md` and in the
environment setup guide could not have worked here, and the project had been running
PostgreSQL from a hand-made container outside compose as a result.

## Decisions taken

**Only the host side is parameterised.** Container-internal ports stay fixed, because
services address each other over the compose network: the api container reaches the
database at `postgres:5432` regardless of what the host publishes. Parameterising both
sides would invite a change that silently breaks service-to-service traffic.

**A collision is the expected case, not an error case.** Any machine that already runs
another Docker stack will hold some of these ports. Hardcoding meant the only remedy was
editing a tracked file, which is a local change that must never be committed, so it would
either be committed by accident or redone on every clone.

**`CORS_ORIGINS` follows `PHC_WEB_PORT`.** The api service allowed
`http://localhost:8080`, which would have been wrong the moment the web port moved, and the
failure would have surfaced as an opaque browser error rather than a port conflict.

**Defaults are unchanged**, so an existing deployment behaves exactly as before and no
runbook step needs revisiting.

**The production overlay was deliberately left alone.** `infra/docker-compose.prod.yml`
publishes only Caddy on 80 and 443, which is the correct posture: no database port exposed.
Making those configurable would serve no purpose and would weaken a security property.

## Deviations from the plan

The request was to fix the PostgreSQL mapping. All four were changed instead, because
fixing one of four occupied ports would have left `docker compose up` equally unusable.
The pattern is identical in each case. This widening was stated at the time rather than
made silently.

## Open questions surfaced

`RUNNING.md` still documents the hub on port 3000 and the PWA on 8080 as fixed facts, and
this project's own configuration uses 3100 and 5173. That prose is now understated rather
than wrong, since both are overridable, but it should be reworded.

## Files changed

| File                             | Change type |
|----------------------------------|-------------|
| `infra/docker-compose.yml`       | modified    |
| `infra/scripts/init-env.sh`      | modified    |
| `infra/.env.example`             | modified    |

## Change details

### `infra/docker-compose.yml`

```diff
@@ -9,7 +20,7 @@ services:
     ports:
-      - "8080:80"
+      - "${PHC_WEB_PORT:-8080}:80"
@@ -19,7 +30,7 @@
     ports:
-      - "5432:5432"
+      - "${PHC_DB_PORT:-5432}:5432"
@@ -27,7 +38,7 @@
     ports:
-      - "6379:6379"
+      - "${PHC_REDIS_PORT:-6379}:6379"
@@ -41,7 +52,7 @@
-      CORS_ORIGINS: http://localhost:8080,http://localhost:5173
+      CORS_ORIGINS: http://localhost:${PHC_WEB_PORT:-8080},http://localhost:5173
       PORT: 3000
     ports:
-      - "3000:3000"
+      - "${PHC_API_PORT:-3000}:3000"
```

A header comment names the four variables, states that container-internal ports are
deliberately fixed, and gives a worked example.

### `infra/scripts/init-env.sh`

The script told the reader to hand-edit the compose file, which is now both unnecessary and
wrong advice. It prints the override command instead, and covers the API port as well as
the database port.

```diff
-  [ "$DB_PORT" != "5432" ] && echo "  Note: using database port $DB_PORT. Match it in infra/docker-compose.yml."
+  if [ "$DB_PORT" != "5432" ] || [ "$API_PORT" != "3000" ]; then
+    echo
+    echo "  Non-default ports. Pass them to compose rather than editing the file:"
+    echo "    PHC_DB_PORT=$DB_PORT PHC_API_PORT=$API_PORT \\"
+    echo "      docker compose -f infra/docker-compose.yml up -d postgres"
+  fi
```

### `infra/.env.example`

A commented block documenting the four variables, why only the host side moves, and that
the production overlay publishes none of them. Commented out rather than set, so the
template continues to carry no values.

## Verification

Interpolation checked with `docker compose config` in both directions:

| Variables set                   | Published ports            |
|---------------------------------|----------------------------|
| none                            | 8080, 5432, 6379, 3000     |
| all four overridden             | 8085, 55432, 6380, 3100    |

Container targets stayed 80, 5432, 6379 and 3000 in both runs.

Then exercised for real rather than only parsed. PostgreSQL was brought up through compose
with `PHC_DB_PORT=55433`, bound to `0.0.0.0:55433->5432/tcp`, and answered
`pg_isready` with `accepting connections`. The test instance and its empty volume were
removed afterwards, and the running development stack was confirmed unaffected: the hub
still answered health on 3100 and the PWA on 5173.

Testing: no automated test added. Compose port mapping has no import graph, and
`docker compose config` plus a real container start cover it directly.
