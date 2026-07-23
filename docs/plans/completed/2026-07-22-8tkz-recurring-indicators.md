# Plan: Keep recurring indicators inside the transaction description column — Kata `8tkz`

Recurring/overdue indicators render trailing the description content inside the description cell, so non-recurring rows use the full description width and recurring rows stay readable. Kata issue: `8tkz`.

## Plan Context

- Kata `8tkz` acceptance (ground truth for this plan):
  - Recurring and overdue indicators render to the right of description content within the description cell (not as a leading fixed slot that narrows every row).
  - Non-recurring rows can use the full description-column width.
  - Indicators remain visible, accessible, and meaningfully labeled (tooltips naming the state per the indicator affordance class) without forcing description/memo text into an unnecessarily narrow layout.
  - Expected and overdue variants verified at wide and narrow viewport widths.
- Owning docs: `docs/webui-design.md` (Transaction summary line row composition; Recurring occurrences — expected rows carry a distinct treatment, overdue rows the warning missed marker; indicators are read-only with tooltips), `docs/webui-theme-arcade-cabinet.md` (indicator treatments). Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from a documented rule; note any such edit prominently in the completion report.
- Affected code: `frontend/src/features/ledger/transaction-browser.tsx` (description cell composition; the expected/overdue indicator icons currently render leading the description) and possibly `line-icons.tsx`. The zb9f expanded-row treatment and description-width reclamation must not regress; neither may trxj action collapse, hf98 bulk mode, or the inline-editing contracts (`frontend/src/features/ledger/PACKAGE.md`).
- Truncation rule: the description (title + memo second line) truncates before pushing indicators out of view; indicators never wrap to their own line and never increase row height.

## Tasks

### Task 1: Trailing in-cell recurring indicators

End state: indicators sit to the right of the description text inside the description cell; non-recurring rows get the full width.

- [x] Expected and overdue indicators render after (right of) the description content within the description cell, vertically centered, never wrapping or increasing row height; description/memo text ellipsizes before indicators are displaced.
- [x] Non-recurring rows render no indicator slot at all — their description content can occupy the full column width.
- [x] Indicators keep accessible labels and tooltips naming the state (expected / overdue) per the indicator affordance rules.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if the row-composition contract wording changes.
- [x] Commit the task as `Move recurring indicators inside the description column`.

### Task 2: End-to-end coverage

End state: e2e pins indicator placement and width behavior.

- [x] E2E asserts at wide and narrow supported viewports: indicators of expected and overdue rows sit within the description cell to the right of its text; a non-recurring row's description content area is wider than a recurring row's text area at the same viewport (full-width use); indicators remain visible with accessible names.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover in-cell recurring indicator placement with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Recurring/overdue indicators trail the description inside its cell; non-recurring rows use full description width; indicators labeled and never wrap; zb9f/trxj/hf98 and inline-editing contracts unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `8tkz` with the commits and validation evidence: `kata close 8tkz --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
