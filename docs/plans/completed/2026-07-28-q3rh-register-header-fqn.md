# Plan: Register page header shows the full account FQN when space allows (Kata `q3rh`)

The account (and group) register page header renders the full FQN path whenever the header has room, middle-truncating only under genuine width constraint — applying the same policy `a4py` established for the chart-of-accounts Name column.

## Plan Context

- Kata issue: `q3rh` — "Register page header middle-truncates the account FQN despite available width" (P4, frontend). Observed post-`a4py`: the register header card renders `checking:…:Joint` at 1440×900 with abundant free header width; `a4py` fixed only the chart-of-accounts column. The `FqnPath` usage in the register header (see `frontend/src/features/accounts`) still truncates unnecessarily.
- Fix policy (from the issue): render the full FQN when space allows; truncate middle segments only under genuine constraint; the full path stays available in a tooltip when truncated (per `docs/webui-design.md` hierarchical-names rules). Reuse the `a4py` width-measurement approach/`FqnPath` capabilities rather than inventing a new mechanism — find how the chart-of-accounts column solved it and apply the same tool.
- Covers the account page header and the group register header (same surface family); the account-register peek and detail panels are out of scope.
- Preserve: header layout (balances block alignment, currency chip placement per the Screen 4 spec), no layout shift or overflow at narrow widths, existing e2e.
- Ground truth: `docs/webui-design.md` (Screen 4 account/group header; hierarchical names), `docs/webui-theme-arcade-cabinet.md` (`FqnPath` notes), `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Full-width-aware FQN in the register headers

- [x] Reproduce at 1440×900 on a deep account (e.g. `checking:Chase:Joint`) with `just dev --demo`, then apply the a4py policy to the account and group register headers; verify full path at wide widths, sensible middle truncation with tooltip at genuinely narrow widths, and stable header layout at both.
- [x] Add/extend an e2e assertion for the wide-width full path and the narrow-width truncation+tooltip.
- [x] Commit the task as `fix(frontend): show full register header FQN when width allows`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-28-q3rh-register-header-fqn.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `q3rh` with `kata close q3rh --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
