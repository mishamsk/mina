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

3. Determine whether the user named an issue directly. Always treat either of these as a Kata issue ref:

- `#` followed by a 4-character issue id, for example `#a1b2`
- a bare 4-character issue id, for example `a1b2`

For a direct issue ref, skip search and inspect it with:

```bash
kata show <ref> --agent
```

If the direct issue lookup fails, do not create a new issue. List recent open issues and ask the user to select one of the provided issues:

```bash
kata list --limit 10 --agent
```

4. If the user did not name a direct issue ref, search Kata once with the user's prompt or a concise summary:

```bash
kata search "<user request or concise summary>" --agent
```

If the search returns no plausible match, do not create a new issue. List recent open issues and ask the user to select one of the provided issues:

```bash
kata list --limit 10 --agent
```

5. Choose the best match from the inspected issue or search results. If several issues are plausible, inspect the strongest candidates before choosing:

```bash
kata show <ref> --agent
```

Do not claim an issue based on a weak match. Stop and report ambiguity if the best match is not clear.

6. Claim the selected issue:

```bash
kata claim <ref> --comment "Starting plan-only worktree." --agent
```

7. Choose a short branch name derived from the issue title. Prefix the branch name with the Kata issue hash/ref, for example `a1b2-add-import-preview`.

8. Create the worktree with `gt`:

```bash
gt <name-of-the-branch>
```

9. Start a headless Codex session in the new worktree with xhigh thinking effort. Ask Codex to create an implementation plan for the claimed issue using `docs/plan_template.md`, and tell it the target path for in-progress plans is `docs/plans`.

```bash
codex exec -C "<worktree-path>" -c model_reasoning_effort=xhigh "Create an implementation plan for Kata issue <ref>: <issue title>. Read docs/plan_template.md and use it for the plan. Use kata show <ref> --agent for issue details. The target path for in-progress plans is docs/plans; write the plan there in the new worktree. Do not implement anything, do not run tests, do not commit, and do not run review-loop."
```

## End State

- The matching Kata issue is claimed.
- A new `gt` worktree exists for the issue branch.
- The new worktree contains an implementation plan under `docs/plans` based on `docs/plan_template.md`.
- No implementation, tests, commits, or review-loop have been performed.
