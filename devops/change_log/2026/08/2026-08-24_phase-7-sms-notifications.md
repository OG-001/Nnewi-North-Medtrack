# Phase 7: SMS notifications

| Field  | Value                          |
|--------|--------------------------------|
| Date   | 2026-08-24                     |
| Time   | 14:55 WAT                      |
| Author | Implementation                 |
| Phase  | 7, SMS notifications           |
| Module | 8, SMS Notification            |

## Summary

Module 8 was the last entirely unbuilt module. It now exists on both sides: a
provider-agnostic dispatch service on the hub, and a template library plus recall
actions in the PWA.

The design point that shaped everything else is that **consent is enforced in
one place**. `checkSmsGate` in `packages/shared/src/sms.ts` is the only function
that decides whether a patient may be messaged, and every send path (automatic
reminder, manual recall, bulk) calls it before any provider is contacted. A
patient with no recorded consent, no usable phone number, or a record that is not
active is never messaged. Sending without a consent check is a CRITICAL finding
under `.claude/rules/ndpa-compliance.md`, so it is worth stating that the check
cannot be bypassed by adding a new send path: there is nowhere else to send from.

What shipped:

- **Provider abstraction** with Africa's Talking and Termii adapters. Switching
  provider is a change to `SMS_PROVIDER`, never a code change. Failover tries the
  next configured provider only on a transient error; a permanent rejection is
  not retried elsewhere.
- **Template library**, English and Igbo, admin-editable, with merge-field
  rendering and validation at edit time. Templates are configuration, not code
  (Global Constraint 9).
- **Reminder scheduler** scanning synced ANC contacts and immunization doses,
  with a configurable lead time, quiet hours, and idempotence per due event.
- **Delivery webhooks**, signature-verified per provider, updating the send log.
- **Send log** recording every attempt, including one blocked by the gate, with
  the reason and a segment count for cost.
- **PWA**: an SMS tab in the admin dashboard (templates, live preview, send log,
  statistics) and a "Send reminder" action on the ANC defaulter and immunization
  recall lists, where a CHEW is already working.

## Decisions taken

1. **The consent gate lives in `packages/shared`, not in the hub.** The PWA
   previews messages and the hub sends them. Two implementations would eventually
   disagree, and the failure mode is a patient receiving a message a nurse never
   saw. One function, imported by both.

2. **Message content is deliberately minimal.** A template carries the visit
   date and the facility, never a diagnosis or clinical detail. The providers are
   data processors under the Nigeria Data Protection Act, so the ceiling is what
   the patient needs in order to attend.

3. **Webhooks fail closed.** With no webhook secret configured, an adapter
   rejects every delivery callback rather than accepting unverified payloads.
   These endpoints are public, and an open one would let anyone rewrite the send
   log.

4. **SMS is an online-only feature, and that does not weaken Global Constraint 5.**
   Dispatch needs provider credentials, which belong at the hub and not on a
   clinic tablet. Sending a reminder is not a clinic workflow that care waits on.
   The UI states plainly when the hub is unreachable rather than showing an empty
   state that reads as "no messages".

5. **Idempotence is by caller-supplied message id.** A send composed on a device
   carries its own identifier, so a retry after a dropped response does not
   message the patient twice. The reminder scheduler derives a key from the
   entity and its due date, and that column is unique, so a scan can run as often
   as it likes without sending twice for one due event.

## Deviations from the plan

1. **The reminder scheduler runs on an interval, not BullMQ.** The locked stack
   names Redis and BullMQ for jobs (`CLAUDE.md` section 2). A queue earns its
   place when dispatch is distributed across workers; the hub is one process
   today, and the scan is a periodic read plus idempotent inserts. `scan()` is a
   plain method, so introducing BullMQ later means calling it from a worker rather
   than restructuring it. Recorded here rather than drifted silently.

2. **No provider sandbox run.** The Phase 7 exit gate asks for Journey 6
   demonstrated end to end against a provider sandbox. No sandbox credentials
   exist in this environment, so every decision up to the provider call is tested
   and the provider call itself is not. **Phase 7 is therefore not signed off.**

3. **Offline-composed sends are not queued on the device.** Task 7 asks for a
   send composed offline to be dispatched from the hub on reconnect. The
   idempotency mechanism that makes it safe is built and tested, but the PWA does
   not yet queue a send while offline: it says SMS needs a connection. The
   remaining work is a local queue drained on reconnect.

## Open questions surfaced

- **Q5** (SMS provider choice) remains open by design. Both adapters are built so
  the decision can be made on price and delivery rates during the pilot rather
  than being locked in by code.
- **New:** the Igbo template wording is a first draft by a non-native speaker and
  must be reviewed by an Igbo speaker before any real patient receives it.
- **New:** quiet hours are currently server-local time. If the hub is ever hosted
  outside WAT, this needs an explicit facility timezone.

## Files changed

| File                                              | Change type |
|---------------------------------------------------|-------------|
| `packages/shared/src/sms.ts`                      | added       |
| `packages/shared/src/index.ts`                    | modified    |
| `packages/shared/test/sms.test.ts`                | added       |
| `apps/api/prisma/schema.prisma`                   | modified    |
| `apps/api/src/sms/sms.service.ts`                 | added       |
| `apps/api/src/sms/sms.controller.ts`              | added       |
| `apps/api/src/sms/reminder.scheduler.ts`          | added       |
| `apps/api/src/sms/providers/*.ts`                 | added       |
| `apps/api/test/sms-providers.test.ts`             | added       |
| `apps/api/test/sms-integration.test.ts`           | added       |
| `apps/web/src/lib/sms-api.ts`                     | added       |
| `apps/web/src/components/SmsAdmin.tsx`            | added       |
| `apps/web/src/components/SendReminderButton.tsx`  | added       |
| `apps/web/src/pages/Admin.tsx`                    | modified    |
| `apps/web/src/pages/Maternal.tsx`                 | modified    |
| `apps/web/src/pages/Immunization.tsx`             | modified    |

## Change details

### `packages/shared/src/sms.ts`

The consent gate, which is the file's reason for existing.

```ts
export function checkSmsGate(recipient: SmsRecipient): SmsGateResult {
  if (!recipient.sms_consent) return { allowed: false, reason: "no_consent" };
  if (recipient.status && recipient.status !== "active") {
    return { allowed: false, reason: "patient_inactive" };
  }
  const to = normalizeToE164(recipient.phone_primary);
  if (!to) return { allowed: false, reason: "no_valid_phone" };
  return { allowed: true, to, language: recipient.preferred_language ?? "en" };
}
```

### `apps/web/src/pages/Immunization.tsx`

The recall row was a single `<button>`, so adding the reminder action inside it
would have nested a button in a button. The row became a container with two
separate controls.

```diff
@@ -92,14 +92,26 @@
-                <button
-                  key={d.id}
-                  onClick={() => setSelectedId(d.patient_id)}
-                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
-                >
+                <div
+                  key={d.id}
+                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm"
+                >
+                  <button onClick={() => setSelectedId(d.patient_id)}>
+                  <SendReminderButton patient={p} templateKey="immunization_reminder" />
```

### `apps/web/src/pages/Admin.tsx`

Adds the SMS tab, and corrects a note in the health tab that still described the
sync hub as unbuilt.

```diff
@@ -28,6 +29,7 @@
+  { key: "sms", label: "SMS", perm: "sms.send" },
@@ -68,6 +69,7 @@
+      {tab === "sms" && <SmsAdmin />}
```

## Verification

| Suite                              | Result     |
|------------------------------------|------------|
| `pnpm typecheck`, `pnpm lint`      | clean      |
| `packages/shared` SMS domain       | 27 passed  |
| `apps/api` (incl. 24 new SMS tests)| 51 passed  |
| `apps/web` durability and contract | 11 passed  |

The integration tests run against a live hub with **no provider configured**, so
a permitted send settles as `queued` rather than `sent`. That is the honest
observable outcome here, and it still exercises consent, scope, language
selection, rendering, idempotence and the log entry. What it does not exercise is
the provider call, which is deviation 2 above.
