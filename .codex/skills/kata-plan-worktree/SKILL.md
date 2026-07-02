---
name: kata-plan-worktree
description: Find an existing Kata issue matching the user's prompt by breaking the prompt into lexical keywords, claim the best match, create a git worktree for it with gt, and start a headless Codex planning session there. Use when the user wants only a claimed Kata task plus an implementation plan in a new worktree, with no implementation.
---

# Kata Plan Worktree

## Workflow

1. Run from the repository workspace.
2. Verify `gt` is available:

```bash
command -v gt
```

Stop if `gt` is unavailable.

3. Break the user's prompt into concrete lexical search terms. Kata search is not semantic, so synthesize keywords from nouns, feature names, package names, commands, file paths, API names, domain terms, and error text. Drop filler verbs and broad words such as `fix`, `add`, `make`, `thing`, `issue`, or `task` unless they are part of a precise phrase.

4. Search Kata with several targeted queries instead of one broad prompt. Prefer 2-5 searches, starting with the most specific phrase and then alternate keyword combinations:

```bash
kata search "<specific phrase or identifier>" --agent
kata search "<keyword combination>" --agent
```

If all searches return no plausible match, stop. Do not create a new issue.

5. Synthesize the best match from the search results. Prefer an issue whose title/body overlaps multiple extracted keywords or whose details clearly describe the requested work. If several issues are plausible, inspect the strongest candidates before choosing:

```bash
kata show <ref> --agent
```

Do not claim an issue based on a single weak keyword overlap. Stop and report ambiguity if the best match is not clear.

6. Claim the selected issue:

```bash
kata claim <ref> --comment "Starting plan-only worktree." --agent
```

7. Choose a short branch name derived from the issue title, prefixed with the Kata ref, for example `a1b2-add-import-preview`.

8. Create the worktree with `gt`:

```bash
gt <name-of-the-branch>
```

9. Start a headless Codex session in the new worktree with xhigh reasoning. Ask Codex to create an implementation plan for the claimed issue using `docs/plan_template.md`, and tell it the target path for in-progress plans is `docs/plans`.

```bash
codex exec -C "<worktree-path>" -c model_reasoning_effort=xhigh "Create an implementation plan for Kata issue <ref>: <issue title>. Read docs/plan_template.md and use it for the plan. Use kata show <ref> --agent for issue details. The target path for in-progress plans is docs/plans; write the plan there in the new worktree. Do not implement anything, do not run tests, do not commit, and do not run review-loop."
```

## End State

- The matching Kata issue is claimed.
- A new `gt` worktree exists for the issue branch.
- The new worktree contains an implementation plan under `docs/plans` based on `docs/plan_template.md`.
- No implementation, tests, commits, or review-loop have been performed.
