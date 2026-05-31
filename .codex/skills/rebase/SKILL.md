---
name: rebase
description: Safely rebase the current Git branch onto main. Use when Codex is asked to update a feature branch with the latest main branch, or when the user sends only "$rebase". Resolve conflicts by preserving new main changes and replaying the current branch's intent on top, then run full verification and commit any post-rebase fixes.
---

# Rebase

## Overview

When invoked, rebase the current branch onto the latest main branch without needing extra instructions. Treat conflict resolution as re-applying the branch's work onto main, then verify the complete result.

## Workflow

1. Read the repo instructions first, including `AGENTS.md` and any required project docs.
2. Inspect `git status --short`, the current branch, remotes, and available main refs.
3. Do not discard, reset, or overwrite uncommitted user work. If the worktree is dirty before starting, either make a clearly scoped commit for existing work when appropriate or stop and explain the blocker.
4. Fetch the latest remote refs. Prefer rebasing onto `origin/main` when it exists; otherwise use the local `main`.
5. Do not rebase while on `main`. Stop if the current branch is `main`.
6. Start the rebase with `git rebase <main-ref>`.

## Conflict Rules

- Never solve conflicts by undoing new work from main.
- During a rebase conflict, remember that Git side names are inverted from a normal merge: `--ours` is the main/upstream side, and `--theirs` is the branch commit being replayed.
- Resolve conflicts by starting from main's version and re-applying the current branch's intended change where it still belongs.
- Avoid blanket `git checkout --ours` or `git checkout --theirs`. Review each conflicted file and preserve both sides when they are compatible.
- Use `git diff`, `git diff --ours`, `git diff --theirs`, and `git log --oneline --left-right --cherry-pick <main-ref>...HEAD` as needed to understand intent.
- After resolving each conflict, stage only the resolved files and continue with `git rebase --continue`.
- Do not use `git reset --hard`, delete commits, skip commits, or abort the rebase unless the user explicitly approves or the repository is otherwise unrecoverable.

## Verification And Fixes

1. Run the repository's full verification commands through the project-owned recipes.
2. For this repository, run `just pre-commit`, `just test`, and `just test-integration` after the rebase.
3. Fix any failures caused by the rebase.
4. Commit post-rebase fixes as follow-up commits instead of silently folding them into replayed commits, unless the user explicitly asks to rewrite or squash.
5. If code changes were committed, run a Codex review subagent after the commit when the repo instructions require it, then apply and commit valid fixes.
6. Finish with `git status --short`, the new branch tip, the main ref used, verification results, and any follow-up commits created.

## Stop Conditions

- Stop rather than working around missing tools, broken recipes, failed fetches, authentication failures, or unclear pre-existing worktree changes.
- Do not force-push unless the user explicitly asks for it after the local rebase and verification are complete.
