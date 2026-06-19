# Architecture — API Design

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Status:** Planned
**Reads with:** `data-model.md`, `offline-sync-design.md`, `security-and-compliance.md`

---

Defines REST conventions, auth, the error model, and representative endpoints per
module. The API is consumed by the PWA (online actions + sync) and by admin/LGA
dashboards. Built incrementally across phases; the **sync** endpoints (Phase 3)
and **auth** (Phase 1) are foundational.

---

## 1. Conventions

- **REST + JSON**, resource-oriented, versioned under `/api/v1`.
- **OpenAPI** spec generated from NestJS (kept in `apps/api`); the PWA's API
  client is typed from it. DTOs validated with class-validator/Zod; request and
  response schemas shared via `packages/shared` where practical.
- **IDs are client-generated UUIDs** for synced resources (see data-model §2);
  `POST` accepts the `id` so create is idempotent and offline-safe.
- **Timestamps** ISO-8601 UTC; **phones** E.164 (`+234…`).
- **Pagination**: cursor-based (`?cursor=&limit=`) for lists; sync uses
  `server_seq` watermark (not offset).
- **Soft delete**: `DELETE` sets `deleted_at`; never hard-deletes clinical data.
- **Every mutation** passes through the RBAC guard (role × data-scope) and the
  audit interceptor.

---

## 2. Authentication & authorization

- `POST /api/v1/auth/login` → `{ accessToken, refreshToken, user, scope, roles }`.
  Access token is a short-lived JWT; refresh token rotates.
- `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`.
- **PIN re-auth** on shared devices: `POST /api/v1/auth/pin` (after an initial
  full login establishes the user on the device).
- **Offline auth**: the device caches a securely-stored, revocable token/credential
  envelope so a previously-enrolled user can log in offline; revocation takes
  effect at next sync (see security doc + offline-sync §9).
- **Authorization**: a `@Roles()` + data-scope guard on every route. Requests
  outside the user's facility scope return `403` (except the audited cross-
  facility patient access path, which requires a reason and logs a
  `sensitive_access` event).

JWT claims include `sub` (user), `roles[]`, `facilityScope[]`, `deviceId`.

---

## 3. Error model

Uniform error envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "human readable",
             "details": [{ "field": "phone_primary", "issue": "invalid E.164" }],
             "traceId": "..." } }
```

| HTTP | `code` examples |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `OUT_OF_SCOPE` |
| 404 | `NOT_FOUND` |
| 409 | `SYNC_CONFLICT`, `MRN_COLLISION`, `DUPLICATE_SUSPECTED` |
| 422 | `BUSINESS_RULE_VIOLATION` (e.g., dose before min age) |
| 429 | `RATE_LIMITED` |
| 5xx | `INTERNAL` |

Clients map `409 SYNC_CONFLICT` into the conflict-resolution flow
(`offline-sync-design.md` §5), not a generic error toast.

---

## 4. Sync endpoints (Phase 3 — foundational)

```text
GET  /api/v1/sync/changes?since=<seq>&scope=<facilityIds>&limit=N
POST /api/v1/sync/push        # batch of client changes (idempotent upserts)
POST /api/v1/sync/enroll      # device enrolment: returns scope + baseline cursor
GET  /api/v1/sync/baseline?scope=&cursor=   # paged initial snapshot
```

Contracts in `offline-sync-design.md` §3. These are the only endpoints the PWA
uses for bulk data movement; per-resource endpoints below are used for online-
only actions (SMS, reports, admin) and for the dashboards.

---

## 5. Representative endpoints by module

> Listed to fix the surface; exact fields follow `data-model.md`. Most domain
> writes from the PWA flow through **sync/push**; the explicit routes below are
> for dashboards, admin, online-only features, and server-side logic.

### Patients (Phase 2)
```text
GET    /api/v1/patients?query=<phone|name|mrn>&scope=
POST   /api/v1/patients                      # id provided by client
GET    /api/v1/patients/:id                  # full record (scope-checked)
PATCH  /api/v1/patients/:id
GET    /api/v1/patients/index?query=         # LGA-wide minimal index (continuity of care)
POST   /api/v1/patients/:id/access           # audited cross-facility open (reason required)
GET    /api/v1/patients/:id/duplicates       # candidate matches
POST   /api/v1/patients/merge                # {survivingId, mergedId} (admin)
```

### Encounters / EMR (Phase 2)
```text
POST   /api/v1/patients/:id/encounters
GET    /api/v1/patients/:id/encounters
POST   /api/v1/encounters/:id/vitals | /diagnoses | /prescriptions | /referrals
GET    /api/v1/patients/:id/timeline         # merged cross-module history
```

### Maternal (Phase 4)
```text
POST   /api/v1/patients/:id/pregnancies      # body: lmp → server returns edd + schedule
GET    /api/v1/pregnancies/:id
POST   /api/v1/pregnancies/:id/anc-visits
GET    /api/v1/maternal/defaulters?facility=&asOf=
POST   /api/v1/pregnancies/:id/delivery      # may create linked newborn patient
```

### Immunization (Phase 5)
```text
GET    /api/v1/patients/:id/immunization      # card: due/given/overdue (computed)
POST   /api/v1/patients/:id/immunization/doses
GET    /api/v1/immunization/due?facility=&window=
GET    /api/v1/immunization/defaulters?facility=&asOf=
POST   /api/v1/immunization/aefi
```

### Queue (Phase 6)
```text
GET    /api/v1/queue?facility=&date=
POST   /api/v1/queue                          # check-in
PATCH  /api/v1/queue/:id                       # status / station / assignment
```

### SMS (Phase 7)
```text
GET    /api/v1/sms/templates | PUT /api/v1/sms/templates/:key
POST   /api/v1/sms/send                        # manual/bulk (filtered recipients)
POST   /api/v1/sms/webhooks/:provider          # delivery status callbacks (public, signed)
GET    /api/v1/sms/messages?status=&from=&to=
```

### Reporting (Phase 8)
```text
GET    /api/v1/reports/monthly?facility=&year=&month=     # generate/preview
POST   /api/v1/reports/monthly/:id/lock
GET    /api/v1/reports/monthly/:id/export?format=dhis2|csv|pdf
GET    /api/v1/reports/lga?year=&month=                   # LGA rollups (scope: lga)
GET    /api/v1/dashboards/facility | /dashboards/lga
```

### Admin / staff / facilities (Phases 1, 9)
```text
CRUD   /api/v1/facilities            # system admin
CRUD   /api/v1/users                 # + role/scope assignment
GET    /api/v1/audit?filters         # audit log viewer (scope-checked)
CRUD   /api/v1/config/immunization-schedule | /config/anc-model | /config/stations
GET    /api/v1/system/health | /system/sync-status
```

---

## 6. SMS provider interface (provider-agnostic)

`packages/shared` (or `apps/api/sms`) defines the contract both adapters satisfy:

```ts
interface SmsProvider {
  readonly name: 'africastalking' | 'termii' | 'twilio';
  send(msg: { to: string; body: string; senderId?: string })
    : Promise<{ providerMessageId: string; status: SmsStatus }>;
  parseDeliveryWebhook(payload: unknown)
    : { providerMessageId: string; status: SmsStatus };
}
type SmsStatus = 'queued' | 'sent' | 'delivered' | 'failed';
```

Selection by config/env (`SMS_PROVIDER=africastalking|termii`); failover order
configurable. Phone normalisation to E.164 before send. Delivery webhooks are
signature-verified and map provider statuses to the common `SmsStatus`.

---

## 7. Health, observability, rate limiting

- `GET /api/v1/system/health` (liveness/readiness for the container orchestrator).
- Structured request logs with `traceId`; sync metrics (push/pull counts,
  conflict counts), SMS delivery metrics, audit volume.
- Rate limiting on auth and SMS endpoints; webhook endpoints are signed and
  rate-limited.
- No PII in logs beyond what's necessary; never log tokens, passwords, or full
  message bodies with identifiers together (NDPA — security doc §8).
