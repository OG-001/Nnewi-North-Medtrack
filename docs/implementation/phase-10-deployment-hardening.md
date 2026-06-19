# Phase 10 — Deployment, Hardening & Rollout

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 10 — Deployment, hardening & rollout (**CRITICAL — production release**)
**Depends on:** Phase 9 (feature-complete v1)
**Status:** Planned

---

## 1. Objective

Take the feature-complete v1 to **production in Nigeria**: production Docker
deployment (NG VPS or on-prem LGA server), **NDPA 2023 hardening**, encrypted
**backups + rehearsed restore**, performance + security verification on real
target devices/networks, **staff training + UAT**, and a controlled **pilot →
LGA rollout** with rollback readiness — so the system runs safely, lawfully, and
reliably for real patient data.

> **This phase is confirmation-required.** A production deployment of a
> health-data system + live SMS is a real-world, hard-to-reverse action. Each
> go-live step needs explicit owner approval.

## 2. Prerequisites / entry criteria

- Phase 9 done: feature-complete v1; all prior phase exit gates passed.
- **Open questions resolved**: Q6 (hosting target), Q7 (retention period),
  Q9 (data controller + DPO designated). Q1/Q2/Q3/Q4/Q5/Q8 already resolved in
  their phases — re-confirm before go-live.
- Security baseline implemented across phases
  (`../architecture/security-and-compliance.md`).

## 3. Scope

**In scope**

- **Production deployment**: production `docker-compose` (api, web, worker,
  postgres, redis, reverse proxy w/ automatic TLS) for the chosen target (Q6:
  NG-region VPS or on-prem); environment/secret management (no secrets in repo).
- **NDPA hardening**: TLS/HSTS, at-rest encryption (volume + backups), device
  auto-lock/purge verified, offline-token revocation verified, audit tamper-
  evidence; **records of processing**; **breach-response runbook** (incl. NDPC
  notification timeline); DPA(s) with SMS provider(s); retention policy (Q7).
- **Backups + restore**: scheduled **encrypted** `pg_dump` off-host (in-country);
  **rehearsed restore**; documented runbook.
- **Performance verification** on real low-end Android + slow/intermittent
  networks against the device budget
  (`../architecture/tech-stack-recommendation.md` §4) and the **offline/sync**
  matrix (`../architecture/offline-sync-design.md` §10) at pilot scale.
- **Security review**: run a security review on the codebase (e.g.,
  `/security-review`), dependency vuln scan, RBAC bypass + out-of-scope tests;
  triage findings.
- **Observability**: structured logs, sync/SMS/audit metrics, health checks,
  alerting on sync backlog + SMS failures + backup failure.
- **Training + UAT**: staff training materials + sessions; UAT script per role on
  staging with synthetic data; sign-off.
- **Rollout**: **pilot (1–2 PHCs)** → monitor → **LGA-wide**; documented
  **rollback** (revert image, restore DB) for each step.

**Out of scope**

- Post-v1 roadmap items (master plan §9).
- New features (this phase ships and stabilises what exists).

## 4. Task breakdown

1. **Prod compose + infra**: harden containers, reverse proxy + TLS, resource
   limits, restart policies, log shipping; pin images.
2. **Secrets/config**: production secret store; rotate keys; verify no secrets in
   repo/images (CI secret scan).
3. **NDPA hardening**: enable/verify at-rest encryption + backups; verify device
   auto-lock/purge + offline-token revocation; finalize records of processing,
   breach runbook, retention (Q7), DPA(s); DPO sign-off (Q9).
4. **Backups/restore**: schedule encrypted off-host backups; **rehearse a full
   restore** in staging; document.
5. **Perf + offline verification** on real devices/networks at pilot scale;
   confirm budgets + sync matrix.
6. **Security review + dep scan**; fix/triage; re-test RBAC/scope.
7. **Observability + alerting**: dashboards + alerts (sync backlog, SMS failures,
   backup failures, error rates).
8. **Training + UAT**: materials, sessions, per-role UAT on staging; collect
   sign-off.
9. **Pilot rollout** to 1–2 PHCs with close monitoring; **measure the success-
   metric baselines** (master-plan §6); then **LGA-wide** rollout. Rollback
   documented + rehearsed per step. Final **change-log + release notes**.

## 5. Deliverables

- Running production deployment (in-country) with TLS, secrets, resource limits.
- NDPA hardening complete: encryption, backups, runbooks, records of processing,
  DPA(s), retention; DPO sign-off.
- Encrypted backups + a **rehearsed restore**.
- Performance + offline/sync verified on real devices at pilot scale.
- Security-review + dependency-scan findings triaged.
- Observability + alerting live.
- Training materials + UAT sign-off.
- Pilot live with baseline metrics captured; LGA rollout plan + rehearsed
  rollback; release notes + change-log entry.

## 6. Acceptance / exit criteria

- [ ] Production stack deploys reproducibly to the chosen in-country target (Q6)
      with TLS and **no secrets in repo/images**.
- [ ] **Backups run encrypted off-host (in-country) and a full restore has been
      rehearsed** successfully.
- [ ] NDPA controls verified: at-rest + in-transit encryption, audit tamper-
      evidence, device auto-lock/purge, offline-token revocation; **records of
      processing + breach runbook exist; controller + DPO designated** (Q9);
      retention set (Q7); DPA(s) with SMS provider(s).
- [ ] Performance budget + **offline/sync test matrix** pass on **real low-end
      devices** at pilot scale.
- [ ] Security review + dependency scan complete; no untriaged high-severity
      findings; RBAC bypass/out-of-scope tests pass.
- [ ] Observability + alerting cover sync backlog, SMS failures, backup failures,
      errors.
- [ ] Staff trained; **UAT signed off** per role.
- [ ] **Pilot live** at 1–2 PHCs; success-metric **baselines captured**; rollback
      rehearsed; **owner approves LGA-wide rollout**.

## 7. Governance & guardrails

- **Confirmation-required**: each go-live step (pilot, then LGA) needs explicit
  owner approval; no unilateral production release.
- **Data stays in-country** (NDPA); no production patient data in non-prod envs.
- **No secrets in repo/images**; rotate before go-live.
- **Rollback rehearsed** before each rollout step.
- **No invented success metrics** — baselines are *measured* during the pilot.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Data loss in production | Encrypted backups + **rehearsed restore**; sync durability from Phase 3 |
| NDPA non-compliance at go-live | DPO sign-off gate; records of processing + breach runbook + DPA(s); residency in-country |
| Poor performance on real devices | Verify on actual low-end hardware/networks; budgets are release-blocking |
| Security finding post-launch | Security review + dep scan + RBAC tests pre-launch; alerting + patch process |
| Low adoption at pilot | Training + UAT; workflow mirrors paper; monitor metrics; iterate before LGA-wide |
| Connectivity worse than assumed in field | Offline-first already core; monitor sync backlog; ops (power/connectivity) support |
| Rollout outpaces support capacity | Staged pilot → LGA; rollback per step; monitor before widening |

## 9. Hand-off

v1 is live across Nnewi North LGA. Ongoing operations: monitor success metrics
(master-plan §6), sync/SMS/backup health, and audit; maintain schedules/templates
via admin; iterate. The **post-v1 roadmap** (master-plan §9 — vaccine stock,
NHIS, USSD self-service, Igbo UI, lab, biometric ID, State federation) is planned
separately, each as its own scoped effort. Record operational learnings to inform
replication in other Anambra LGAs (the stated stretch goal).
