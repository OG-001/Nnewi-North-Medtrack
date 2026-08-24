# Records of processing

**Status:** template. The bracketed fields are the data controller's to complete
before go-live, and cannot be filled in from the codebase.

**Purpose:** the NDPA 2023 accountability principle requires a controller to
maintain a record of its processing activities. This is that record for
PHC-Track, prepared from what the system actually does.

---

## 1. Controller and DPO

| Field | Value |
|-------|-------|
| Data controller | `[TO BE NAMED]` (Open question Q9) |
| Data Protection Officer | `[TO BE NAMED]` (Q9) |
| Contact address | `[TO BE COMPLETED]` |

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
| SMS provider (Africa's Talking or Termii) | Phone number and message body only | Processor, under a DPA |

The SMS body carries the visit date and the facility name. **No diagnosis or
clinical detail.** The provider is a data processor and a data processing
agreement is required before live dispatch.

## 6. Transfers outside Nigeria

**None.** The system is self-hosted in-country, and backups stay in-country. The
SMS providers are Nigerian.

## 7. Retention

`[TO BE SET]` (Open question Q7). Clinical records are soft-deleted and never
hard-deleted, so retention is a policy that governs archival and eventual
disposal, not a deletion the application performs on its own.

Backups retain for `BACKUP_RETENTION_DAYS`, default 30 days.

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
