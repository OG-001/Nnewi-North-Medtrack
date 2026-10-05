# Git identity and SSH setup documented

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-05                     |
| Time      | 11:20 WAT                      |
| Author    | OG-001                         |
| Phase     | n/a (repository governance)     |
| Module    | n/a                            |

## Summary

Follow-up to `2026-10-05_commit-identity-enforcement.md`. That change added the guard;
this one writes down the setup it depends on, and closes a gap that would have leaked
machine-local permission grants into the repository.

Two additions to `docs/operations/environment-setup.md`, placed immediately after the
clone step because both must happen before a first commit:

- **6a, commit identity.** The three `--local` config commands, including the
  `core.hooksPath` line that arms `.githooks/pre-commit`. The hook is version-controlled
  but `core.hooksPath` is local config, so a fresh clone carries the hook in a dormant
  state. Anyone who misses that line gets no protection and no warning.
- **6b, SSH authentication.** Generating a second key when the machine's default key
  belongs to another GitHub account, selecting it with a `~/.ssh/config` host alias, and
  verifying with `ssh -T` before pushing.

`.gitignore` now excludes `.claude/settings.local.json`. That file authorises commands on
one developer's machine, so committing it would hand those grants to everyone who clones.

## Decisions taken

SSH over a personal access token. A token has to be stored somewhere, expires, and can
leak through a shell history or a pasted transcript. An SSH key needs none of that, and the
verification step is unambiguous: `ssh -T` names the authenticating account, so a wrong
identity is caught before any commit rather than after it is published.

The guide instructs a host alias rather than replacing the machine's default key. Other
projects on the same machine legitimately use a different account, and GitHub permits a
given key on only one account, so the two have to coexist.

`.claude/settings.local.json` is gitignored rather than committed with a conservative
default. Permission grants are a per-machine trust decision, not a project decision.

## Deviations from the plan

None.

## Open questions surfaced

None. The attribution incident is fully resolved: `origin/main` is at 18 commits, all
authored by `OG-001 <og.eleodimuo@gmail.com>`, and the backup refs taken before the rewrite
have been cleared.

## Files changed

| File                                       | Change type |
|--------------------------------------------|-------------|
| `docs/operations/environment-setup.md`     | modified    |
| `.gitignore`                               | modified    |

## Change details

### `docs/operations/environment-setup.md`

Two new subsections after step 5, "Get the code and install dependencies".

```diff
@@ -159,6 +159,9 @@
 > **If any later command fails with "cannot find module", run `pnpm install`
 > from the repository root first.** That is the single most common cause.
 
+### 6a. Set the commit identity before your first commit
+
+### 6b. Authenticate pushes with SSH, not a token
+
 ---
```

### `.gitignore`

```diff
@@ -20,6 +20,9 @@
 .claude/session-git-locks.json
 .claude/sessions/
+# Machine-local permission grants. These authorise commands on one developer's
+# machine, so they are not a project decision and must not travel in the repo.
+.claude/settings.local.json
```

## Verification

SSH authentication was confirmed working before this entry was written:

```
ssh -T git@github-og001   ->  Hi OG-001!
git fetch origin          ->  succeeded, no credential prompt
```

Testing: skipped, documentation and ignore-rule change with no behavioural effect on the
application.
