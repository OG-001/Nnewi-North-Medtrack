---
description: Audit patient-data protection, facility isolation, authorization, secrets, and injection.
argument-hint: "[scope]"
---

# /security

Spawn the **`security-ndpa`** agent. It writes a report file and fixes nothing.

**Scope:** $ARGUMENTS

## The seven hunts, in order of consequence

1. **Cross-facility isolation.** Trace at least three real read paths end to end. Is the
   scope filter present, and does it come from the session rather than something a client
   controls?
2. **The two-halves permission rule.** Find any check testing the role without the scope, or
   the reverse. Verify `lga_authority` and `system_admin` cannot edit clinical data.
3. **Secrets.** Credential patterns anywhere outside `infra/.env.example` placeholders.
4. **The audit trail.** Every auditable action writes an `audit_event`. No path edits or
   deletes one.
5. **Personal data leakage.** Real patient data in a fixture, seed, log, comment, or change
   record. An identifier beside a token or message body. An export carrying rows rather than
   aggregates.
6. **SMS minimisation.** Consent blocks rather than warns. No clinical detail beyond the
   documented ceiling. Webhooks signature-verified and rate-limited.
7. **Injection and hardening.** Concatenated SQL, unvalidated input, unsanitised HTML,
   missing security headers, missing rate limits.

## Always state

- That **server-side facility scope is not built**, so isolation currently rests on the
  client alone.
- The known accepted risks, restated, so they stay visible rather than resurfacing as
  surprises.

Every finding needs a path, a line, and a concrete exposure scenario naming who reaches
whose data and how. Write the report to `devops/security-reports/YYYY-MM-DD_<scope>.md`.
