---
name: kata-plan-worktree
description: Find an existing Kata issue matching the user's prompt, claim the best match, create a git worktree for it with gt, and start a headless Codex planning session there. Use when the user wants only a claimed Kata task plus an implementation plan in a new worktree, with no implementation.
---

# Kata Plan Worktree

## Workflow

1. Run from the repository workspace.
2. Verify `gt` is available:

```bash
command -v gt
```

Stop if `gt` is unavailable.

3. Search Kata once with the user's prompt or a concise summary:

```bash
kata search "<user request or concise summary>" --agent
```

If the search returns no plausible match, stop. Do not create a new issue.

4. Choose the best match from the search results. If several issues are plausible, inspect the strongest candidates before choosing:

```bash
kata show <ref> --agent
```

Do not claim an issue based on a weak match. Stop and report ambiguity if the best match is not clear.

5. Claim the selected issue:

```bash
kata claim <ref> --comment "Starting plan-only worktree." --agent
```

6. Choose a short branch name derived from the issue title, prefixed with the Kata ref, for example `a1b2-add-import-preview`.

7. Create the worktree with `gt`:

```bash
gt <name-of-the-branch>
```

8. Start a headless Codex session in the new worktree with xhigh reasoning. Ask Codex to create an implementation plan for the claimed issue using `docs/plan_template.md`, and tell it the target path for in-progress plans is `docs/plans`.

```bash
codex exec -C "<worktree-path>" -c model_reasoning_effort=xhigh "Create an implementation plan for Kata issue <ref>: <issue title>. Read docs/plan_template.md and use it for the plan. Use kata show <ref> --agent for issue details. The target path for in-progress plans is docs/plans; write the plan there in the new worktree. Do not implement anything, do not run tests, do not commit, and do not run review-loop."
```

## End State

- The matching Kata issue is claimed.
- A new `gt` worktree exists for the issue branch.
- The new worktree contains an implementation plan under `docs/plans` based on `docs/plan_template.md`.
- No implementation, tests, commits, or review-loop have been performed.
