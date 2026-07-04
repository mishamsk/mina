# Plan: Transaction detail panel interaction polish — Kata issue `4nmw`

Resolve the accepted review deferrals on the transaction detail side panel: make its modality coherent (non-modal side peek per the updated `docs/webui-design.md` Overlays rule), add a keyboard path that opens the detail from a focused row, remove the record table's horizontal scrollbar, make success notices auto-dismiss, and extract the detail workflow out of `transactions-page.tsx` into a feature hook.

## Plan Context

- Ground truth: `docs/webui-design.md` — Overlays rule (authoritative for this task): "Side peek/detail panels are non-modal: no backdrop, no focus trap, no modal semantics; the underlying list stays interactive so row navigation can drive the panel. `Esc` closes the panel and returns focus to the originating row. Centered dialogs are modal and trap focus." Also Keyboard rules ("open peek" from row focus) and Tables rules (no horizontal scrollbar). `docs/webui-theme-arcade-cabinet.md` — "Toasts: landmark treatment, one-line, auto-dismiss". `docs/frontend-architecture.md` — pages stay thin; feature hooks in `features/ledger/use-*.ts` (pattern: `use-transactions-resource.ts`). Read all before starting.
- Current code evidence (line numbers as of this plan's commit):
  - Modality mismatch: `frontend/src/features/ledger/transaction-detail-panel.tsx:363-372` — `<aside role="dialog" aria-modal="true">`, fixed slide-over, NO backdrop, list behind stays pointer-interactive; hand-rolled document-level Tab trap at `:273-329` (`focusableSelector` `:34-41`); Esc close in the same listener `:275-284`; initial focus `:263-266`; focus restore via `onRestoreFocus` cleanup `:268-270`. The nested delete confirmation (`:478-491`) is a true modal (`role="alertdialog"`, backdrop, own trap) — it stays modal.
  - Keyboard: `frontend/src/features/ledger/transaction-browser.tsx` rows are focusable `<tr tabIndex={0}>` (`:613-639`); `Enter`/`Space` both toggle expand (`:629-638`); detail opens only via the in-cell button `aria-label="Open transaction detail"` (`:710-722`). No key opens the peek from a focused row.
  - Horizontal scroll: `transaction-detail-panel.tsx:155-156` — records table wrapper `overflow-x-auto` + `min-w-[980px] table-fixed` inside a `min(760px, 100vw-2rem)` panel forces a scrollbar. Contrast: the browser's expanded records subtable (`transaction-browser.tsx:424`) uses `w-full table-fixed` with no min-width and does not scroll.
  - Notices: hand-rolled `saveNotice` state (`frontend/src/pages/transactions-page.tsx:78`), rendered as a fixed `<p role="status">` (`:318-325`); it never auto-dismisses (only cleared on entry-panel open `:136`). No toast primitive exists in `components/`.
  - Page thinness: detail workflow spread across `transactions-page.tsx` (359 lines): state/refs `:79-84`, derived selectors `:106-125`, `openTransactionDetail`/`closeTransactionDetail`/`restoreDetailFocus`/`deleteSelectedTransaction` `:139-180`, deep-link `?transaction=` fetch effect `:182-223`.
- Operator decisions (do not relitigate):
  - Non-modal means: keep `role="dialog"` WITHOUT `aria-modal`, no backdrop, delete the manual Tab trap entirely; moving focus into the panel on open and `Esc`-to-close (document level is fine) stay; focus restore to the originating row on close stays. The inner delete confirmation remains modal and keeps its trap.
  - Keyboard split on a focused row: `Enter` opens the transaction detail panel; `Space` keeps toggling expand/collapse. Both stay guarded by `isInteractiveTarget`. Update any e2e assertions that assumed Enter toggles expansion.
  - Toasts: no new dependency — a small generic auto-dismissing toast component in `frontend/src/components` (landmark treatment, one-line, `role="status"`, auto-dismiss after ~4s, dismissible on click; timer-based state change, no animation needed, so `prefers-reduced-motion` is trivially respected).
  - Hook: `frontend/src/features/ledger/use-transaction-detail.ts`, exported via `features/ledger/index.ts`, owning the state/refs, derived selectors, handlers, and the deep-link fetch effect listed above; inject `params`, the search-param setter, and a notice callback. The `"n"` hotkey effect is entry-panel scope — leave it in place.
- Preserve, do not regress: URL-addressable detail (`?transaction=`), deep-link fetch, delete flow with confirmation dialog, summary-memo display, list live-updating behind the panel, existing e2e suites.
- This is interaction polish; do not update `PROJECT_STATE.md`; do not touch ground-truth docs.

## Tasks

### Task/Commit 1: Non-modal side peek and width-adaptive records table

Make the panel's semantics match its behavior and remove the horizontal scrollbar.

- [x] Remove `aria-modal` and the hand-rolled Tab focus trap from `transaction-detail-panel.tsx`; keep Esc-to-close, initial focus move, and focus restore on close. The delete confirmation dialog keeps its modal semantics, backdrop, and trap (scope its trap to itself, not reusing the deleted panel trap).
- [x] Verify (and cover with an e2e assertion) that the list behind the open panel is genuinely interactive: clicking another row's "Open transaction detail" button while the panel is open switches the panel to that transaction.
- [x] Records table: drop the `min-w-[980px]`/`overflow-x-auto` horizontal-scroll layout for a width-adaptive `w-full table-fixed` layout like the browser's records subtable — cells truncate with tooltips where needed; no horizontal scrollbar at the panel's width.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Keyboard path — Enter on a focused row opens the detail panel

- [x] In `transaction-browser.tsx`, split the row keydown handling: `Enter` calls `onOpenTransaction(transaction)`; `Space` keeps `toggleExpanded()`; both guarded by `isInteractiveTarget`. Row click behavior (expand toggle) is unchanged.
- [x] Extend e2e: focus a row with the keyboard, press Enter, assert the detail panel opens for that transaction and that Esc closes it and returns focus to the row; update any assertions that relied on Enter toggling expansion.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Auto-dismissing toast

- [x] Add a small generic toast component in `frontend/src/components` per the theme's toast treatment (one-line, landmark styling, `role="status"`, auto-dismiss ~4s, click to dismiss) and use it for the transactions page save/delete notices in place of the persistent `saveNotice` rendering.
- [x] e2e: assert a save or delete notice appears and disappears without user action.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 4: Extract `use-transaction-detail` feature hook

- [x] Move the detail workflow out of `pages/transactions-page.tsx` into `features/ledger/use-transaction-detail.ts` (state/refs `:79-84`, derived selectors `:106-125`, handlers `:139-180`, deep-link fetch effect `:182-223`), exported via `features/ledger/index.ts`; the page keeps only composition/layout. No behavior change — existing detail e2e must pass unmodified in this commit.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Transaction detail panel polish (kata 4nmw): non-modal side peek (no aria-modal/trap/backdrop, list interactive, Esc closes + focus restore; delete confirm stays modal); Enter on focused row opens detail while Space toggles expand; records table width-adaptive without horizontal scroll; generic auto-dismiss toast; detail workflow extracted to features/ledger/use-transaction-detail.ts. Constraints: frontend-only; URL-addressable detail preserved; no ground-truth doc edits; docs/webui-design.md Overlays rule (non-modal side peeks) is the governing decision."`
- [x] Move this plan to `docs/plans/completed/`
