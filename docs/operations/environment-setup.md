# Environment setup, from a bare machine

**Who this is for:** whoever sets up a machine to run PHC-Track, whether a
developer laptop or the pilot server. No prior knowledge of the project is
assumed.

**What this covers:** every piece of software the app needs, and how to set each
one up. For deploying the production stack to a server, read this first and then
[`deployment-runbook.md`](deployment-runbook.md), which assumes the tooling here
is already in place.

---

## 1. What you actually need

| Component | Why | Required? |
|-----------|-----|:---------:|
| Node 20 or newer | Runs both the web build and the hub | Yes |
| pnpm 9.15.0 | The package manager this repo is pinned to | Yes |
| PostgreSQL 16 | The sync hub's database | Yes, for the hub |
| Docker | The easiest way to run PostgreSQL | Recommended |
| A browser | Chromium or Firefox, for the app and the tests | Yes |

**You do not need Redis.** It appears in both Compose files and the architecture
notes because background jobs were planned for it, but **nothing in the hub
currently reads it**: there is no `REDIS_URL` in the code and no BullMQ
dependency. With SMS switched off there is no job to run at all. Skip it for the
pilot. It costs memory, patching and attack surface for nothing.

**You do not need an SMS provider account.** SMS is switched off for this
deployment. See the change log entry for 2026-09-23.

> **The PWA alone needs none of this at runtime.** It is offline-first: it runs
> entirely in the browser against its own local store. PostgreSQL and the hub are
> only needed for devices to sync with each other. You can set up steps 1, 5 and
> 9 alone and have a working single-device app.

---

## 2. Step 1: Node 20 or newer

Check what you have:

```bash
node --version
```

If it is missing or older than 20, install it. On Ubuntu or Debian:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

On macOS with Homebrew:

```bash
brew install node@20
```

Verify: `node --version` prints `v20.x.x` or higher.

---

## 3. Step 2: pnpm 9.15.0

This repo is pinned to pnpm and **will produce a broken install with npm or
yarn**, because they write a second lockfile and do not understand the
workspace. Node ships a tool called corepack that installs the right version
automatically:

```bash
corepack enable
```

Verify from inside the repository, which is where the pinned version applies:

```bash
cd /path/to/Nnewi-North-Medtrack
pnpm --version     # should print 9.15.0
```

> **If pnpm complains about the store location** ("pnpm now wants to use the
> store at ..."), it is because `node_modules` was installed with a different
> store path. Either reinstall from scratch, or point it back:
> `pnpm install --store-dir <the path it names as the old one>`.

---

## 4. Step 3: Docker, for PostgreSQL

Skip this if you are installing PostgreSQL natively (section 5b).

```bash
# Ubuntu or Debian
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # then log out and back in
```

Verify: `docker --version` and `docker compose version` both print a version.

---

## 5. Step 4: PostgreSQL 16

### 5a. With Docker (recommended)

The repository ships a development stack. From the repository root:

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

That starts PostgreSQL 16 on port 5432 with:

| Setting | Development value |
|---------|-------------------|
| User | `phc` |
| Password | `phc_dev_only` |
| Database | `phc_track` |

**Those credentials are for development only** and must never appear in a
deployment. The production stack takes them from `infra/.env`.

Check it is accepting connections:

```bash
docker compose -f infra/docker-compose.yml exec postgres pg_isready -U phc
```

You should see `accepting connections`.

> **If port 5432 is already in use**, something else is running PostgreSQL.
> Either stop it, or edit the port mapping in `infra/docker-compose.yml` to
> something free such as `55432:5432` and use that port in your `DATABASE_URL`.

### 5b. Natively, without Docker

```bash
# Ubuntu or Debian
sudo apt-get install -y postgresql-16
sudo -u postgres psql -c "CREATE USER phc WITH PASSWORD 'choose-a-password';"
sudo -u postgres psql -c "CREATE DATABASE phc_track OWNER phc;"
```

On macOS: `brew install postgresql@16 && brew services start postgresql@16`,
then the same two `psql` commands.

---

## 6. Step 5: Get the code and install dependencies

```bash
git clone https://github.com/OG-001/Nnewi-North-Medtrack
cd Nnewi-North-Medtrack
pnpm install
```

This installs for all three workspace packages at once: `apps/web`, `apps/api`
and `packages/shared`.

> **If any later command fails with "cannot find module", run `pnpm install`
> from the repository root first.** That is the single most common cause.

### 6a. Set the commit identity before your first commit

Do this immediately after cloning. Skipping it is not harmless, and the damage is
invisible until someone reads the history on GitHub.

Commit authorship and push access are unrelated in git. The author comes from
`user.email`; your credential only decides whether the push is allowed. GitHub then
credits the commit to whichever account has that email verified. So a wrong identity
pushes successfully and quietly credits the wrong person. It happened on this project:
a global `user.email` stamped 16 commits onto an unrelated account, and repairing it
needed a history rewrite and a force push over published commits.

```bash
git config --local user.name "OG-001"
git config --local user.email "og.eleodimuo@gmail.com"
git config --local core.hooksPath .githooks
```

Use `--local`, never `--global`. A machine may host other projects that legitimately
commit as a different account.

The third line arms `.githooks/pre-commit`, which refuses a commit carrying the wrong
author email. The hook is version-controlled, but `core.hooksPath` is local config, so
it stays dormant until you set it. Verify:

```bash
git var GIT_AUTHOR_IDENT     # must show OG-001 <og.eleodimuo@gmail.com>
```

### 6b. Authenticate pushes with SSH, not a token

SSH is preferred here. Nothing expires, no secret sits in a file, and no token can leak
through a shell history or a transcript.

If the machine's default SSH key already belongs to a different GitHub account, do not
try to reuse it. A key can exist on only one account. Generate a second one and select
it with a host alias:

```bash
ssh-keygen -t ed25519 -C "OG-001 phc-track" -f ~/.ssh/id_ed25519_og001 -N ""
cat ~/.ssh/id_ed25519_og001.pub
```

Add that public key while signed in as the correct account, under
**Settings, SSH and GPG keys, New SSH key**, leaving the type as **Authentication Key**.
Paste the whole `ssh-ed25519 ...` line. The `SHA256:` fingerprint is for comparison
only and is never pasted.

Then add this to `~/.ssh/config`, which must be mode 600:

```
Host github-og001
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_og001
  IdentitiesOnly yes
```

Point the clone at the alias and confirm the identity before you push anything:

```bash
git remote set-url origin git@github-og001:OG-001/Nnewi-North-Medtrack.git
ssh -T git@github-og001          # must answer: Hi OG-001!
```

If that answers with a different account name, the alias is not being used. Fix it
before committing, not after.

---

## 7. Step 6: Configure the hub

One command, which generates the secrets for you:

```bash
./infra/scripts/init-env.sh
```

That writes `apps/api/.env` with a freshly generated `JWT_SECRET` and a
`DATABASE_URL` pointing at the development database. If 5432 was already taken
in step 4, pass the port you used:

```bash
./infra/scripts/init-env.sh --db-port 55432
```

The script **refuses to overwrite an existing `.env`**, so it cannot destroy the
secrets of something already running. Pass `--force` only when you mean to
rotate them.

For the pilot server, use `--prod`. It asks for the three values it cannot
generate (domain, certificate email, DPO contact) and writes `infra/.env`.

> **Why a script rather than files in the repository, or values pasted from a
> chat:** a secret that travels through a transcript, a terminal history or an
> issue has already leaked. Generated on the machine that will use it, it exists
> nowhere else. `.env` files are gitignored and must never be committed; only
> `.env.example` is tracked, and it holds placeholders only.

### Doing it by hand instead

```bash
cp apps/api/.env.example apps/api/.env
```

Then set `DATABASE_URL` to match step 4, and `JWT_SECRET` to the output of
`openssl rand -base64 48`. Any string of at least 32 characters works for
development, but generate a real one: the habit is what matters.

---

## 8. Step 7: Create the database schema

```bash
pnpm db:migrate
```

This applies every migration in `apps/api/prisma/migrations/` and generates the
Prisma client. Run it again after pulling changes that add a migration.

You should see `Your database is now in sync with your schema.`

---

## 9. Step 8: Load the facility registry

```bash
pnpm db:seed
```

This creates the 76 Nnewi North LGA facilities and the demo staff accounts.

> **On a real deployment, remove or re-credential the demo accounts before any
> patient is registered.** Their PINs are published in `RUNNING.md`. This is the
> single most likely way a live deployment gets compromised.

---

## 10. Step 9: Run it

The hub and the app are two processes. Open two terminals.

**Terminal 1, the sync hub:**

```bash
pnpm dev:api
```

It listens on `http://localhost:3000/api/v1`. Check it:

```bash
curl http://localhost:3000/api/v1/system/health
# {"status":"ok","database":"up","at":"..."}
```

> **If port 3000 is taken**, set `PORT=3100` in `apps/api/.env` and use that
> port everywhere below. Port 3000 is a common default and collides often.

**Terminal 2, the web app:**

```bash
# Point the app at the hub. Omit this and it runs standalone, offline-only.
VITE_API_BASE_URL="http://localhost:3000/api/v1" pnpm dev
```

Open `http://localhost:5173`.

---

## 11. Step 10: Check it end to end

1. The door screen lists the Nnewi North facilities.
2. Choose **Primary Health Centre Umuenem Otolo Nnewi** and sign in as `nurse`
   with PIN `2222`.
3. The connectivity chip top right reads **Synced**, not Offline. If it reads
   Offline while you are online, the app is not reaching the hub: check
   `VITE_API_BASE_URL` and that the hub is running.
4. Register a patient. Open DevTools, Network tab, switch to **Offline**, and
   register another. It should save.
5. Switch back online. The chip should return to Synced.

If all five work, the environment is correct.

---

## 12. Running the tests

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Two things are worth knowing before you run them.

**The live-hub tests need a raised rate limit.** The suite makes far more than
120 requests a minute and will otherwise trip the hub's own limiter and fail
with confusing errors:

```bash
RATE_LIMIT_PER_WINDOW=100000 pnpm dev:api
```

The low default is right for a clinic, not for a test run. The live-hub suites
skip themselves when no hub answers, so `pnpm test` still works with nothing
running.

**The offline browser tests run against the production build**, never the dev
server, because offline behaviour comes from the service worker and that only
exists after `vite build`:

```bash
pnpm e2e     # builds, previews on 4173, then runs Playwright
```

First run downloads a browser, so allow a few minutes.

---

## 13. Troubleshooting

**"Cannot find module '@phc/shared'" when starting the hub.** The shared package
has a CommonJS build that the hub consumes and the web app does not. Build it:

```bash
pnpm --filter @phc/shared build
```

**The hub starts, then immediately exits complaining about a missing provider or
a metadata error.** Use `pnpm dev:api` or `pnpm build:api && node apps/api/dist/src/main.js`.
Do not run the hub through `tsx`: it compiles with esbuild, which does not emit
the decorator metadata NestJS relies on for dependency injection.

**The app shows Offline even though you are online.** Either `VITE_API_BASE_URL`
was not set when the app was built or started, or the hub is not running, or the
hub's `CORS_ORIGINS` does not include the address you loaded the app from.

**Migrations fail with "Authentication failed ... credentials for `phc` are not
valid".** This usually does **not** mean the password is wrong. It means
something else is already listening on 5432 and you are talking to a different
PostgreSQL, which has no `phc` user. Check what holds the port:

```bash
docker ps --format "{{.Names}} {{.Ports}}" | grep 5432
sudo lsof -i :5432
```

Then either stop the other server, or move ours to a free port in
`infra/docker-compose.yml` (for example `55432:5432`) and use that port in
`DATABASE_URL`. This was hit on a real machine during the writing of this guide,
where an unrelated project held 5432.

**Migrations fail with a plain connection error.** The database container is not
running, or the port differs. Re-check with `pg_isready` from section 5a.

**`pnpm install` asks to remove and reinstall everything.** See the store-path
note in section 3.

---

## 14. Where to go next

| Task | Document |
|------|----------|
| Create the `.env` files | `./infra/scripts/init-env.sh`, see section 7 |
| Deploy to the pilot server | [`deployment-runbook.md`](deployment-runbook.md) |
| Backups and restoring | [`backup-and-restore.md`](backup-and-restore.md) |
| Monitoring and alerts | [`observability.md`](observability.md) |
| A breach or lost device | [`incident-response.md`](incident-response.md) |
| Acceptance testing per role | [`uat-script.md`](uat-script.md) |
| What the system does with data | [`records-of-processing.md`](records-of-processing.md) |
| Demo logins and a feature tour | [`../../RUNNING.md`](../../RUNNING.md) |
