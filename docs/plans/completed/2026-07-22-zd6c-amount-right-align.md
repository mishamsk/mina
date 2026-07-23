# Plan: Restore right-aligned transaction amount chips — Kata `zd6c`

Every transaction amount chip in the amount column shares one consistent right edge, across all transaction classes, row variants, densities, and supported widths. Kata issue: `zd6c`.

## Plan Context

- Kata `zd6c` acceptance (ground truth for this plan):
  - One consistent right edge for every amount chip in the amount column.
  - Amount values and currency markers right-aligned across single-value and multi-component classes (transfer moved+fee, exchange sold-side, mixed component amounts per `docs/webui-design.md`).
  - Correct for ordinary, memo-bearing, expected, overdue recurring, and mixed rows at every supported density and viewport width.
  - This is horizontal right alignment — NOT vertical centering.
  - Regression coverage for representative row variants.
- Owning docs: `docs/webui-design.md` (monetary amounts use tabular numerals and right-align in tables; display-amount rules), `docs/webui-theme-arcade-cabinet.md` (AmountText/amount-chip treatment). Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from a documented rule; note any such edit prominently in the completion report.
- Affected code: `frontend/src/features/ledger/transaction-amount-cell.tsx` and amount-cell styling in `frontend/src/styles.css` / `transaction-browser.tsx`.
- Must not regress: the amount inline editor (wkpr/46vf explicit-commit and in-place saves), trxj action collapse (amounts never overlapped), hf98 bulk mode amount rendering, 8tkz description-cell layout (`frontend/src/features/ledger/PACKAGE.md` contracts).

## Tasks

### Task 1: Restore the shared right edge

End state: all amount chips right-align to a single column edge.

- [x] Amount chips share one right edge in the amount column for every transaction class (spend, income, refund, transfer with fee, exchange, mixed, adjustment) and row variant (ordinary, memo-bearing, expected, overdue, cancelled), at both densities and all supported widths.
- [x] Values and currency markers inside the chip remain right-aligned with tabular numerals; multi-component amounts keep their per-component alignment per the display rules.
- [x] Commit the task as `Restore right-aligned transaction amount chips`.

### Task 2: Regression coverage

End state: e2e pins the shared right edge.

- [x] E2E asserts (bounding-box right-edge comparison within a tolerance) across representative variants — ordinary, expected/overdue, mixed/multi-component, memo-bearing — at a wide and a narrow supported viewport.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover amount right alignment with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Amount chips share one right edge across all classes and row variants; tabular right-aligned values; no vertical-centering reinterpretation; wkpr/46vf/trxj/hf98/8tkz contracts unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `zd6c` with the commits and validation evidence: `kata close zd6c --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
