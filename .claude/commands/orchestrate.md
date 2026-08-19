---
description: Turn a goal into a gated multi-agent pipeline and drive it to completion.
argument-hint: "<goal>"
---

# /orchestrate

Spawn the **`orchestration`** agent to design the pipeline, then execute it in the primary
conversation. The agent plans; it does not spawn anyone.

**Goal:** $ARGUMENTS

## The four mandatory gates

1. `planner` runs first, even for a one-line fix.
2. **OWNER GATE**: present the plan and wait for explicit approval.
3. `reviewer` runs after coding.
4. `compliance` runs after `reviewer`.

## Scheduling rules

- **Read-only agents run in parallel**: `reviewer` with `compliance`, `security-ndpa` with
  `dependency-auditor`, `research-advisor` with `planner`.
- **Write agents run sequentially.** Never two of `web-pwa`, `shared-domain`, `offline-sync`,
  `api-nestjs`, `database`, or the four domain specialists at once.
- **`compliance` always runs after all writes.**
- Aggregate every result from a stage before starting the next.

## Routing calls that are easy to get wrong

| Situation                              | Route to                                    |
|----------------------------------------|----------------------------------------------|
| Anything writing to a Dexie table      | `offline-sync`, not `web-pwa`                |
| A permission or scope check            | `rbac-facility-scope`                        |
| An EPI or ANC schedule change          | `maternal-immunization`                      |
| Logic the future API will also need    | `shared-domain`                              |
| Patient data or SMS dispatch touched   | insert `security-ndpa` before `reviewer`     |
| A change to what a phase must deliver  | `phase-plan-author`, plus an owner gate      |

## Before proposing anything, check

- **Is the capability even built?** The NestJS hub, server-side scope enforcement, live SMS,
  and the test harness do not exist.
- **Does a phase gate block this?** A phase does not start until the previous one exits.
- Any clinic workflow change adds a **mandatory offline test**.

Return a table of step, agent, input, concurrency, and gate. Name only the block conditions
that are live risks for this goal, not all of them.
