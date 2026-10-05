# Commit identity enforcement

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-05                     |
| Time      | 09:40 WAT                      |
| Author    | OG-001                         |
| Phase     | n/a (repository governance)    |
| Module    | n/a                            |

## Summary

Sixteen of the seventeen commits in this repository were authored by
`Arek-Oge <arik.ziemba@gmail.com>`, an account unrelated to this project. Eight of them are
published on `origin/main`. Only the initial commit, `487d202`, carries the correct
`OG-001 <og.eleodimuo@gmail.com>`.

The cause is that commit authorship and push credentials are unrelated in git. Authorship
comes from `user.email`. The access token only decides whether a push is permitted. GitHub
attributes a commit by matching the author email against the verified emails on an account.
The global `user.email` on this machine was set to the other account, so every commit was
stamped with it and every push still succeeded. Nothing failed, which is why it went
unnoticed until the commits were read on GitHub.

This change prevents recurrence. It does **not** repair the existing commits: see Open
questions.

## Decisions taken

The identity is set with `git config --local`, not globally. Other projects on this machine
legitimately use the other account, so changing the global default would move the bug rather
than fix it.

Local config alone is not enough, because it is lost on a fresh clone and can be cleared by
a single `git config --local --unset`. The failure is silent, so the guard has to be
something that refuses rather than something that reminds. `.githooks/pre-commit` reads
`git var GIT_AUTHOR_IDENT`, which resolves the identity the commit will actually carry
through the whole config precedence chain and environment overrides, rather than trusting
one config scope, and exits non-zero when the email is wrong.

A wrong `user.name` with a correct `user.email` is a warning, not a refusal. GitHub
attributes on the email, so attribution is already correct in that case.

The hook lives in a tracked `.githooks/` directory rather than `.git/hooks/`, so it travels
with the repository. `core.hooksPath` is local config and therefore still needs setting once
per clone, which is why that command appears in three places a reader will hit.

## Deviations from the plan

None.

## Open questions surfaced

**The 16 mis-attributed commits are not yet repaired.** Correcting them requires rewriting
history and force pushing over 8 published commits. Both operations are refused to the
assistant by the environment's permission layer, including after the owner granted
permission conversationally, so the owner must run them. The commands are recorded in
`.claude/rules/concurrent-sessions.md` and were given in the session transcript.

Backup refs were taken before any attempt and still point at the pre-rewrite state:

| Ref                                    | Commit  |
|----------------------------------------|---------|
| `backup/pre-reattrib-feature`          | b7f5046 |
| `backup/pre-reattrib-main`             | 1e18867 |
| `refs/backup/pre-reattrib-origin-main` | 7d85dda |

Nothing in this change rewrites or deletes a commit.

## Files changed

| File                                      | Change type |
|-------------------------------------------|-------------|
| `.githooks/pre-commit`                    | added       |
| `CLAUDE.md`                               | modified    |
| `.claude/rules/shared-context.md`         | modified    |
| `.claude/rules/concurrent-sessions.md`    | modified    |

## Change details

### `.githooks/pre-commit`

New. Resolves the effective author identity and refuses the commit when the email is not
`og.eleodimuo@gmail.com`, printing the two commands that fix it. Verified both ways: it
allows the current correct identity, and it refuses
`GIT_AUTHOR_EMAIL=arik.ziemba@gmail.com`, the exact identity that caused the incident.

### `CLAUDE.md`

```diff
@@ -124,6 +124,12 @@
 14. **Everything is strictly typed.** No `any`, no non-null assertion used to silence the
     compiler, no `@ts-ignore` without a cited reason on the line above.
+15. **Commit as `OG-001 <og.eleodimuo@gmail.com>`.** Verify before every commit with
+    `git var GIT_AUTHOR_IDENT`. Never rely on the global git identity: on this machine it
+    is a different account, and it silently mis-attributed 16 commits.
```

### `.claude/rules/shared-context.md`

```diff
@@ -155,6 +155,8 @@ ## 8. Git baseline
 - Remote: `github.com/OG-001/Nnewi-North-Medtrack`. Default branch: `main`.
+- **Commit identity is `OG-001 <og.eleodimuo@gmail.com>`**, set per clone, never inherited
+  from the global git config. Check it with `git var GIT_AUTHOR_IDENT` before committing.
```

### `.claude/rules/concurrent-sessions.md`

New "Commit identity" section ahead of "Branch discipline", stating the required identity,
why a wrong one is invisible at push time, the incident as precedent, and the three
per-clone setup commands.

## Verification

```
PASS case: current correct identity      -> allowed
FAIL case: Arek-Oge <arik.ziemba@...>    -> refused, exit 1
```

Testing: the hook was exercised directly on both paths, as above. No unit test added; the
hook has no import graph and its only consumer is git.
