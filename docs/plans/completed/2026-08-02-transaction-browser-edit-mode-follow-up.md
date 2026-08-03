# Plan: Polish transaction browser Edit mode and drill-down interactions

## Goal

Resolve the post-implementation UI feedback around Edit-mode layout, picker layering, eligibility feedback, transaction-detail activation, toolbar stability, and Category/Tag/Member drill-down density while preserving the shared transaction-browser behavior.

## Constraints

- This is a frontend-only correction; do not change REST contracts, accounting semantics, or mutation eligibility.
- Keep the compact Edit-mode header in the page toolbar, but present the persistent Category/Tags/Member/Status controls as a right-side panel that is visible from zero selected rows and never renders below the table.
- The Edit-mode side panel must own its vertical scrolling. Opening it or one of its editors must not grow the document, move pagination below the viewport, or take usable vertical space from the transaction table.
- Keep transaction detail non-modal and overlapping: outside activation still closes it while performing the underlying action, activating another row switches detail, and detail must not reflow the toolbar.
- Fix entity-picker layering in the shared picker implementation so Edit mode and the full transaction editor cannot diverge.
- Remove the secondary identity card and `View all transactions` action only from Category, Tag, and Member drill-down pages. The broader hierarchy and filter unification in Kata `wd6m` remains out of scope.
- Keep documentation evergreen and remove props, helpers, exports, tests, and copy made obsolete by these fixes.

## Success Criteria

- [x] Edit mode keeps its table and pagination within the page viewport while a persistent right-side control panel scrolls internally; the control panel never appears below the table at supported widths.
- [x] Entity-picker option lists paint above already-selected chips in both the Edit-mode panel and full transaction editor.
- [x] Mixed eligible/ineligible selections report truthful, count-scoped Category eligibility feedback; selecting one Spend and one Transfer does not present `no categorizable records` as a statement about the whole selection.
- [x] Activating the row whose transaction detail is already open closes that detail; outside click, another-row activation, URL state, and focus restoration continue to follow the shared overlay contract.
- [x] Opening transaction detail does not move Edit mode or Filter controls to another toolbar row; the panel overlaps them without changing toolbar geometry.
- [x] Category, Tag, and Member drill-down pages have one identity header only, with no secondary white identity card or `View all transactions` action, while their scoped toolbar and shared transaction browser remain intact.
- [x] `docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, `PROJECT_STATE.md`, and relevant frontend package docs describe the final behavior without retaining superseded layout or drill-down rules.
- [x] `just pre-commit`, `just test`, and `just test-frontend-e2e` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-02-transaction-browser-edit-mode-follow-up.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Make Edit controls a viewport-safe side panel

Move `TransactionEditDock` from beneath the shared transaction table into a persistent right-side panel while retaining the existing mode header, selection behavior, editors, mutation feedback, Escape ladder, and focus restoration.

- Give the table/pagination region and side panel one height-bounded browser layout; long panel content and expanded editors scroll inside the panel without creating document scroll or displacing pagination.
- Preserve the transaction table's responsive column-collapse behavior and usable scroll area at constrained widths; the Edit controls must not fall back below the table.
- Remove the `detailPanelOpen` toolbar geometry branch so opening the fixed transaction-detail panel cannot force Edit mode and Filter controls onto a new row.
- Extend `frontend/tests/e2e/transactions/edit-mode.spec.ts` and `table-layout.spec.ts` with viewport geometry and scroll assertions covering zero selection, an expanded editor, visible pagination, and detail-panel overlap.
- Update the owning Edit-mode layout rules in the design/theme docs, ledger package contract, and project state in the same commit.
- [x] Edit controls remain reachable and internally scrollable without growing the page or reducing the table/pagination's vertical viewport, and transaction detail leaves toolbar geometry unchanged.
- [x] Commit as `fix(frontend): move edit controls to a side panel`.

### Task 2: Correct picker layering and eligibility feedback

Fix the shared picker stacking model and make Edit-mode skip explanations describe only the transactions they count.

- Ensure an open `EntityPicker` listbox paints above its owning `EntityMultiPicker` selected-chip region and remains unclipped in both the Edit-mode panel and app-shell transaction editor; do not add surface-specific z-index overrides.
- Keep the existing eligibility predicate and `will update · require full edit` counts, but render each reason with its transaction count and singular/plural context, such as `1 transaction has no categorizable records`, instead of an unqualified statement about the selection.
- Add shared-surface coverage in `frontend/tests/e2e/transactions/picker-visibility.spec.ts` and a Spend-plus-Transfer Category scenario in `edit-mode.spec.ts`.
- Update picker and Edit-mode feedback contracts only where the observable wording or layering rule is implicit.
- [x] Picker options remain above selected tags in both owning surfaces, and mixed Category selection feedback is accurate without changing mutation eligibility.
- [x] Commit as `fix(frontend): correct edit picker feedback`.

### Task 3: Toggle transaction detail from its active row

Make the shared transaction-detail controller treat activation of the currently selected transaction row as a close request.

- Apply the behavior consistently to click, Enter, and Space activation in Transactions and Category/Tag/Member browser embeddings.
- Preserve one URL history entry for detail, same-row close URL cleanup, focus restoration, outside-click close-through behavior, and direct switching when another row is activated.
- Extend `frontend/tests/e2e/transactions/detail.spec.ts` with one complete activation sequence and retain drill-down coverage as evidence that the shared controller is used.
- Update the row-activation contract in `docs/webui-design.md` and the ledger package doc.
- [x] Re-activating the open row closes detail without regressing outside close, row switching, keyboard operation, or URL state.
- [x] Commit as `fix(frontend): toggle active transaction detail`.

### Task 4: Remove redundant reference drill-down identity cards

Let the route-level `PageHeader` remain the sole identity header on Category, Tag, and Member drill-down pages.

- Remove the secondary white card, duplicate entity title/kind/hidden presentation, and `View all transactions` action from `ReferenceDrilldownPage`; keep the exact-scope control, filters, Edit mode, browser, notices, and transaction detail behavior.
- Delete now-unused drill-down props, link-building helpers/exports, page imports, and skeleton structure rather than retaining dead compatibility paths.
- Update `frontend/tests/e2e/reference-drilldowns.spec.ts` to assert one identity heading, absence of the removed action/card, and continued scoped filtering and browser behavior.
- Replace the obsolete drill-down action/card rules in `docs/webui-design.md` and the reference package contract without taking on Kata `wd6m`'s broader group-filter work.
- [x] Category, Tag, and Member drill-downs start directly with their toolbar/browser beneath the route header and retain all scoped transaction behavior.
- [x] Commit as `refactor(frontend): simplify reference drill-down headers`.
