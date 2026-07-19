---
name: rebase
description: Safely rebase the current Git branch onto main. Use when Codex is asked to update a feature branch with the latest main branch, or when the user sends only "$rebase". Preserve new main behavior and the branch's intent, resolve conflicts deliberately, run repository verification, and commit any resulting fixes.
---

# Rebase

## Goal

Rebase the current feature branch onto the latest available main ref and leave a clean, verified local branch.

Success means:

- `origin/main` is the new base when available; otherwise the local `main` is the base.
- New main behavior remains intact and the feature branch's still-applicable intent is replayed on top.
- Repository-owned validation selected for the combined scope of main's incoming changes and the feature branch passes, including frontend checks when applicable.
- Rebase-caused fixes are committed separately, the worktree is clean, and nothing is pushed.

## Constraints

- Read `AGENTS.md` and required project docs before acting.
- Preserve uncommitted user work. If the worktree is dirty, stop and report the blocker.
- Do not rebase while on `main`.
- During conflicts, remember that `--ours` is main/upstream and `--theirs` is the branch commit being replayed.
- Resolve each conflict from current main behavior plus the branch's applicable intent. Do not use blanket side selection.
- Do not use `git reset --hard`, skip or delete commits, abort the rebase, or force-push unless the user explicitly authorizes it or the repository is otherwise unrecoverable.
- Do not run `review-loop`.

## Workflow

1. Inspect the worktree, current branch, remotes, and available main refs.
2. Fetch current remote refs and choose the base using the goal above. Stop on missing tools, authentication failure, or an unavailable base.
3. Run `git rebase <main-ref>`.
4. If conflicts occur, inspect both sides and relevant history, preserve compatible changes, stage only resolved files, and continue the rebase.
5. Choose and run the verification required by `AGENTS.md`, owning docs, and the combined change scope from main and the feature branch. Fix failures caused by the rebase and commit those fixes as follow-up commits; do not silently fold them into replayed commits unless the user asks.
6. Confirm the final worktree is clean and report the base, new branch tip, verification results, conflicts resolved, and follow-up commits.

## Stop Rules

- Stop when pre-existing work, a conflict's intended result, or a verification failure cannot be resolved from repository evidence without changing scope.
- Report the concrete blocker and current rebase state instead of guessing or discarding work.
