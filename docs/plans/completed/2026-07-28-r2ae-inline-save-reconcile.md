# Plan: Polish inline-save background reconciliation edges (Kata `r2ae`)

The two enumerated background-reconciliation edges in the transactions resource are fixed: focus restore behaves sensibly when the post-save refetch drops the edited row from a filtered page, and repeated background-refresh failures never leave the page silently stale.

## Plan Context

- Kata issue: `r2ae` — "Polish inline-save background reconciliation edges" (P3, frontend). Scope is the issue's two enumerated edges in `frontend/src/features/ledger/use-transactions-resource.ts`, verbatim:
  1. Background mode computes `rowWasVisible` from the locally updated snapshot (~line 354), so focus restore can target a row the imminent refetch removes from a filtered page (e.g. a category edited to a value the active filter excludes). Acceptance: focus restore behaves sensibly when the refetch drops the edited row — after the refetch settles, focus must not be lost to `body` or point at a removed row; the established fallback focus conventions apply (row-neighbor or the list restore target, matching how deletes handle a vanishing row).
  2. A second consecutive background-refresh failure leaves the page silently stale (no error surfaced) until navigation; only one automatic retry happens. Acceptance: repeated failures surface staleness to the user or keep retrying with backoff — pick the repository-consistent mechanism (the existing error/notice surface for the page) and implement one of the two; do not build both.
- These are behavior edges of the inline-save flow that the recent fleet work built on heavily (post-status refetch tolerance from `5qah`, bulk prediction from `xy9q`) — regressing none of that is part of the bar. Read `frontend/src/features/ledger/PACKAGE.md` for the refresh contracts and `docs/frontend-architecture.md` (mutations use explicit refresh rules; prefer refetch-after-mutation).
- Failure-injection testing: e2e may stall/fail the refetch via request interception, following the existing patterns in the specs (the repo already stalls `GET /api/transactions` in picker tests).
- Ground truth: `docs/webui-design.md` (feedback/states rules), `frontend/src/features/ledger/PACKAGE.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Fix both edges

- [x] Reproduce each edge live (`just dev --demo`, throttled/failed refetch), then fix: edge 1 at the focus-restore decision (post-refetch truth decides the restore target), edge 2 with the chosen staleness surface or bounded retry/backoff. Record the reproduction and the chosen mechanism in the commit message.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if the refresh contract wording changes.
- [x] Commit the task as `fix(frontend): reconcile inline-save focus and repeated background-refresh failures`.

### Task 2: Coverage

- [x] e2e coverage: (a) inline category edit that the active filter excludes — after the background refetch the row is gone and focus lands on the documented fallback; (b) two consecutive failed background refreshes — staleness is surfaced (or retry recovers when the route unblocks). Follow `docs/TESTING.md`.
- [x] Commit the task as `test(frontend-e2e): pin inline-save reconciliation edges`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-28-r2ae-inline-save-reconcile.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `r2ae` with `kata close r2ae --done --message "<summary incl. chosen staleness mechanism>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
