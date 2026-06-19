# Phase 7 — SMS Notifications

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 7 — SMS notification module (Module 8)
**Depends on:** Phases 4 & 5
**Status:** Planned

---

## 1. Objective

Implement a **provider-agnostic SMS** capability (Africa's Talking + Termii
adapters) that sends **appointment reminders, missed-visit recalls, and
immunization/ANC due alerts** — driven by the maternal and immunization signals
from Phases 4/5 — with editable **English + Igbo templates**, **consent/opt-out**
enforcement, scheduling/batching, delivery-status capture, and **offline
queueing** (composed offline, dispatched from the hub when online) — so patients
and caregivers are reminded reliably and cheaply.

## 2. Prerequisites / entry criteria

- Phases 4 & 5 done: ANC defaulter/upcoming-contact + immunization due/overdue
  signals exist.
- **Open question Q5** resolved: SMS provider account(s), **sender ID**/DND
  registration, and budget provisioned by the owner.
- SMS data model + provider interface confirmed
  (`../architecture/data-model.md` §3.8; `../architecture/api-design.md` §6).
- Patient **SMS consent** captured since Phase 2.

## 3. Scope

**In scope**

- **Provider abstraction** (`SmsProvider`) + **Africa's Talking** and **Termii**
  adapters; provider selection by env; configurable **failover/retry**.
- **Template library** (admin-editable): `anc_reminder`, `immunization_reminder`,
  `missed_visit_recall`, `general_notice`; **English + Igbo** variants; merge
  fields (`{{name}}`, `{{date}}`, `{{facility}}`); patient `preferred_language`
  selects the variant.
- **Reminder scheduler** (BullMQ): scan upcoming ANC contacts + immunization due
  dates; enqueue at configurable **lead time**; respect **quiet hours**.
- **Triggers**: upcoming due, missed-visit (defaulter), manual + bulk send to a
  filtered patient list.
- **Consent/opt-out**: never send without `sms_consent` + valid phone; honour
  opt-out; phone normalised to E.164.
- **Delivery status**: provider **webhooks** (signature-verified) update
  `sms_message`; send log + audit + cost bucket.
- **Offline queueing**: messages composed offline are queued and dispatched from
  the hub when online — **no duplicates** (idempotent on `sms_message.id`).

**Out of scope**

- Patient-initiated SMS / USSD self-service (deferred, master plan §9).
- Full Igbo **UI** localisation (only SMS templates are bilingual in v1).
- Two-way conversations.

## 4. Task breakdown

1. **Provider interface + adapters** (Africa's Talking, Termii): `send` +
   `parseDeliveryWebhook`; E.164 normalisation; map provider statuses to common
   `SmsStatus`.
2. **Failover/retry**: configurable order; retry transient errors; record final
   status.
3. **Template module**: CRUD templates (admin), language variants, merge-field
   rendering; `preferred_language` selection.
4. **Reminder scheduler** (BullMQ worker): scan Phase 4/5 signals; enqueue at
   lead time; quiet hours; idempotent (no duplicate reminder per due event).
5. **Send paths**: automatic (reminders/recalls), manual, bulk (filtered list);
   all consent-gated.
6. **Webhooks**: signed delivery callbacks → update `sms_message`; metrics.
7. **Offline queue**: outbox-queued sends dispatched from hub on connectivity;
   dedupe by id.
8. **RBAC + audit**: clinical staff trigger for *their* patients; templates +
   bulk are admin; every send logged.
9. **Tests**: unit (rendering, consent gate, language select, failover), API
   (authz, webhook signature), integration (provider sandbox), e2e (offline
   compose → online dispatch, no dupes).

## 5. Deliverables

- Provider-agnostic SMS service + two NG adapters with failover.
- Editable EN/IG templates with merge fields.
- Reminder scheduler over ANC/immunization signals (lead time + quiet hours).
- Consent/opt-out enforcement; delivery-status tracking; send log + audit.
- Offline-queued sends dispatched on reconnect (idempotent).
- Tests green; change-log entry; Q5 recorded.

## 6. Acceptance / exit criteria

- [ ] Reminders generate from ANC/immunization **due dates** and send via the
      configured provider with **delivery status** recorded.
- [ ] A patient **without consent** or **without a valid phone** is **never**
      messaged.
- [ ] Provider can be switched (Africa's Talking ↔ Termii) by **config**, no code
      change; failover retries a transient error.
- [ ] Messages composed offline are **queued and dispatched once online**, with
      **no duplicates**.
- [ ] Template edits (incl. **Igbo** variants) take effect for future sends;
      `preferred_language` selects the variant.
- [ ] Every send is in the **send log** + audit (recipient, template, status,
      provider, cost bucket).
- [ ] **Exit gate:** Journey 6 (defaulter recall) demonstrated end-to-end against
      a provider sandbox.

## 7. Governance & guardrails

- **Consent-gated** sends only; honour opt-out (NDPA + NCC/DND).
- **Minimal data to processor**: phone + message; **no clinical detail** beyond
  what the patient needs (`../architecture/security-and-compliance.md` §7).
- Provider keys in **secret store**; webhooks signature-verified.
- Templates are **config** (admin-editable); bilingual.
- Idempotent reminders/sends (no spam, no duplicates).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Duplicate / spammy messages | Idempotent per due-event + per `sms_message.id`; quiet hours; lead-time dedupe |
| Provider downtime / cost spikes | Provider-agnostic + failover; cost-bucket logging; owner budget controls (Q5) |
| Sending without consent | Hard consent gate + valid-phone check; tested |
| Wrong/absent sender ID, DND blocks | Owner provisions sender ID/DND (Q5); configurable; surface failures |
| Leaking clinical detail in SMS | Templates reviewed; minimal content; security acceptance check |

## 9. Hand-off

Phase 8 (reporting) can include **SMS reminder volume/delivery** and (where
measurable) reminder→attendance signals. Phase 9 (admin) provides the full UI for
**template management** and send-log review.
