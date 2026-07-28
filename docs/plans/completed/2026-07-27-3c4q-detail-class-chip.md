# Plan: Remove redundant class metadata from transaction detail (Kata `3c4q`)

The transaction detail panel's metadata block no longer repeats the transaction class, and the header class chip gains the class's icon — matching the shared class icon/badge conventions — so class is stated once, prominently, and never icon- or color-only.

## Plan Context

- Kata issue: `3c4q` — "Remove redundant class metadata from transaction detail" (P2, bug, frontend).
- Verified live (operator, 2026-07-27): the detail panel renders a header `ClassBadge` chip (e.g. `SPEND`) and separately lists `CLASS Spend` in the metadata block (`frontend/src/features/ledger/transaction-detail-panel.tsx`, metadata dl around line ~940). The metadata class row is pure duplication — remove it; metadata keeps source and created (and any other non-duplicative facts).
- Header chip: add the transaction-class icon (the same glyph `ClassIcon` uses in transaction lines) inside the existing `ClassBadge` chip per `docs/webui-theme-arcade-cabinet.md` (`ClassBadge`: square chip, bright-form fill, ink text, mono uppercase micro-label; class glyphs in accent ink). The chip keeps its visible text label — meaning never icon- or color-only — plus its accessible name/tooltip conventions.
- Verify the panel for every transaction class against the demo dataset (spend, income, refund, transfer, exchange, adjustment/clawback where reachable, mixed — mixed's outlined-only chip treatment must still hold with the icon).
- The account-register peek header uses the same badge component — verify it follows for free and stays consistent.
- Preserve: everything else in the detail panel (lifecycle strip, record table with the new role indicators, actions, metadata source/created), row/panel layout stability, existing e2e assertions except those pinning the removed metadata row (update those).
- Ground truth: `docs/webui-design.md` (Screen 2 detail spec — its metadata enumeration mentions "metadata (source, created)" already, so no doc change should be needed; if the spec text needs a touch, keep it minimal), `docs/webui-theme-arcade-cabinet.md`, `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Class stated once — icon in the header chip, metadata row removed

- [x] Remove the class metadata row, add the class icon to the header `ClassBadge` (all classes, mixed included), keep accessible names and tooltips, and verify each class live with `just dev --demo` (screenshot-level check per class).
- [x] Update any e2e assertions that pinned the metadata class row; add/extend an assertion that the header chip carries both the icon and the visible class label, and that metadata no longer lists class.
- [x] Commit the task as `fix(frontend): state transaction class once in detail with icon-bearing chip`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-27-3c4q-detail-class-chip.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `3c4q` with `kata close 3c4q --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
