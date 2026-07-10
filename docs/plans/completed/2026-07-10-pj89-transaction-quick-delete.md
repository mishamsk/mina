# Plan: Quick-delete action on transaction rows (`pj89`)

Add a hover/focus-revealed Delete (trash) action beside "Open transaction detail" in the transaction browser's trailing RowActions. Activation opens the standard named confirmation; confirming calls the existing transaction delete endpoint, refreshes the current page, and shows the standard toast. No API work.

## Plan Context

- Ground truth: `docs/webui-design.md` — trailing row actions (hover/focus-revealed icon buttons with tooltips, fold per the transactions column-collapse rule), centered dialogs for confirmations, one shared browser embedded everywhere. `docs/webui-theme-arcade-cabinet.md` — icon-button and destructive affordances.
- Current state: transaction rows carry trailing Open detail and Delete RowActions. The detail panel owns a separate transaction delete flow; the delete client function lives in `frontend/src/api/ledger.ts`.
- Reuse, do not reinvent:
  - The shared `ConfirmDialog` component (`frontend/src/components/confirmation-dialog.tsx`, used by categories/tags row deletes) for the named confirmation — copy/semantics consistent with the detail panel's delete dialog (transaction identified the same way that dialog names it).
  - The existing delete client call and the existing refresh/invalidation helpers the detail-panel delete uses; the standard toast notice.
- The browser is shared: the quick-delete must behave identically in every embedding (transactions page, account registers, future drill-downs) — keep the mechanics inside the browser feature, not the page.
- Row actions: trash renders beside Open detail (both button-class, hover/focus-revealed, tooltips, stop row propagation, keyboard reachable through row focus); the transactions fold rule (column-collapse breakpoints) now folds two actions into the overflow — unchanged mechanics.
- Cancel/error: cancel closes and restores focus; API errors render in-dialog (`role="alert"`) and the dialog stays open; a delete of an already-deleted transaction surfaces the API error, no crash.
- Protect — do not regress: open-detail action and detail panel flows including its own delete; row expansion; keyboard row navigation; transactions e2e including toolbar geometry; account register embedding behavior.
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `pj89`.

## Tasks

### Task/Commit 1: Row quick-delete with named confirmation

- [x] Add the Delete (trash) RowAction beside Open transaction detail in `transaction-browser.tsx`, wired to a browser-owned `ConfirmDialog` naming the transaction like the detail-panel dialog; confirm calls the existing delete endpoint, refreshes the current page via existing helpers, and shows the standard toast; cancel restores focus; errors render in-dialog.
- [x] Ensure propagation safety (click and keyboard activation of the action never expands the row or opens detail) and keyboard access via row focus.
- [x] Extend `frontend/tests/e2e/transactions-page.spec.ts`: hovered/focused row reveals both actions with tooltips; delete opens the named confirmation; confirm issues the real DELETE, refreshes the list (row gone), and shows the toast; cancel keeps the row; a mocked API failure renders the in-dialog error and keeps the dialog open; keyboard path works; open-detail still works.
- [x] Update `PROJECT_STATE.md` with a one-line note that transaction rows carry a quick-delete action.
- [x] Update the ledger package doc only if a non-obvious contract emerges.
- [x] Add Kata `pj89` progress and verification evidence.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Add a quick-delete row action to the shared transaction browser reusing ConfirmDialog, the existing delete endpoint, refresh helpers, and toast; open-detail, detail-panel delete, row expansion, and toolbar geometry unchanged"` — first review/fixer iteration completed and committed fixes; interrupted before the tool's second internal review pass to enforce the one-iteration limit.
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `pj89` only after the plan is moved to completed
