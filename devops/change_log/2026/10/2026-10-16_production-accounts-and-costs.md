# Production accounts and costs document

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-16                     |
| Time      | 21:30 WAT                      |
| Author    | OG-001                         |
| Phase     | 10                             |
| Module    | n/a (documentation)            |

## Summary

New document, `docs/operations/production-accounts-and-costs.md`, answering what the owner
has to buy or create to run PHC-Track in production. Six accounts, each with the signup
link, what to create, what to copy out of it, where that value goes, and what it costs on
both a free tier and a paid plan.

The existing `docs/operations/deployment-runbook.md` assumes the infrastructure already
exists and describes deploying onto it. Nothing covered the step before that, which is
procurement. This fills that gap and does not duplicate the runbook.

## Decisions taken

**Every price carries its source and a verification instruction.** Prices move, several of
the domain figures found were promotional and one had already expired, and a stale figure in
a budgeting document causes a real problem. The document states the date checked and tells
the reader to confirm before paying, and where a figure could not be verified it says so
rather than filling the gap.

**Worked estimates state their assumptions.** Container and database costs depend on
instance size and active hours, neither of which has been measured. Each estimate names the
assumption it rests on so the reader can redo the arithmetic rather than trusting a total.

**Recommends against a `.ng` domain.** It costs more and the residency reasoning that
argued for it was reversed on 2026-10-16. The document notes that institutional credibility
with the LGA is a legitimate non-technical reason to pay the difference, so the owner can
decide rather than being told.

**Recommends Cloudflare Email Routing for the DPO address.** It is free, it works once the
domain is on Cloudflare, and it solves the most material compliance gap, which is that the
compliance endpoint currently answers "Not yet designated". Its receive-only limitation is
stated, because a DPO who cannot reply from the address needs to agree to that.

**Insists on a role address, not a personal mailbox.** A role address survives a change of
officer, and publishing a personal address attaches an individual's identity to every data
request. This is the same mistake that put a personal Gmail into
`infra/.env.example` on 2026-09-23.

**The backup host is listed as a line item with its own justification.** The obvious
reading is that a managed database makes backups someone else's problem. The document states
why that is wrong: the provider's recovery data shares the account with the database, so one
lost credential loses both, and the runbook requires an off-host copy.

**Step 2 of the ordered sequence carries a stop condition.** The seed command is quoted
together with the instruction to stop if it reports users, because that means the guard
added in `d2a5595` did not recognise the host and demo accounts with published PINs now
exist on production.

**Named the two steps most likely to be skipped.** Rehearsing the restore and provisioning
real staff both come last, both are easy to defer, and the document says what each one
stands between the owner and.

## Deviations from the plan

None.

## Open questions surfaced

- **Cloudflare Registrar's supported extensions were not confirmed.** The document tells the
  reader to check whether it carries their chosen extension rather than asserting it does.
- **Cloudflare Pages free-tier limits were not independently verified.** Marked as such.
- **Neon's storage rate and Launch allowances came from third-party write-ups**, not Neon's
  own page, which only yielded the plan structure and compute rates. Flagged in place.
- **Instance sizing is still unmeasured**, so the Cloudflare estimate rests on an assumed
  1 GiB of memory.

## Files changed

| File                                                  | Change type |
|-------------------------------------------------------|-------------|
| `docs/operations/production-accounts-and-costs.md`    | added       |
| `docs/README.md`                                      | modified    |

## Change details

### `docs/operations/production-accounts-and-costs.md`

New, ten sections: a summary table of the six accounts, one section each for Neon,
Cloudflare, the domain, the DPO mailbox and the backup host, a cost total, the ordered
sequence to follow, a list of what is deliberately not being bought, and the sources with
the date checked.

### `docs/README.md`

Indexed in both the task table and the operations table.

```diff
 | Deploy it to the pilot server | [`operations/deployment-runbook.md`](operations/deployment-runbook.md) |
+| Know what to buy, and what it costs | [`operations/production-accounts-and-costs.md`](operations/production-accounts-and-costs.md) |
```

## Verification

Every relative link in the new document resolves. Every repository path it cites exists:
`infra/scripts/backup.sh`, `infra/cloudflare/wrangler.jsonc`,
`docs/operations/backup-and-restore.md` and `RUNNING.md`. Both commands it instructs the
reader to run, `pnpm db:deploy` and `pnpm db:seed`, exist in the root `package.json`.

Testing: skipped, documentation with no behavioural change.
