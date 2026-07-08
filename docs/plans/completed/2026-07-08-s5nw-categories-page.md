# Plan: Categories reference page — Kata issue `s5nw`

Build the Categories reference page per `docs/webui-design.md` §6, establishing the shared reference-data pattern (searchable tree list + side-panel editor) as reusable structure that the Tags and Members pages (kata `z7t0`) will instantiate next. Enables the Categories sidebar item.

## Plan Context

- Ground truth (read before starting): `docs/webui-design.md` §6 Reference data (the pattern; "Categories: economic-intent badge per row; the editor requires intent and explains its classification effect in one line"), Theme-Agnostic Presentation Rules (affordance classes), Tables and filtering, Hidden entities; `docs/webui-theme-arcade-cabinet.md` (RowActions treatment, badges, tooltips); `docs/frontend-architecture.md` (package boundaries, URL state, refresh rules); `docs/accounting-semantics.md:46-105` (economic-intent reporting treatments — source for the one-line classification-effect explanations).
- Frontend-only (FE). Uses existing category APIs only — no backend changes.
- API surface (all in the generated client, re-exported via `@/api`): `listCategories` (`include_hidden`, `sort=fqn`, `limit` ≤500), `createCategory` (`{fqn, economic_intent, is_hidden?}`), `updateCategory` (PATCH — body carries ONLY `is_hidden`; intent is immutable, rename is restructure-only), `deleteCategory` (tombstone, 409 on active dependents), `listCategoryGroups` (shared `GroupState`: `fqn`, `parent_fqn`, `level`, `is_hidden` — NO `deletable`), `setCategoryHiddenByPath`, `restructureCategories` (`{from_fqn, to_fqn}` → `moved_count`). `Category` DTO: `category_id`, `fqn`, `economic_intent`, `is_hidden`, `parent_fqn`, `name`, `level`. Intent enum: `expense`, `fee`, `income`, `refund`, `transfer`, `exchange`, `adjustment`, `fx_gain_loss`.
- Pattern source — the Accounts page (read these files first): `pages/accounts-page.tsx` (orchestration: URL state, panel/dialog state, focus restoration, toast, restructure submit), `features/accounts/accounts-page-content.tsx` (`readAccountsSearchState`, toolbar with search + include-hidden `aria-pressed` eye toggle), `features/accounts/accounts-tree.tsx` (tree derivation from flat leaves + groups: `accountTreeRows`, `compareFqnPath`, `groupByFqn`; `RowActions` wiring; delete confirm dialog with focus trap), `features/accounts/accounts-side-panel.tsx`, `features/accounts/use-accounts-resource.ts` (+ `store/accounts.ts`) for the snapshot/refresh pattern. `features/hierarchy/restructure-dialog.tsx` is already entity-agnostic (props `entityLabel`, `fromFqn`, `hint`, `onSubmit`, `errorMessage`) — reuse it directly with `entityLabel="Category path"` and `restructureCategories`.
- Reusable-structure requirement: extract the §6 pattern so `z7t0` (Tags/Members) can instantiate it without copying the accounts page again. Put the shared, Mina-specific reference-page structure in a new `frontend/src/features/reference/` area (per package boundaries: feature code, not generic `components/`): a reference tree list parameterized by an entity adapter (rows from flat entities + group states, FQN search filter, include-hidden, per-row indicator/badge slot, per-row `RowActions` builder, row click → editor) plus the toolbar and page scaffolding pieces that are entity-agnostic. Categories-specific code (intent badge, editor fields, API calls, snapshots) stays in categories modules. Do NOT retrofit the accounts page onto the new structure (out of scope); keep the extraction only as generic as these reference pages need.
- Design decisions:
  - Columns/row content: indented name via `FqnPath` (leaf emphasized), economic-intent badge per leaf row (`IntentBadge` — net-new descriptive indicator; map intents to the existing class accent tokens where they parallel: income→income/mint, refund→refund/teal, transfer→transfer/sky, exchange→exchange/magenta, adjustment→adjustment/yellow, fx_gain_loss→muted outline; expense and fee use the neutral white/band chip like the `spend` class badge), standard eye-off hidden indicator on the row, trailing actions column. Group rows carry no badge.
  - Row actions per the affordance rules: hide/unhide persistent flat toggle (leaf via `updateCategory`; group via `setCategoryHiddenByPath`), "Move or rename" hover-revealed icon button opening the shared `RestructureDialog` wired to `restructureCategories` (success toast "Moved N categor(y/ies).", bulk refresh). NO delete row action: categories expose no deleteability info and no delete-by-path endpoint — delete lives in the editor (reactive 409), group rows get no delete at all.
  - Row click opens the side-panel editor for the leaf (accounts pattern); group-row click may open create prefilled with the prefix or do nothing — pick the accounts-consistent behavior. Rows do not navigate (category drill-down pages are out of scope).
  - Side-panel editor: create mode — FQN (full path input), required economic intent picker, hidden checkbox, and a one-line plain-language explanation of the selected intent's classification effect (derive the copy from the reporting-treatment table in `docs/accounting-semantics.md:51-60`, e.g. income → "Counts toward income totals."); edit mode — FQN and intent read-only (rename via move/rename; intent immutable), hidden toggle, Delete button with a confirmation dialog naming the category FQN and the tombstone consequence; 409 (category in use) surfaced as the standard error in the dialog.
  - Toolbar: full-path search + include-hidden eye toggle (gm9d pattern, `aria-pressed`), URL params `q` and `hidden` per the shareable-state rule. No intent filter (not in the §6 spec).
  - New store module `store/categories.ts` (snapshot `{categories, groups, loadedAt}`) + `use-categories-resource.ts` with `refreshCategoriesAfterMutation`: always refresh the page snapshot and `refreshLedgerLookups()` (filter dimension + record display use it); invalidate the intent-keyed category-picker caches in `store/transactions.ts` (new invalidator — none exists today); for restructure/bulk also invalidate transaction pages and month totals (renames change displayed FQNs).
  - Nav: flip the Categories item (`app-shell.tsx:40`) to enabled; route `/categories` in `pages/router.tsx`.
- Demo data (e2e fixture base): the demo seeder (`internal/services/demo/demo.go:186-230`) provides ~29 categories covering every intent and multi-level FQNs (`Housing:Mortgage:Principal` transfer vs `...:Interest` expense, etc.). e2e conventions per `frontend/tests/e2e/accounts-page.spec.ts` (raw-API fixture reads, `createCategory` helper exists in `transactions-page.spec.ts:185-198`).
- Protect — do not regress: entry-panel category picker and transactions filter behavior (they share the lookups/picker caches you will be invalidating); accounts page and its e2e; app-shell nav (other items stay disabled); `just test-frontend-e2e` green.
- Scope exclusions: no Tags/Members pages (kata `z7t0`), no category drill-down pages, no intent filter, no changes to accounts features, no backend/API changes, no ground-truth doc edits.

## Tasks

### Task/Commit 1: Categories page foundation — route, nav, snapshot, toolbar, tree list

After this commit `/categories` renders the searchable category tree with intent badges, hidden indicators, include-hidden toggle, and URL-backed search — read-only (no actions yet), built on the new reusable reference structure.

- [x] Add `store/categories.ts` snapshot module + `features/categories/use-categories-resource.ts` (loader with the accounts retry/generation pattern; `refreshCategoriesAfterMutation` per Plan Context).
- [x] Create the shared reference structure in `frontend/src/features/reference/` (tree-row derivation from flat leaves + groups with FQN-prefix expansion, search filter, include-hidden filtering, sorted by FQN path; toolbar with search + include-hidden toggle; table shell consistent with the accounts tree's theme treatment) parameterized by an entity adapter, and instantiate it for categories.
- [x] Add `IntentBadge` (descriptive indicator per the token mapping in Plan Context, tooltip naming the intent) and render it on leaf rows.
- [x] Register `/categories` in the router; enable the Categories nav item.
- [x] New e2e `frontend/tests/e2e/categories-page.spec.ts`: page renders the demo tree grouped by hierarchy with intent badges; search narrows by full path (URL `q`); include-hidden toggle reveals a hidden category (create one via raw API) with the eye-off indicator and `?hidden=true`.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Row actions — hide toggles and move/rename restructure

After this commit rows carry the trailing actions column: hide/unhide flat toggles (leaf and group) and the move/rename action using the shared restructure dialog.

- [x] Wire `RowActions` per the affordance rules: leaf hide/unhide toggle (`updateCategory`), group hide/unhide toggle (`setCategoryHiddenByPath`), move/rename hover-revealed icon button on leaf and group rows → shared `RestructureDialog` → `restructureCategories`, success toast with `moved_count`, errors surfaced in the dialog; every mutation runs `refreshCategoriesAfterMutation` (restructure with the bulk invalidation).
- [x] e2e: hide a leaf from the row (disappears; reappears under include-hidden), group hide toggles the subtree; move/rename a subtree via the dialog asserting the POST and the tree re-render; verify a rename is reflected in the transactions filter category options after navigation (lookups invalidated).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Side-panel editor — create, edit, delete; wrap-up

After this commit the page meets the full §6 acceptance: create/edit in a side panel with required intent and its one-line classification effect, tombstone delete with confirmation, and the page is reflected in PROJECT_STATE.

- [x] Side-panel editor per Plan Context design decisions (create: FQN + required intent + hidden + intent-effect line; edit: read-only FQN/intent, hidden toggle, Delete with confirm dialog naming the FQN; 409 surfaced; focus restoration to the opener per the accounts panel pattern; "New category" header action opens create).
- [x] Row click opens the editor (leaf); dedupe/validate FQN conflicts via the API error mapping (no client-side re-validation of server rules).
- [x] e2e: create a category (appears in tree with badge); edit hidden state; delete an unused category through the confirm dialog; attempt deleting a demo category in use and assert the 409 error message renders in the dialog.
- [x] Update `PROJECT_STATE.md`: Categories reference page shipped (one line, fold into the web UI bullet).
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
- [x] Run `just review-loop "Categories reference page (kata s5nw) per webui-design §6: reusable reference tree structure in features/reference instantiated for categories; searchable FQN tree with intent badges and hidden indicators; include-hidden eye toggle; URL-backed q/hidden; row actions (hide toggles leaf/group, move/rename via shared RestructureDialog + restructureCategories); side-panel editor with required intent + one-line classification effect, tombstone delete with confirm + 409 surfacing; nav enabled; lookups/picker caches invalidated on mutations. Constraints: frontend-only; no ground-truth doc edits; no delete row action (no deleteability API for categories); accounts page untouched; no drill-down pages."`
- [x] Move this plan to `docs/plans/completed/`
