# Plan: Collapse transaction row actions before they overlap amounts — Kata `trxj`

Transaction row actions collapse into the single overflow (⋯) menu whenever the actions cell cannot fit the full cluster, so actions never overlap or displace the amount — including on expected/overdue recurring rows at narrow widths. Kata issue: `trxj`.

## Plan Context

- Kata `trxj` acceptance (ground truth for this plan):
  - Row actions collapse into a single overflow menu whenever the actions cell cannot fit the full cluster ("fit decides presentation, never count" per `docs/webui-design.md` Tables and filtering).
  - Actions never overlap, obscure, or displace the amount column.
  - All actions remain available and accessible from the overflow menu (including expected-row Confirm/Dismiss, per the affordance rules).
  - E2E covers narrow viewports and expected/overdue recurring variants.
- Owning docs: `docs/webui-design.md` (row-actions rule; column-collapse priority: member → status → row actions fold into overflow → tags → category), `docs/webui-theme-arcade-cabinet.md` (overflow ⋯ uses the icon-button treatment; floating panel). Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from a documented rule; note any such edit prominently in the completion report.
- Affected code: `frontend/src/features/ledger/transaction-browser.tsx` (row actions cell, expected-row occurrence actions) and the shared `RowActions`/overflow machinery. Expected rows currently render Confirm/Dismiss plus detail actions — the widest cluster and the visible failure case.
- Must not regress: zb9f chevron-free expansion, hf98 bulk mode (actions column already removed in-mode), wkpr/46vf inline-editing contracts (`frontend/src/features/ledger/PACKAGE.md`).
- Update `frontend/src/features/ledger/PACKAGE.md` if the actions-cell contract wording changes.

## Tasks

### Task 1: Fit-driven collapse of the transaction actions cell

End state: the actions cell measures fit and collapses to the overflow (⋯) button before any overlap can occur, in every embedding.

- [x] When the actions cell cannot fit the row's full action cluster (normal rows and expected/overdue rows), it renders the single overflow (⋯) icon button opening a floating panel with all of that row's actions; when it fits, all buttons render as today.
- [x] At no supported width or density do action buttons overlap, obscure, or displace the amount chip; the column-collapse priority from `docs/webui-design.md` still applies around it.
- [x] Overflow-panel actions work identically to the direct buttons (detail, delete, Confirm, Dismiss) with correct accessible labels; the ⋯ button follows the theme's icon-button treatment.
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if the contract wording changes.
- [x] Commit the task as `Collapse transaction row actions into overflow before overlapping amounts`.

### Task 2: End-to-end coverage

End state: e2e pins the collapse behavior at the stress points.

- [x] E2E asserts, at narrow supported viewports: the actions cell shows only the overflow button when the cluster cannot fit, amounts remain fully visible and unoverlapped (bounding-box checks), and expected/overdue rows expose Confirm/Dismiss through the overflow panel and both still work.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover row-action overflow collapse with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Fit-driven row-action overflow collapse in the transaction browser: no amount overlap at any supported width, expected-row actions available via overflow; zb9f/hf98/wkpr/46vf contracts unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `trxj` with the commits and validation evidence: `kata close trxj --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
