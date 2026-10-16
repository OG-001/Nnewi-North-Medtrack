# Accounts, links and costs to put PHC-Track into production

**Audience:** the person creating the accounts and paying for them.

**Status of the prices below.** Every figure was checked on 2026-10-16 against the sources
linked in each section. Providers change prices without notice, and several of the domain
figures found were promotional. **Confirm the price on the provider's own page before you
pay.** Where a number could not be verified it says so rather than guessing.

**Currency.** Provider prices are in US dollars unless marked. Nigerian registrar prices
are in naira. No conversion is applied, because the rate moves.

---

## 1. What you are buying, in one table

| # | Account            | Purpose                        | Cost to start |
|---|--------------------|--------------------------------|---------------|
| 1 | GitHub             | Source code                    | Free, you have it |
| 2 | Neon               | PostgreSQL database            | Free tier     |
| 3 | Cloudflare         | Hub and the app itself         | 5 USD / month |
| 4 | Domain registrar   | The address people type        | ~10 USD / year |
| 5 | Mailbox            | The DPO contact address        | Free option exists |
| 6 | Backup host        | Independent encrypted backups  | ~4 USD / month |

Nothing here needs a Nigerian provider. That was a requirement until the hosting decision
was reversed on 2026-10-16.

---

## 2. Database: Neon

**Sign up:** https://neon.com

**Pricing page to confirm against:** https://neon.com/pricing

### What to create

One project. When it asks for a region, choose **Europe (Frankfurt)**, which Neon shows as
`aws-eu-central-1`.

> **This cannot be undone.** Neon's documentation states a project's region cannot be
> changed after it is selected. Moving later means creating a second project and migrating
> the data. Frankfurt is chosen because it is the closest Neon region to Nigeria and the
> submarine cables out of Lagos run to Europe.

### What to copy

Neon gives you two connection strings. You need both, and they are different.

| Copy this        | Used for                        | Goes where |
|------------------|---------------------------------|------------|
| Pooled string    | The running hub                 | `DATABASE_URL` |
| Direct string    | Migrations and backups          | `DIRECT_DATABASE_URL` |

The pooled one usually has `-pooler` in the hostname. Migrations need the direct one
because they take session-level locks that a pooled connection will not carry.

> **Both strings contain your database password.** Do not paste them into a chat, an issue,
> or a commit. Put them straight into the terminal command or the Cloudflare secret store.

### Cost

**Free tier: 0 USD.** It does not expire on a date. It ends when you exceed a limit.

| Free tier limit    | Value                |
|--------------------|----------------------|
| Compute            | 100 CU-hours / project / month |
| Storage            | 0.5 GB / project     |
| Branches           | 10 / project         |
| Idle behaviour     | Suspends after 5 minutes |

The compute allowance is generous for a pilot. At the smallest compute size, 100 CU-hours
covers roughly 400 hours of database activity in a month, which is more than a clinic
schedule needs.

**Storage is what will run out first.** 0.5 GB is small for accumulating patient records,
the change ledger and the audit trail. Expect to outgrow it, and treat the free tier as
enough to prove the deployment works rather than enough to run the pilot indefinitely.

**Launch plan, when you outgrow free: no monthly base fee, usage only.**

| Launch rate            | Price            |
|------------------------|------------------|
| Compute                | 0.106 USD / CU-hour |
| Storage                | 0.35 USD / GB-month |
| Point-in-time restore  | 0.20 USD / GB-month |
| Extra branch           | 1.50 USD / branch-month |
| Transfer included      | 500 GB           |

**Worked estimate, stated assumptions.** Assuming the smallest compute size active 200
hours a month and 2 GB of data, Launch comes to roughly **6 USD a month**. Change either
assumption and that moves.

Turn on point-in-time restore. It is billed separately and is easy to miss, and it is the
layer that recovers you from a bad migration. It is cheap at this data size.

**Verify before relying on it:** the compute rates came from Neon's own pricing page. The
storage rate and the Launch allowances came from third-party write-ups dated around
September 2026, so check them on Neon's page.

---

## 3. Hub and app: Cloudflare

**Sign up:** https://dash.cloudflare.com/sign-up

**Pricing to confirm against:** https://developers.cloudflare.com/containers/pricing/

### What to create

Two things in one account.

1. **A Workers Paid subscription.** Containers are not available on the free plan.
2. **A Pages project** for the app itself, which is a static build and serves from the free
   tier.

### What to copy

Nothing to copy from Cloudflare. You push secrets **into** it instead, once:

```bash
cd infra/cloudflare
npx wrangler secret put DATABASE_URL     # the POOLED Neon string
npx wrangler secret put JWT_SECRET       # generate: openssl rand -base64 48
```

Do not give Cloudflare `DIRECT_DATABASE_URL`. The hub never runs migrations, so withholding
it means a compromised hub cannot alter your schema.

### Cost

**Workers Paid: 5 USD a month.** This is a fixed floor and is required. It includes an
allowance for container usage.

| Included each month | Value            |
|---------------------|------------------|
| Memory              | 25 GiB-hours     |
| CPU                 | 375 vCPU-minutes |
| Disk                | 200 GB-hours     |
| Egress, NA and EU   | 1 TB             |

| Overage rate        | Price                   |
|---------------------|-------------------------|
| Memory              | 0.0000025 USD / GiB-second |
| CPU                 | 0.000020 USD / vCPU-second |
| Disk                | 0.00000007 USD / GB-second |
| Egress              | 0.025 USD / GB          |

**Worked estimate, stated assumptions.** Assuming 1 GiB of memory and 200 running hours a
month, with the hub idle most of that time, container usage adds roughly **2 USD** on top of
the 5 USD subscription, so about **7 USD a month**.

CPU is billed only while actively working, which suits a sync hub that idles between
pushes. Memory is billed for the whole time the instance is up, which is why
`sleepAfter` is set to 15 minutes in `infra/cloudflare/wrangler.jsonc`: long enough to stay
warm across a clinic session, short enough to sleep overnight.

**Cloudflare Pages is free** for a static site at this scale. The free tier limits builds
per month rather than visitors. Not independently verified here; check the Pages pricing
page.

**TLS certificates cost nothing.** Cloudflare issues and renews them automatically. This is
the reason the deployment needs no certificate purchase.

---

## 4. Domain name

### Which to buy

You do not need a `.ng` domain. It costs more and is harder to register. A `.org` or `.com`
works identically and the residency reasoning that argued for `.ng` no longer applies.

If you want `.ng` for institutional credibility with the LGA, that is a reasonable
non-technical reason to pay more.

### Where

| Registrar                | Link                          | Notes |
|--------------------------|-------------------------------|-------|
| Cloudflare Registrar     | https://dash.cloudflare.com   | Sells at cost, no markup, no upsells. Check whether it carries your chosen extension |
| Namecheap                | https://www.namecheap.com     | International, widely used |
| Whogohost                | https://whogohost.com         | Nigerian, for `.ng` and `.com.ng` |
| MokoHost                 | https://mokohost.com          | Nigerian, for `.ng` and `.com.ng` |

Cloudflare Registrar is worth checking first because it does not mark up renewals, which is
where registrars usually make their money. Confirm it supports the extension you want, as
its list is limited.

### Cost

| Extension   | Price found           | Source |
|-------------|-----------------------|--------|
| `.ng`       | ~9.81 to 10.64 USD / year | International registrars |
| `.ng`       | ₦13,250 / year        | MokoHost standard rate |
| `.com.ng`   | ₦6,250 / year         | MokoHost standard rate |
| `.com`      | ~10 to 12 USD / year  | Typical, not verified here |

**Treat these as indicative.** The figures found conflicted. One international listing
showed a renewal of 56.99 EUR a year, far above the others, and a Nigerian promotion of
₦9,200 for `.ng` had already expired. **Check the renewal price, not just the first year.**
That is where the cost actually sits.

### What to copy

Nothing. You point the domain's nameservers at Cloudflare, which the dashboard walks you
through. DNS and certificates are then handled for you.

---

## 5. Mailbox for the Data Protection Officer

This is not optional and it is currently the most material gap. Your compliance endpoint
answers "Not yet designated" for the DPO contact, which means a patient has no way to
exercise any right under the Act.

### What to create

A **role address on your own domain**, for example `dpo@yourdomain`. Not a personal Gmail.
A role address survives a change of officer; a personal mailbox does not, and publishing a
personal address attaches an individual's identity to every data request.

### Options

| Option            | Link                              | Cost |
|-------------------|-----------------------------------|------|
| Zoho Mail         | https://www.zoho.com/mail/        | Free tier for a small number of users on your own domain |
| Cloudflare Email Routing | https://dash.cloudflare.com | Free. Forwards `dpo@yourdomain` to any inbox. Receive only |
| Google Workspace  | https://workspace.google.com      | Paid per user per month |

**Cloudflare Email Routing is the cheapest path that works.** It forwards to a mailbox you
already have, costs nothing, and takes minutes once the domain is on Cloudflare. Its
limitation is that you cannot send *from* the address, only receive. For a DPO contact that
is usually acceptable, but confirm your DPO is content to reply from another address.

### What to copy

The finished address. It goes into `PHC_DPO_CONTACT`.

---

## 6. Backup host

**Why this is a separate line item.** Neon's own recovery data lives in your Neon account.
One compromised credential or one lapsed subscription loses the database and its backups
together. `docs/operations/backup-and-restore.md` section 3 requires an off-host copy, and
an in-account snapshot is not one.

The Cloudflare container cannot do this. Its disk is temporary working space that Cloudflare
discards on restart, so a dump written there vanishes while the logs report success.

### What to create

A small always-on virtual machine that runs `infra/scripts/backup.sh` against the **direct**
Neon endpoint, plus somewhere to put the encrypted files.

| Option              | Link                        | Cost |
|---------------------|-----------------------------|------|
| Hetzner Cloud       | https://www.hetzner.com/cloud | Smallest instances are a few EUR / month |
| Cloudflare R2       | https://dash.cloudflare.com | Free tier, then usage-based. No egress fee |

The smallest instance available is enough. It runs a scheduled `pg_dump` and nothing else.
Put it in Europe so it is near the database.

### What to copy

Onto that machine only:

| Value                  | Why |
|------------------------|-----|
| `DIRECT_DATABASE_URL`  | `pg_dump` needs a session-level connection |
| `BACKUP_PASSPHRASE`    | Generate once: `openssl rand -base64 48` |

> **Never rotate `BACKUP_PASSPHRASE` casually.** Every existing archive becomes unreadable.
> Store it somewhere you will still have it after losing this machine, because without it
> the backups are random bytes.

### Cost

Roughly **4 USD a month** for the machine, plus very little for storage at this data size.

---

## 7. Total

| Item                | Pilot, free where possible | Running cost |
|---------------------|----------------------------|--------------|
| Neon                | 0                          | ~6 USD / month |
| Cloudflare          | 5 USD / month              | ~7 USD / month |
| Backup host         | ~4 USD / month             | ~4 USD / month |
| Mailbox             | 0                          | 0 |
| Domain              | ~10 USD / year             | ~10 USD / year |
| **Monthly**         | **~9 USD**                 | **~17 USD** |

Plus the domain annually. These are estimates built on the stated assumptions, not quotes.

The single fixed commitment is Cloudflare's 5 USD a month. Everything else is either free to
begin with or usage-based, so the cost rises with real use rather than up front.

---

## 8. Order to do this in

Each step depends on the one before it.

1. **Neon project in Frankfurt.** The region is permanent, so do this deliberately.
2. **Apply the schema and load the facility registry**, from your own machine:

   ```bash
   cd /home/nnenna/MT/Nnewi-North-Medtrack
   DATABASE_URL="<pooled>" DIRECT_DATABASE_URL="<direct>" pnpm db:deploy
   DATABASE_URL="<pooled>" DIRECT_DATABASE_URL="<direct>" pnpm db:seed
   ```

   The seed must report facilities and say the demo staff accounts were skipped. **If it
   reports users, stop.** It means the guard did not recognise the host, and you now have
   accounts with four-digit PINs published in `RUNNING.md`, including `sysadmin` with PIN
   `0000` holding access to every facility.
3. **Buy the domain** and move its nameservers to Cloudflare.
4. **Create the DPO address** and set `PHC_DPO_CONTACT`.
5. **Subscribe to Workers Paid**, set the two secrets, deploy the hub from
   `infra/cloudflare/`, and confirm `GET /api/v1/system/health` answers.
6. **Deploy the app to Pages** and point it at the hub.
7. **Build the backup host**, then **rehearse a restore**. Until a restore has been
   completed and verified, treat the deployment as having no backup.
8. **Provision real staff accounts** through the admin screens, where each person chooses
   their own PIN.

Steps 7 and 8 are the ones most likely to be skipped under time pressure. Step 7 is what
stands between you and permanent data loss. Step 8 is what stands between the system and
being unusable by anyone.

---

## 9. What you are not buying

| Not needed            | Why |
|-----------------------|-----|
| SMS provider          | SMS is switched off for this deployment |
| TLS certificate       | Cloudflare issues and renews them free |
| Nigerian VPS          | Superseded on 2026-10-16 |
| CDN                   | Included with Cloudflare |
| Managed Kubernetes    | The hub is one container |

---

## 10. Sources

Checked 2026-10-16. Confirm current figures before paying.

- Neon pricing: https://neon.com/pricing
- Neon regions: https://neon.tech/docs/introduction/regions
- Cloudflare Containers pricing: https://developers.cloudflare.com/containers/pricing/
- Cloudflare Containers placement: https://developers.cloudflare.com/containers/platform-details/placement/
- Nigerian domain pricing: https://mokohost.com/blog/cheapest-ng-com-ng-domain-registration-nigeria/
