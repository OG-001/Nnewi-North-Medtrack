# Incident and breach response runbook

**Applies to:** any suspected compromise, loss, or unauthorised disclosure of
patient data held by PHC-Track.

> **Not legal advice.** The data controller and Data Protection Officer own the
> decisions here. This runbook exists so the technical steps are already written
> down when they are needed. Open question Q9 (who those people are) must be
> resolved before go-live.

---

## 1. Notification clock

Under the Nigeria Data Protection Act 2023, a reportable personal-data breach
must be notified to the **Nigeria Data Protection Commission within 72 hours** of
becoming aware of it, and affected data subjects must be informed where the risk
to them is high.

**The clock starts at awareness, not at confirmation.** Begin the timeline the
moment a breach is suspected, and record the time in the incident log. Confirming
the details is part of the 72 hours, not a preliminary to them.

## 2. First hour

1. **Record the time** you became aware, and what prompted it.
2. **Do not destroy evidence.** Do not delete logs, wipe a device, or rebuild a
   container until the DPO agrees. Preserve the audit trail.
3. **Contain, if containment is clear and reversible:**
   - Suspected stolen or lost device: revoke it.
     `UPDATE device SET revoked_at = now() WHERE id = '<device-id>';`
     The device cannot sync again, and it loses offline access at its next
     online check.
   - Suspected compromised account: set the user's status away from `active`.
     They can no longer sign in, at the hub or offline after the next check.
   - Suspected compromised signing key: rotate `JWT_SECRET` and restart the API.
     Every access token becomes invalid and everyone must sign in again. That is
     disruptive and it is the correct response.
   - Suspected compromised database credentials: rotate `POSTGRES_PASSWORD`,
     restart the stack.
4. **Notify the DPO and the data controller.**

## 3. Assessment

Answer these, in the incident log:

- What data was involved, and roughly how many patients?
- Was it clinical content, identifiers, or credentials?
- Is it still exposed, or is exposure ended?
- Who accessed it, and can the audit trail evidence that?

The `audit_event` table is the primary evidence: it records actor, action,
entity, facility, device and timestamp for every create, update, soft delete,
login, permission change, cross-facility access, conflict resolution, report
lock and SMS send.

```sql
SELECT at, actor_user_id, action, entity_type, entity_id, facility_id, device_id
FROM audit_event
WHERE at > now() - interval '7 days'
ORDER BY at DESC;
```

**Known limitation, and state it honestly to the DPO:** the audit trail is
append-only by convention and application logic, not yet by cryptographic
tamper-evidence. Someone with direct database access could alter it. Hash
chaining is a candidate hardening measure and is not implemented.

## 4. Notification

If the breach is reportable, the DPO notifies the NDPC within 72 hours with what
is known so far. An incomplete notification inside the window is better than a
complete one outside it.

Where the risk to patients is high, inform them, in plain language, through the
facility.

## 5. After

1. Write the incident up: timeline, cause, what was done, what will change.
2. Fix the cause, with a regression test where a test can express it.
3. Record it in `devops/change_log/`.
4. Review whether the same class of failure is possible elsewhere.

## 6. Device loss, the most likely incident

A clinic tablet is the most exposed component: it holds real patient data, and
IndexedDB is **not encrypted by the browser**.

The mitigations, in order:

1. Device-level encryption on the Android device, which is an operational policy
   and the modern Android default. **Verify it is on before a device is issued.**
2. Auto-lock, minimal scoped data, and purge on logout, which bound the exposure.
3. Revocation at the hub, which stops sync and ends offline access at the next
   online check.

Do not tell the DPO the local store is encrypted. It is not. The residual risk is
documented, and overstating it creates a compliance problem rather than solving
one.
