# Architecture — Security & Compliance

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Status:** Planned
**Reads with:** `../product/user-roles-and-permissions.md`, `offline-sync-design.md`, `api-design.md`
**Compliance baseline:** Nigeria Data Protection Act (**NDPA**) 2023; NPHCDA PHC norms

---

Patient health data is **sensitive personal data**. Security is a Phase-1-onward
concern, not a Phase-10 add-on. This document defines the controls; phases
implement them and Phase 10 hardens and verifies.

> **Disclaimer:** this is an engineering compliance design, not legal advice.
> The deployment's **data controller** and **DPO** (Open question Q9) must
> confirm obligations under NDPA 2023 with the Nigeria Data Protection
> Commission (NDPC) before go-live.

---

## 1. NDPA 2023 — obligations mapped to controls

| NDPA principle / obligation | How the system meets it |
|---|---|
| **Lawful basis & consent** | Care delivery is the basis for clinical records; **explicit SMS consent** flag per patient (no SMS without it). Consent and purpose captured at registration. |
| **Data minimisation** | Collect only fields the workflow needs; cross-facility access exposes a **minimal index**, full record only on audited, reasoned open. |
| **Purpose limitation** | Data used for care + reporting only; no secondary use; reporting uses **aggregates**. |
| **Accuracy** | Structured validation; duplicate detection/merge; correction workflow with audit. |
| **Storage limitation** | Configurable **retention/archival** policy (Open question Q7); soft-delete + archive. |
| **Integrity & confidentiality** | Encryption in transit + at rest; RBAC; audit; least privilege; device auto-lock. |
| **Accountability** | Full **audit log**; named data controller + **DPO**; records of processing; this document. |
| **Data residency** | Self-hosted **in Nigeria** (NG-region VPS or on-prem LGA server); data does not leave the country by default. |
| **Data-subject rights** | Access/rectification supported via record view + correction; erasure handled per retention policy and clinical-record legal-hold rules (DPO-confirmed). |
| **Breach handling** | Logging + monitoring to detect; documented breach-response runbook (Phase 10) including NDPC notification timelines. |
| **Third parties (processors)** | SMS providers are processors — minimise data sent (phone + message only); DPA with provider; no clinical content in SMS beyond what the patient needs. |

---

## 2. Authentication

- **Per-user accounts only**; no shared logins (attribution for audit).
- **Password** hashing with argon2id (or bcrypt) + per-user salt; strength policy
  enforced; **PIN** (also hashed) allowed only as a *fast re-auth* after a full
  login on an enrolled device.
- **JWT** access tokens short-lived; **refresh tokens** rotated and revocable.
- **Offline auth**: enrolled devices cache a securely-stored, **revocable** token
  envelope so a known user can log in offline. Revocation (deactivation) is
  enforced at next sync — a disabled user cannot sync and loses offline access at
  the next online check. (Trade-off documented: a deactivated user retains
  offline access only until the device next reaches the hub; mitigate with short
  offline-token TTL.)
- **Auto-lock** after inactivity; re-auth (PIN) to resume. Critical on shared
  clinic tablets.
- Optional **device enrolment** so only approved devices can sync (recommended;
  reduces local-data exposure surface).

---

## 3. Authorization (RBAC + data-scope)

- Enforced **server-side** on every route (authoritative) and mirrored in the UI.
- Two-factor check: **role grants action** AND **target in data-scope**
  (`../product/user-roles-and-permissions.md`).
- **Cross-facility access** is explicit, reason-prompted, and logged as
  `sensitive_access`.
- **Separation of duties**: system admin has no default clinical-data edit;
  any clinical access by a system admin is **break-glass** and heavily audited.
- Configurable per-facility permissions (prescribe/diagnose/schedule-edit)
  cannot exceed the role matrix.

---

## 4. Encryption

- **In transit**: TLS everywhere (reverse proxy with automatic certificates);
  HSTS; no plaintext endpoints. SMS provider calls over HTTPS; webhooks signed.
- **At rest (hub)**: database volume encryption (disk/volume level) + encrypted
  off-host backups. Secrets (DB creds, provider keys, JWT secret) via env/secret
  store — **never in the repo**.
- **At rest (device/local store)**: IndexedDB is not encrypted by the browser.
  Mitigations, in order of preference: (a) **device-level encryption** on the
  Android device (operational policy — modern Android encrypts by default);
  (b) auto-lock + scoped/minimal local data + purge-on-logout to limit exposure;
  (c) optional application-layer encryption of the most sensitive local fields
  with a key derived from user auth — **noting** the key-management limits in a
  browser and the performance cost on low-end devices. v1 baseline: (a)+(b),
  with (c) evaluated in Phase 10. Document the residual risk for the DPO.

---

## 5. Audit logging

- **Append-only** `audit_event` table (`data-model.md` §3.10): actor, action,
  entity, facility, timestamp, device, details.
- Logged events: create/update/delete, login/logout/failed-login,
  permission/role change, cross-facility `sensitive_access`, patient merge,
  report lock, config change, conflict resolution, break-glass access.
- Audit log is **read-only** to viewers (facility admin: own facility; LGA: LGA;
  system admin: all) and tamper-evident (append-only; consider hash-chaining in
  Phase 10).

---

## 6. Input validation & app security

- All input validated server-side (DTO/Zod) **and** client-side; reject malformed
  before persistence (offline too).
- Standard web hardening: output encoding (XSS), parameterised queries (the ORM;
  no string-built SQL), CSRF not applicable to token-auth APIs but enforce
  same-site/secure cookies if any are used, security headers (CSP, X-Frame,
  Referrer-Policy) on the PWA.
- Rate limiting on auth + SMS + webhook endpoints.
- Dependency hygiene: small surface, pinned versions, automated vuln scanning in
  CI (Phase 0/10).

---

## 7. SMS / third-party processor controls

- SMS providers (Africa's Talking, Termii) are **data processors**: send only
  the phone number + the message; **no clinical detail** beyond what the patient
  must know (e.g., "Your child's immunization is due on <date> at <facility>").
- Provider API keys in secret store; webhooks **signature-verified**.
- Honour **opt-out**; suppress sends without consent + valid phone.
- A DPA (data processing agreement) with each provider is an operational/legal
  task for the controller (Phase 10 checklist).

---

## 8. Logging & PII hygiene

- Structured logs carry `traceId`, not raw PII where avoidable.
- Never log tokens, password/PIN, or full message bodies alongside patient
  identifiers.
- Log retention bounded; logs treated as potentially containing PII and access-
  controlled.

---

## 9. Backups & recovery

- Scheduled **encrypted** `pg_dump` backups shipped **off-host but in-country**;
  retention + restore tested (Phase 10).
- Documented **restore runbook** and **breach-response runbook** (incl. NDPC
  notification timeline).
- Local device data is recoverable from the hub on re-enrolment (the hub is the
  durable copy once synced); un-synced local-only data is the at-risk window —
  encourage frequent sync; surface "unsynced for N hours" warnings.

---

## 10. Security acceptance (verified in Phase 10)

- [ ] All routes enforce auth + RBAC + data-scope server-side; tested for
      bypass and out-of-scope access.
- [ ] TLS enforced; secrets absent from the repo and images; secret scanning in
      CI passes.
- [ ] Audit log captures the full event set and is read-only/tamper-evident.
- [ ] SMS sends only with consent; providers receive minimal data; webhooks
      verified.
- [ ] Backups encrypted, in-country, and a restore has been rehearsed.
- [ ] Device auto-lock, purge-on-logout, and offline-token revocation behave as
      specified.
- [ ] Data-controller + DPO designated; records of processing + breach runbook
      exist; NDPA posture reviewed (Open question Q9).
- [ ] A security review (e.g., `/security-review` on the diff) and dependency
      scan completed with findings triaged.
