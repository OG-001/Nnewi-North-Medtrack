# Records of processing

**Status:** populated for the pilot. The controller and DPO are configuration,
not code: they are set in `infra/.env` and served by
`GET /api/v1/system/compliance`, so a change of post is a config change.

**Purpose:** the NDPA 2023 accountability principle requires a controller to
maintain a record of its processing activities. This is that record for
PHC-Track, prepared from what the system actually does.

---

## 1. Controller and DPO

| Field | Value |
|-------|-------|
| Data controller | Ogechukwu Eleodimuo (`PHC_DATA_CONTROLLER`) |
| Data Protection Officer | Ogechukwu Eleodimuo (`PHC_DPO_NAME`) |
| Contact address | `[TO BE COMPLETED]` (`PHC_DPO_CONTACT`) |

> **One person currently holds both roles.** That is workable for a pilot of one
> or two PHCs and it is a recognised weakness: the DPO's job includes checking
> the controller's decisions, so the two being the same person removes that
> check. Separate them before LGA-wide rollout, and record the date.

## 2. Purposes of processing

| Purpose | Lawful basis |
|---------|--------------|
| Providing primary health care and maintaining the clinical record | Vital interests and provision of health care |
| Statutory NHMIS monthly reporting to the LGA and NPHCDA | Legal obligation |
| Appointment and immunization reminders by SMS | Consent, recorded per patient |

Reporting uses **aggregates only**. No identifiable patient row leaves the
facility for reporting purposes.

## 3. Categories of data subject

Patients attending PHCs in Nnewi North LGA, including pregnant women in
antenatal care, infants and children in routine immunization, and general
outpatients. Also facility staff, as system users.

## 4. Categories of personal data

| Category | Examples |
|----------|----------|
| Identifiers | Name, MRN, date of birth, sex, phone, address, NIN (optional) |
| Health data (sensitive) | Encounters, vitals, diagnoses, prescriptions, ANC contacts, deliveries, immunization doses, referrals |
| Consent | SMS consent flag, preferred language |
| Staff | Name, username, role, facility assignment, PIN hash |
| Operational | Audit events, device identifiers, SMS send log |

The **NIN is optional and never required**, per the locked decisions in
`CLAUDE.md`.

## 5. Recipients

| Recipient | What they receive | Basis |
|-----------|-------------------|-------|
| LGA health authority and M&E | Aggregate monthly figures | Legal obligation |
| DHIS2 / NHMIS | Aggregate monthly figures | Legal obligation |
| SMS provider | **None. SMS is switched off for this deployment.** | n/a |

**No personal data is shared with any third party.** SMS is disabled
(`SMS_ENABLED=false`), so no processor receives a phone number or a message.

The module remains in the codebase and the hub refuses to dispatch while the
flag is off. Before it is ever switched on, a data processing agreement with the
provider is required, and SMS consent must start being collected at
registration: the consent field is hidden while SMS is off, so existing records
do not carry one.

## 6. Transfers outside Nigeria

**None.** The system is self-hosted on a Nigerian VPS and backups stay
in-country. No SMS provider is in use.

## 7. Retention

Set in `infra/.env` and reported by `GET /api/v1/system/compliance`.

| Record | Period | Why |
|--------|--------|-----|
| General clinical | 10 years after last contact | Standard clinical practice |
| Maternity and ANC | 25 years | Obstetric claims have a long tail |
| A child's record | Until they turn 18, or the general period if longer | Only they can act on it once adult |
| Backups | 30 days (`BACKUP_RETENTION_DAYS`) | Local copies, once shipped off-host |

**These govern archival review, not automatic deletion.** Clinical records are
soft-deleted and never hard-deleted, so nothing is removed by the passage of
time. Disposal at the end of a retention period is a reviewed, audited
operation a person carries out.

**Confirm these against current Nigerian requirements before go-live.** They are
defensible defaults drawn from common clinical practice, not a citation of a
Nigerian statutory period, and the controller should have that checked.

## 8. Security measures

| Measure | Status |
|---------|--------|
| TLS in transit, HSTS | Implemented (Caddy) |
| Role-based access control | Implemented |
| Facility data scope, three layers | Implemented, server-side enforced |
| Full audit trail | Implemented |
| Encrypted backups | Implemented, restore rehearsed on development data |
| Rate limiting on auth and API | Implemented |
| Security headers, CSP | Implemented |
| Database not exposed to the internet | Implemented (no published port) |
| Containers run as non-root | Implemented |
| Volume-level encryption at rest | **Deployment responsibility.** Use an encrypted disk on the host. |
| Device-level encryption | **Operational policy.** Verify before issuing a device. |
| Local store encryption on the device | **Not implemented.** IndexedDB is plaintext. See below. |
| Audit-trail cryptographic tamper-evidence | **Not implemented.** Append-only by convention. |

The last two are stated plainly because overstating them would create a
compliance problem rather than solving one. Both are documented residual risks
for the DPO to accept or to fund mitigation for.

## 9. Data subject rights

Access, rectification and objection are exercised through the facility. The
system supports correction with a full audit trail, and cross-facility access to
a record is reason-prompted and logged as a `sensitive_access` event.
