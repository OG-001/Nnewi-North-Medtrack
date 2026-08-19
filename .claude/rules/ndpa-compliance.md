# Patient-data protection: NDPA 2023 and secrets

**Applies to:** every file in the repository. Patient health data is **sensitive personal
data** under the Nigeria Data Protection Act 2023, so this rule has no exempt directory.

**Authority:** `docs/architecture/security-and-compliance.md`.

> **Not legal advice.** This is an engineering compliance design. The deployment's data
> controller and Data Protection Officer must confirm obligations with the Nigeria Data
> Protection Commission before go-live. Open question Q9 in `docs/master-plan.md` tracks who
> those people are, and it is still open.

---

## 1. The obligations that constrain code

| Principle             | What it means when you are writing code                  |
|-----------------------|-----------------------------------------------------------|
| Lawful basis, consent | No SMS without the patient's explicit consent flag        |
| Data minimisation     | Collect only what the workflow needs; cross-facility search exposes a minimal index, never the record |
| Purpose limitation    | Care and reporting only. Reporting uses aggregates.       |
| Accuracy              | Structured validation, duplicate detection, audited correction |
| Storage limitation    | Configurable retention. Soft delete then archive.         |
| Confidentiality       | Encryption in transit and at rest, RBAC, least privilege  |
| Accountability        | Full audit log, named controller and DPO                  |
| Data residency        | Self-hosted in Nigeria. Data does not leave the country.  |
| Breach handling       | Detectable through logging, with a documented runbook     |

---

## 2. Secrets (Global Constraints 1 and 2)

**Never commit a secret.** No API key, provider token, database password, JWT signing
secret, or private key in the repository, in a Docker image, or in a log line.

- Secrets come from the environment or a secret store at runtime.
- `infra/.env.example` is the **template**: it documents which keys exist and must contain
  only placeholder values.
- `.env` and `.env.<anything>` are blocked from editing by
  [`../hooks/safety-gate.sh`](../hooks/safety-gate.sh). Propose the keys and values to the
  owner as text instead.
- The development credentials visible in `infra/docker-compose.yml` (`phc` and
  `phc_dev_only`) are for local development only and must never appear in a deployment.

The safety gate also blocks any edit whose content matches a credential pattern: a
PostgreSQL URL carrying a password, an AWS access key id, an OpenAI-style `sk-` token, a
GitHub token, or a PEM private key block.

---

## 3. Patient data in logs and telemetry

- Structured logs carry a `traceId`, not raw identifying data, wherever that is avoidable.
- **Never log** a token, a password, a PIN, or a full SMS body next to a patient identifier.
- Log retention is bounded, and logs are treated as potentially containing personal data and
  access-controlled accordingly.
- The same discipline applies to anything an agent writes into `devops/change_log/` or a
  report: **never paste real patient data into a document.** Use the seeded demo records or
  obviously synthetic values.

---

## 4. The local store on the device

IndexedDB is **not encrypted by the browser**. The device holds real patient data in
plaintext at rest. The version 1 baseline mitigations, in order:

1. Device-level encryption on the Android device, which is an operational policy and the
   modern Android default.
2. Auto-lock, minimal scoped local data, and purge on logout, to bound the exposure.
3. Application-layer encryption of the most sensitive local fields, deferred to Phase 10
   for evaluation because browser key management is weak and the cost on low-end devices is
   real.

**Do not claim the local store is encrypted.** The residual risk is documented for the DPO,
and an agent that overstates it is creating a compliance problem, not solving one.

On logout, deactivation, or scope loss, purge the local data for facilities that left scope.
On device de-enrolment, purge everything.

---

## 5. SMS providers are data processors

Africa's Talking and Termii receive personal data, which makes them processors under the
Act.

- Send **only** the phone number and the message body.
- **No clinical detail** beyond what the patient must know. "Your child's immunization is
  due on <date> at <facility>" is the ceiling, not a starting point.
- Suppress any send where consent is absent or the phone number is invalid. Honour opt-out.
- Provider keys live in the secret store. Delivery webhooks are signature-verified.
- A data processing agreement with each provider is an operational task for the controller,
  tracked on the Phase 10 checklist.

---

## 6. Application security baseline

- Validate all input on the client **and** on the server. Reject malformed data before it is
  persisted, offline included.
- Parameterised queries only. Never build SQL by string concatenation.
- Output encoding against cross-site scripting. Avoid `dangerouslySetInnerHTML`; if a case
  genuinely needs it, sanitise and justify it in a comment.
- Security headers on the PWA: Content-Security-Policy, X-Frame-Options, Referrer-Policy.
- Rate limiting on authentication, SMS, and webhook endpoints.
- Pin dependency versions, keep the surface small, and scan for vulnerabilities.

---

## 7. Severity when auditing

| Finding                                                        | Severity |
|-----------------------------------------------------------------|----------|
| A secret, key, or credential committed                          | CRITICAL |
| Real patient data written into a document, log, or test fixture | CRITICAL |
| A hard delete of clinical data                                  | CRITICAL |
| A read or write path missing its facility-scope check           | CRITICAL |
| Cross-facility access without a reason prompt or audit event    | CRITICAL |
| SMS sent without a consent check                                | CRITICAL |
| Clinical detail in an SMS body beyond the minimum               | WARNING  |
| An audit event missing for an auditable action                  | WARNING  |
| A claim in a report that overstates an unbuilt guarantee        | WARNING  |
| Missing input validation on a new field                         | WARNING  |

---

## 8. Third-party dependency licences

The repository has **no `LICENSE` file yet** and no closed-licence marker convention. Open
question Q-licence is not in `docs/master-plan.md`, so treat the project licence as
undecided and raise it with the owner rather than assuming.

When proposing a new dependency, rate its licence:

| Rating | Licences                                      | Verdict          |
|--------|-----------------------------------------------|------------------|
| GREEN  | MIT, Apache-2.0, BSD-2, BSD-3, ISC, Unlicense | Safe to use      |
| YELLOW | MPL-2.0, LGPL-2.1, LGPL-3.0                   | Review required  |
| RED    | GPL-2.0, GPL-3.0, AGPL-3.0                    | Escalate         |
| BLACK  | No licence, modified licence, SSPL            | Block            |

Read the actual `LICENSE` text, never trust a `package.json` `license` field alone, and scan
for addendum keywords such as `Commons Clause`, `non-commercial`, `Business Source`, or
`Elastic License`. Permissive with any addendum is BLACK.
