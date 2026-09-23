# Deployment decisions: controller, hosting, retention, SMS off

| Field  | Value                          |
|--------|--------------------------------|
| Date   | 2026-09-23                     |
| Time   | 17:18 WAT                      |
| Author | Implementation                 |
| Phase  | 10, Deployment and hardening   |
| Module | n/a, cross-cutting             |

## Summary

Four open decisions were taken by the owner and are now implemented rather than
merely written down. Three of them close open questions that were blocking
go-live.

- **Q9, controller and DPO:** Ogechukwu Eleodimuo, held in the environment.
- **Q6, hosting:** a Nigerian VPS, not on-premises at the LGA.
- **Q7, retention:** set, and reported by the system.
- **SMS:** switched off for this deployment, enforced at the hub.

## Decisions taken

### Controller and DPO live in the environment, not in code

`PHC_DATA_CONTROLLER`, `PHC_DPO_NAME` and `PHC_DPO_CONTACT`, surfaced by
`GET /api/v1/system/compliance`. The post changes more often than the software,
so a change of DPO must not need a release.

The endpoint is deliberately **public**. Under the NDPA accountability principle
a data subject has to be able to find out who holds their record and how to
reach the DPO, and the response carries no patient data.

> **One person currently holds both roles.** Workable for a pilot of one or two
> PHCs, and a recognised weakness: part of a DPO's job is checking the
> controller's decisions, so the two being the same person removes that check.
> Recorded in `docs/operations/records-of-processing.md` with a note to separate
> them before LGA-wide rollout. `PHC_DPO_CONTACT` is still blank and must be a
> monitored address before go-live.

### Hosting: a Nigerian VPS

The PHCs reach the hub over the internet either way, so putting the hardware at
the LGA office buys them no connectivity. What it does buy is grid power,
hardware failure, physical security and patching, landing on an office with no
dedicated IT staff. The system is offline-first, so hub downtime delays sync
rather than stopping care, which weakens the case for local custody further.

Revisit only if the LGA requires physical custody as policy. Requirements are in
`docs/operations/deployment-runbook.md` section 1.

### Retention

| Record | Period | Why |
|--------|--------|-----|
| General clinical | 10 years after last contact | Standard clinical practice |
| Maternity and ANC | 25 years | Obstetric claims have a long tail |
| A child's record | Until 18, or the general period if longer | Only they can act on it once adult |
| Backups | 30 days | Local copies, once shipped off-host |

**These govern archival review, not automatic deletion.** Nothing is removed by
the passage of time; disposal is a reviewed, audited operation a person carries
out. That is required by Global Constraint 3 and it is stated in the endpoint's
own response so nobody assumes the software prunes records on its own.

**They are defensible defaults drawn from common clinical practice, not a
citation of a Nigerian statutory period.** The controller should have them
checked against current Nigerian requirements before go-live, and that caveat is
written into the records of processing rather than left implied.

### SMS is switched off

The running cost of a provider was not justified for the pilot.

The module is **left in place rather than deleted**: the work is done and tested,
and enabling it later should be a configuration change, not a rebuild.
`SMS_ENABLED=false` is enforced by a guard on the two endpoints that dispatch a
message, so a stale client or a direct request cannot send. Hiding buttons alone
would not be switching it off, and here reaching it would mean a real message to
a real patient and a real bill.

Consequences, all deliberate:

- The SMS admin tab and the send-reminder buttons do not render.
- **The SMS consent field is no longer collected at registration.** Consent for a
  processing activity this deployment does not carry out would be data with no
  purpose. It also means existing records will not carry a consent, so enabling
  SMS later requires collecting it going forward, which is correct anyway:
  consent must be informed and current.
- Templates and the send log stay readable. They cost nothing, a past log stays
  auditable, and the templates can be reviewed before SMS is ever switched on.
- Delivery webhooks are **not** behind the guard: a provider may still call back
  about a message sent before the switch, and dropping that would leave the send
  log permanently wrong.

## Deviations from the plan

The plan assumed SMS would run in v1 (Phase 7). It is built and switched off, on
the owner's decision about cost. Recorded here rather than treated as a silent
scope cut.

## Open questions surfaced

- **New:** `PHC_DPO_CONTACT` is unset. A DPO who cannot be reached does not
  satisfy the accountability principle.
- **New:** the controller and DPO are the same person. Separate before LGA-wide
  rollout.
- Q6, Q7 and Q9 are **closed**.

## Files changed

| File                                              | Change type |
|---------------------------------------------------|-------------|
| `apps/api/src/compliance/compliance.controller.ts`| added       |
| `apps/api/src/sms/sms-enabled.guard.ts`           | added       |
| `apps/api/src/sms/sms.controller.ts`              | modified    |
| `apps/api/test/compliance-and-sms-off.test.ts`    | added       |
| `apps/api/test/global-setup.ts`                   | modified    |
| `apps/api/test/sms-integration.test.ts`           | modified    |
| `apps/web/src/lib/deployment.ts`                  | added       |
| `apps/web/src/components/PatientForm.tsx`         | modified    |
| `apps/web/src/components/SendReminderButton.tsx`  | modified    |
| `apps/web/src/pages/Admin.tsx`                    | modified    |
| `infra/.env.example`                              | modified    |
| `infra/docker-compose.prod.yml`                   | modified    |
| `docs/operations/records-of-processing.md`        | modified    |
| `docs/operations/deployment-runbook.md`           | modified    |

## Change details

### `apps/api/src/sms/sms-enabled.guard.ts`

```diff
+  canActivate(_context: ExecutionContext): boolean {
+    if (this.config.get("SMS_ENABLED") === "true") return true;
+    throw new ApiError(
+      503 as never,
+      "SMS_DISABLED",
+      "SMS is switched off for this deployment. Set SMS_ENABLED=true to enable it.",
+    );
+  }
```

### `apps/web/src/components/PatientForm.tsx`

```diff
-  sms_consent: true,
+  // Defaults to false: consent is something a patient gives, not something a
+  // form assumes, and this deployment does not send SMS at all.
+  sms_consent: false,
@@
-        <div className="flex items-end">
-          <label ...>Consent to SMS reminders</label>
-        </div>
+        {smsEnabled() && (
+          <div className="flex items-end">
+            <label ...>Consent to SMS reminders</label>
+          </div>
+        )}
```

### `apps/api/test/global-setup.ts`

The SMS dispatch suites now skip when the switch is off, the same way the
live-hub suites skip when no hub answers. Verified in both directions: 12 skipped
with `SMS_ENABLED=false`, **12 passed with `SMS_ENABLED=true`**, so the switch is
the only reason they skip.

## Verification

| Check | Result |
|-------|--------|
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | clean |
| shared / web / api suites | 81 / 25 / 130 passed, 12 skipped |
| Three consecutive full API runs | 130 passed each time |
| SMS suite with `SMS_ENABLED=true` | 12 passed |
| `apps/api/test/e2e-sync.sh` | 18 passed |
| Playwright offline | 7 passed |
| `infra/scripts/secret-scan.sh` | clean |

Verified through the browser: the SMS admin tab is absent, and the SMS consent
field no longer appears on the registration form. Verified against the hub: a
send returns `503 SMS_DISABLED` for every role, and `GET /system/compliance`
returns the controller, DPO and retention without a login.
