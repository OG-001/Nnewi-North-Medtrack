# Hosting-location claim removed from the public endpoint

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-16                     |
| Time      | 16:30 WAT                      |
| Author    | OG-001                         |
| Phase     | 10                             |
| Module    | n/a (compliance surface)       |

## Summary

`GET /api/v1/system/compliance` is public and asserted
`"Self-hosted in Nigeria. Patient data and its backups do not leave the country."`
The owner reversed the hosting decision on 2026-10-16, which turned that into a false
public statement about sensitive personal data. The field has been removed rather than
corrected.

## Decisions taken

**Removed, not restated.** The owner's instruction was that infrastructure placement is not
something users should have to think about. There is also an engineering argument for
removing it regardless of which country is chosen: hosting location changes with no code
change, so any claim encoded in a response goes stale silently. A stale residency claim
about health data is worse than no claim, because it invites reliance.

**The record still exists, in a place a person maintains.** Where processing happens
belongs in `docs/operations/records-of-processing.md`, the DPO's artifact. Where a data
subject has to be told about cross-border transfer, that belongs in the privacy notice the
controller issues. Neither drifts out of date without someone noticing.

**The test now asserts absence.** It previously asserted `residency.country === "Nigeria"`.
Deleting that test would have left nothing to stop the field reappearing, so it was
inverted: it fails if a `residency` key returns, and also if the misleading phrases are
smuggled into another field's prose. The phrase list deliberately excludes a bare
"Nigeria", because `legal_basis` legitimately names the Nigeria Data Protection Act.

**The binding rules were updated, because the code fix alone would not hold.**
`.claude/rules/ndpa-compliance.md` listed data residency as an obligation reading
"Self-hosted in Nigeria. Data does not leave the country", and `CLAUDE.md` stated it in the
project summary. An agent reading either would have reinstated the claim in good faith.
Both now say that hosting location is a controller decision and must never be asserted in
code, an API response, or the UI.

The rule also records what did not change: the Act still governs the transfer itself, and
moving personal data out of Nigeria needs a lawful basis under its cross-border provisions
rather than happening by default. That is explicitly flagged as the controller's and DPO's
call to make and record, not something for an agent to decide.

## Deviations from the plan

The request named the compliance endpoint. The client-side type and offline fallback in
`apps/web/src/lib/deployment.ts` carried the same claim, so they were included: leaving
them would have kept the string shipping inside the PWA bundle. The governance files were
included for the reason given above.

## Open questions surfaced

**Ten files still assert the Nigeria-only claim and were not touched.** Four are
documentation that should be reworded: `docs/operations/deployment-runbook.md`,
`docs/operations/backup-and-restore.md`, `docs/architecture/security-and-compliance.md`,
and `docs/architecture/tech-stack-recommendation.md`. One is a comment in
`infra/docker-compose.prod.yml`. One, `docs/capstone-progress-report-2026-08-22.md`, is a
dated historical report and should be left as a record of what was true then.

Three are agent definitions, `.claude/agents/deployment.md`,
`.claude/agents/research-advisor.md`, and `.claude/agent-memory/_proposals/README.md`.
Per `.claude/rules/lessons-learned.md` section 5, editing an agent definition is a manual,
owner-approved action and a guardrail must never be weakened silently, so these were
deliberately left for the owner to review.

**`PHC_DPO_CONTACT` is still unset**, so the endpoint answers "Not yet designated" for the
one field a data subject needs in order to exercise any right at all. This is now the most
material gap on that endpoint.

## Files changed

| File                                              | Change type |
|---------------------------------------------------|-------------|
| `apps/api/src/compliance/compliance.controller.ts`| modified    |
| `apps/api/test/compliance-and-sms-off.test.ts`    | modified    |
| `apps/web/src/lib/deployment.ts`                  | modified    |
| `.claude/rules/ndpa-compliance.md`                | modified    |
| `CLAUDE.md`                                       | modified    |

## Change details

### `apps/api/src/compliance/compliance.controller.ts`

```diff
@@ -30,10 +42,6 @@ export class ComplianceController {
-      residency: {
-        country: "Nigeria",
-        note: "Self-hosted in Nigeria. Patient data and its backups do not leave the country.",
-      },
```

A header comment records why the field is absent and instructs against reintroducing it.

### `apps/api/test/compliance-and-sms-off.test.ts`

```diff
-  it("reports data residency as Nigeria", async () => {
-    expect(body.residency.country).toBe("Nigeria");
+  it("publishes no hosting-location claim", async () => {
+    expect(body).not.toHaveProperty("residency");
+    for (const phrase of ["do not leave", "does not leave", "Self-hosted", "residency"]) {
+      expect(text).not.toContain(phrase);
+    }
```

The response-shape assertion dropped `residency` from its expected key list.

### `apps/web/src/lib/deployment.ts`

```diff
-  residency: { country: string; note: string };
...
-  residency: { country: "Nigeria", note: "Self-hosted in Nigeria." },
```

### `.claude/rules/ndpa-compliance.md`

```diff
-| Data residency        | Self-hosted in Nigeria. Data does not leave the country.  |
+| Data residency        | A controller decision, not a code invariant. See below.    |
```

Plus a new subsection, "Data residency is not a code invariant".

### `CLAUDE.md`

```diff
-| Hosting             | Dockerized and self-hosted; patient data stays in Nigeria    |
+| Hosting             | Dockerized; location is a deployment decision, never in code |
```

Plus a note that the 2026-09-23 hosting decision is superseded.

## Verification

`pnpm lint` and `pnpm typecheck` clean. The compliance and SMS suite passes 9 of 9 against
a live hub, including the inverted assertion.

The hub was rebuilt and restarted, and the live public response was read back directly. It
now returns `controller`, `dpo`, `retention`, `features` and `legal_basis`, with no
`residency` key and no hosting prose.
