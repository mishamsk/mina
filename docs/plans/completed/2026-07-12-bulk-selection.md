# Plan: Bulk selection and floating action bar (Kata ds26)

Add transaction-level bulk selection with a floating action bar to the shared browser, per `docs/webui-design.md` "Bulk operations" (the complete spec — read it first plus the tables rule "leading checkbox column only once bulk actions exist"; do not edit ground-truth docs). Last task of the editing suite — reuses the shared pickers and the record bulk endpoints the earlier editing tasks already wired.

## Plan Context

- Kata issue: `ds26`.
- MANDATORY pre-reads: `docs/webui-design.md` Bulk operations + tables/filtering rules + component inventory (`BulkActionBar` is a named shared component), `docs/webui-theme-arcade-cabinet.md` (landmark treatment for the floating bar; z-layers: dialogs z-[80], toasts z-[70] — the bar must sit below dialogs), `docs/frontend-architecture.md`, `docs/TESTING.md`.
- Spec highlights (verbatim intent from the design doc):
  - Selection at the TRANSACTION level in the shared browser; a leading checkbox column appears (it exists only now that bulk actions exist); selecting rows raises a floating action bar with categorize, tag, member actions mapped to the record bulk endpoints.
  - Uniformity rule: bulk edits target only transactions whose records are uniform for that field; non-qualifying selections are SKIPPED and reported in the result toast ("12 updated, 2 skipped: mixed records"). Complex transactions that cannot map mechanically are skipped.
  - Record-level bulk (account reassignment, status changes) in account registers is OUT of this task's scope unless trivially shared — the design assigns it to registers where records are the row unit; note it in the kata close if not delivered here.
- Interaction details (decided):
  - Keyboard: Space (or the established toggle key) toggles selection on a focused row; the checkbox is clickable without triggering row expansion; header checkbox selects the page.
  - The floating bar (shared `BulkActionBar` component in the ledger feature or components per boundaries) shows the selection count, the three actions (each opening the shared picker), and a clear-selection control; keyboard reachable; Escape clears/dismisses per the overlays rule.
  - EXPECTED occurrence rows are not selectable (consistent with the editing exclusions).
  - Selection is page-local UI state (clears on filter/page change unless the existing design of snapshots makes cross-page trivial — keep it simple, page-local, note the choice).
  - Apply → per-field bulk endpoint across qualifying transactions' record ids; result toast with updated/skipped counts and reason; snapshots refresh per the established rules (incl. 9985 invalidation).
- e2e (`transactions-page.spec.ts`): select rows via checkbox + keyboard; bar appears with count; bulk categorize with a mixed-record transaction in the selection → skipped-reporting toast text; bulk tag and member; expected rows unselectable; clear selection; chips/classification refresh after apply.
- PROJECT_STATE.md: extend the editing capability line (bulk operations). Ledger PACKAGE.md for the new component/contract. No ground-truth edits.

## Tasks

### Task/Commit 1: Selection model + checkbox column + floating bar shell

- [x] Implement selection state, leading checkbox column, keyboard toggle, and the floating BulkActionBar shell (count, clear, action buttons) per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `ds26` (`kata comment ds26 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Bulk categorize/tag/member with uniformity skip-reporting

- [x] Implement the three bulk actions with picker flows, qualifying-transaction computation, skip reporting toast, and refresh rules.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `ds26`
  - [x] Commit changes

### Task/Commit 3: e2e + docs

- [x] e2e per Plan Context; PROJECT_STATE.md/PACKAGE.md updates.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `ds26`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Bulk selection + floating action bar (kata ds26): transaction-level selection with leading checkbox column and keyboard toggle in the shared browser, floating BulkActionBar (categorize/tag/member via shared pickers, count, clear, Escape) mapped to record bulk endpoints with uniformity-rule skip reporting in the result toast; expected occurrence rows unselectable; page-local selection; refresh rules incl. 9985 invalidation; register record-level bulk deliberately out of scope per the design's register assignment"`
- [x] Move this plan to `docs/plans/completed/`
