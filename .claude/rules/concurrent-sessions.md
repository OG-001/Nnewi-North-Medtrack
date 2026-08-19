# Concurrent sessions and git

**Why this exists.** This repository is a single clone: one working tree, one checked-out
branch at a time. When more than one Claude Code session operates on it, they share that one
checkout. One session's `git switch` or `git reset` changes the branch under the other, and
one session's uncommitted work can be swept into the other's commit or wiped entirely.

**Repository facts.** Git root is this directory. Remote is
`github.com/OG-001/Nnewi-North-Medtrack`. Default branch is `main`.

---

## The rules

1. **One session owns the primary checkout at a time.** Before any *mutating* git command
   (`switch`, `switch -c`, `reset`, `rebase`, `commit`, `push`, `merge`, `stash`), claim the
   repo in `.claude/session-git-locks.json`. If a different live session holds it, **stop**:
   either wait for release, or work in a worktree (rule 2). Never switch or reset a checkout
   holding uncommitted changes you did not make.
2. **Parallel work uses a git worktree, never a switch of the shared checkout.** A worktree
   is a second working folder with its own branch and index, sharing one `.git` history.
   Point that session's work at the worktree folder: zero collision. Note that a fresh
   worktree needs its own `pnpm install`, because `node_modules` is not shared.
3. **Release when done.** Remove a finished worktree with `git worktree remove <path>`, then
   release its lock.
4. **Read-only git never needs a claim.** `status`, `log`, `diff`, `fetch`, `show`,
   `git worktree list`, `gh pr view`, `gh pr checks` are always safe.
5. **Explicit staging, always.** Stage only the files this task changed. Never `git add -A`
   or `git add .`. Never sweep another session's uncommitted files into your commit.
6. **Stale locks.** A lock whose holder session is known-gone may be reclaimed. Record the
   reclaim in the lock's `note`. Never steal a fresh lock.
7. **Non-git shared state counts too.** The same discipline applies to the Docker stack in
   `infra/docker-compose.yml`, to the `pgdata` volume, and to shared documents in `docs/`.
   Never overwrite a resource another live session holds.
8. **State ownership in your output.** Whenever you touch, or decline to touch, a shared
   resource, state which session or lock owns it, or that it was free.

---

## Branch discipline

- Feature branches: `feature/<feature-name>`.
- Phase branches: `phase-<n>-<short-title>`, for work delivering a whole phase.
- Default branch: `main`.
- **Never commit directly to `main`.**

---

## The local store is shared state too

A subtle one specific to this project. The PWA's IndexedDB store lives in the **browser
profile**, not in the repository, so it survives a branch switch. Two consequences:

- A schema change on one branch can leave a browser holding a store shaped by another
  branch. When switching between branches with different Dexie versions, clear the site
  data or use a separate browser profile.
- Never treat "it works in my browser" as evidence after a branch switch. The store may be
  carrying rows that the current branch's schema never created.

---

## Never

- Never `git push --force`. Use `--force-with-lease --force-if-includes`.
- Never `gh pr merge --admin`, and never bypass a blocked CI gate.
- Never treat "no checks reported" as "checks passed".
- Never push, open a pull request, or merge without explicit owner confirmation. The
  `git-workflow` agent stops before every outward-facing action.
- Never commit `pnpm-lock.yaml` changes you did not intend. A stray lockfile diff usually
  means a command was run with `npm` instead of `pnpm`.

---

## Enforcement status

This is a **coordination convention** the primary and the `git-workflow` agent honor. It is
not hook-enforced: nothing currently blocks a `switch` or `commit` when another session
holds the lock. `.claude/scripts/session-hook.sh` registers the session on start and
heartbeats each turn, so liveness is visible.
