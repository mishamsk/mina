# Plan: Entity list keyboard review fixes (feedback fleet Brief A, fix pass 1)

## Goal

The active-row fill appears only while the table owns keyboard focus, the Edit-mode amount Tab flow keeps hopping between rows, and the roving hook stops observing the whole component subtree.

## Constraints

- Do not run review-loop.
- Implementation-only; do not edit completed plans, `docs/architecture.md`, or `docs/frontend-architecture.md`.
- Testing policy: do not add e2e tests; net count unchanged; no REST as action or evidence; no matrices, geometry assertions, or fixed waits.
- Fixes required:
  1. Focus-scoped active fill (major, operator-confirmed): `activeIndex` defaults to 0 and every row class paints `data-[active=true]:bg-...` unconditionally, so the first row is tinted on page load and the tint persists after focus leaves the table. Gate the fill on focus in all seven row classes (`data-[active=true]:focus-within:` or equivalent) in `reference-tree.tsx`, `accounts-tree.tsx`, `members-page-content.tsx`, `recurring-page-content.tsx`, `account-register-table.tsx`, `transaction-browser.tsx`, and `status-audit-log.tsx`; keep the audit log's selected-entry tint and the browser's Edit-mode selection tint independent. The theme clause stays as written (hover fill while focused, no ring).
  2. Edit-mode amount Tab flow: the amount input's custom Tab handler in `frontend/src/features/ledger/transaction-amount-input.tsx` now leaves the table because non-active rows' inputs are `tabindex=-1`. Restore the batch flow: Tab and Shift+Tab from an eligible amount input move to the previous or next row's eligible amount input and adopt that row as the active row (through the hook's adoption path), saving first as documented; only leave the table when no such input exists.
  3. Hook scope: in `frontend/src/hooks/use-roving-rows.ts`, observe only the rows container (`tbody`, resolved from the row selector's parent) rather than the whole component root, and give the reconcile effect a dependency list (`activeIndex`, row selector, container) instead of running on every render.
  4. Cleanups: drop the duplicate leaf guard between `reference-tree.tsx` and `templates-page-content.tsx` (keep one), and drop the duplicate `isInteractiveTarget` check in the transaction-browser row `onKeyDown` now that the hook checks it; replace the `page.reload()` added in the Categories label journey of `frontend/tests/e2e/categories-page.spec.ts` with an assertion that Tab lands on the row the Edit click already adopted (no reload).
- Protect, do not regress: everything the operator verified live (one Tab stop per table on Categories, Accounts, Transactions, Recurring; ArrowDown/Up, Home/End with scroll-into-view; Tab into nested controls from the active row; no ring on rows), the WebKit explicit-tabindex fix, the register detail re-open on walk, Shift+Arrow selection extension, and the full e2e suite.
- Mina is pre-production with no users: no compatibility shims.

## Success Criteria

- [x] With `just dev --demo`: on Categories, no row is tinted on load; Tab into the table tints the active row; Tab out to the toolbar or clicking elsewhere removes the tint; on Transactions in Edit mode, Tab from an eligible amount input lands on the next row's amount input with that row active, and the last one leaves the table.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/categories-page.spec.ts tests/e2e/accounts-page.spec.ts tests/e2e/transactions/edit-mode.spec.ts tests/e2e/status-page.spec.ts` passes on chromium and webkit.
- [x] `just pre-commit` passes.
- [x] Commit as `fix(frontend): scope the active row fill to focus and keep amount Tab hopping rows`.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.
