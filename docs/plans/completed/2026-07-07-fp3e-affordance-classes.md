# Plan: Align web UI with affordance-class and action-placement design rules — Kata issue `fp3e`

Bring the implemented UI in line with the affordance-class and action-placement rules in `docs/webui-design.md` (Theme-Agnostic Presentation Rules → affordance classes; Entity chips; Tables and filtering) and `docs/webui-theme-arcade-cabinet.md` (Component Notes → affordance classes / RowActions): a shared `RowActions` cluster, one trailing rightmost actions column in every table, hover/focus-revealed icon-button actions, the updated narrow-screen column-collapse ladder with an actions overflow (⋯) fold, and category/tag/member chips that filter in place.

## Plan Context

- Ground truth (read before starting): `docs/webui-design.md` §Theme-Agnostic Presentation Rules (three affordance classes), §Entity chips, §Tables and filtering (trailing actions column, collapse ladder), §Inline editing; `docs/webui-theme-arcade-cabinet.md` §Component Notes (affordance classes / RowActions treatment, tooltips); `docs/frontend-architecture.md` (package boundaries, URL-backed table state).
- Frontend-only (FE) scope. No backend/API changes. No edits to ground-truth docs (`docs/webui-design.md`, `docs/webui-theme-arcade-cabinet.md`, `docs/frontend-architecture.md`, `docs/architecture.md`, `docs/business-requirements.md`).
- Current state (line numbers as of this plan's commit):
  - Transactions table (`frontend/src/features/ledger/transaction-browser.tsx`): the only per-row action, "Open transaction detail", renders mid-row inside the Description cell (`:637-649`) as an always-visible ghost icon button. Columns end at Amount (colgroup `:468-477`); there is no actions column.
  - Collapse ladder (`frontend/src/styles.css` `@layer components` `:207-382`, container `transactions-table` `:208-210`): current order as width shrinks is status@1120 → member@920 → tags@760 → category@640. The design doc now requires: member first, then status, then row actions fold into a single overflow (⋯) menu, then tags, then category. There is no row-level overflow menu anywhere today.
  - Accounts tree (`frontend/src/features/accounts/accounts-tree.tsx`): has an "Actions" column (`:351-356`, cell `:463-483`, single always-visible `variant="outline"` "Move or rename" icon button) followed by a "Hidden" column (`:357-362`, `:484-493`) — so the actions column is not the rightmost trailing column.
  - Entity chips are plain markers with tooltips, never interactive: category leaf chip via `FqnPath` `variant="leaf-chip"` (`frontend/src/features/ledger/fqn-path.tsx:30-43`, used in the Category cell `transaction-browser.tsx:653-658`), `TagChip` (`frontend/src/features/ledger/tag-chip.tsx:13-34`; row line `TagChipsLine` `transaction-browser.tsx:185-290`; detail records `RecordTagSet` `transaction-detail-panel.tsx:127-145`), `MemberChip` initials chip (`transaction-browser.tsx:292-299`).
  - Transactions filters are URL-backed repeated integer-id params (`category`, `tag`, `member`) — read/write in `frontend/src/features/ledger/transaction-page-position.ts:77-84,139,151,162,180-188`; the page writes them via `setTransactionFilters` (`frontend/src/pages/transactions-page.tsx:167-175`). `TransactionBrowser` already has row→page callback plumbing to follow: `onOpenTransaction` prop (`transaction-browser.tsx:44`, wired at `transactions-page.tsx:313`).
  - The account/group register has no filter bar (pagination only — `account-register-table.tsx:498-543`); its peek panel reuses `TransactionDetailContent` (`frontend/src/features/accounts/account-peek-panel.tsx:96`), so the only entity chips there are the per-record tag chips. The Overview recent-activity list renders no entity chips at all (`overview-dashboard.tsx:352-444`).
  - Existing e2e coverage that WILL need updating: `frontend/tests/e2e/transactions-page.spec.ts` — collapse-ladder test "transactions page collapses low-priority columns instead of scrolling horizontally" (`:886`, invariant chain `:1049-1057`, member-at-1000 assertion `:1060`), open-detail button tooltip/focus assertions inside "transactions page help and leaf category chips" (`:1241`, `:1319-1329`); `frontend/tests/e2e/accounts-page.spec.ts` — move/rename button interactions (`:855`, `:939`).
- Theme treatment contract for row actions (`docs/webui-theme-arcade-cabinet.md` §Component Notes → Affordance classes): button-class row actions are compact square icon buttons, revealed on row hover and row focus, outline-only at rest — never `--shadow-chip` at rest — gaining the chip shadow on hover and pressing in on activation; disabled ones use `--muted-foreground` outline and glyph with an explanatory tooltip; the overflow (⋯) control uses the same icon-button treatment. Flat toggle icons are persistent bare glyphs (`--muted-foreground` off, accent on, hover ink, tooltips). Entity chips keep their ink outline + `--shadow-chip` and add an instant hover step.
- Scope boundaries (do NOT do these here):
  - No new accounts row actions: delete, hide/unhide toggle, featured star, and the hidden-column redesign belong to kata `gm9d` (blocked by this issue). This plan only makes the existing move/rename action live in a proper trailing rightmost actions column with the standard treatment. The `RowActions` component must nevertheless support flat toggle icons and disabled buttons so `gm9d` can add them without rework.
  - Keep accounts row-click → edit panel, name-cell links, and the "Group" pill exactly as they are.
  - No Overview changes (it has no entity chips), no templates/"Use" action, no register filter bar, no API changes, no inline-editing changes.
- Protect — do not regress: single-height transaction lines and the tag-chip clipping/overflow ("…") logic; whole-row expand on click / Space, Enter opens detail, ArrowUp/Down row navigation in transactions and registers; detail panel deep links (`?transaction=`); existing filter bar add/remove behavior and URL params; banded rows and stable percentage column widths; accounts restructure flows and their e2e; chip shadows staying unclipped; tooltips on all icon-only controls.

## Tasks

### Task/Commit 1: `RowActions` component and the transactions trailing actions column with the updated collapse ladder

Introduces the shared trailing-actions mechanics and applies them to the transactions table: a `RowActions` cluster component, an Actions column as the rightmost transactions column holding the open-detail action, and the reordered narrow-screen collapse ladder including the actions→overflow fold.

- [x] Add a shared `RowActions` component (generic, presentational — `frontend/src/components/row-actions.tsx` per package boundaries). API takes an ordered list of button-class actions (icon, label, onSelect, optional disabled + disabled tooltip text) and (for `gm9d` readiness) flat toggle icons (icon per state, pressed/unpressed, accent-on treatment). Rendering per the theme contract above: compact square icon buttons, outline-only at rest with no chip shadow, chip shadow on hover, press-in on activation, tooltip on each; toggles as persistent bare glyphs; disabled buttons muted with an explanatory tooltip. It must support a "folded" presentation: a single overflow (⋯) icon button (same treatment) opening a menu listing all button-class actions with their labels; whether the cluster or the ⋯ control shows is decided by the table's collapse ladder (container query), not by action count.
- [x] Hover/focus reveal: button-class actions in `RowActions` are hidden at rest and revealed when the containing row is hovered or contains focus; they must stay in the accessibility tree and be keyboard-focusable (revealing via focus), and must not cause layout shift. Flat toggles stay always visible.
- [x] Transactions table: add a narrow trailing Actions column as the rightmost column (headerless or visually quiet header consistent with the status column's approach); move the "Open transaction detail" action from the Description cell into it via `RowActions`; remove the mid-row button. Rebalance the fixed percentage column widths (`frontend/src/styles.css` colgroup rules) so layout stays stable. Row-click/keyboard behavior is unchanged; actions must not trigger row expansion (follow the existing `isInteractiveTarget` guard).
- [x] Reorder the collapse ladder in `frontend/src/styles.css` to the design-doc priority: as width shrinks, member collapses first, then the status marker, then row actions fold into the single overflow (⋯) menu, then tags, then category. Class, Date, Description, Amount, and the Actions column itself never disappear — the actions column only folds to ⋯, never vanishes. Keep the container-query mechanism; pick breakpoints consistent with the current ones.
- [x] Update `frontend/tests/e2e/transactions-page.spec.ts`: collapse-ladder test asserts the new order (category ⇒ tags ⇒ actions-folded ⇒ status ⇒ member as the implication chain) and that the open-detail action remains reachable through the ⋯ menu when folded; open-detail assertions target the trailing actions column and cover hover/focus reveal (hidden at rest, revealed on row hover and on focus).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Accounts tree — actions column becomes the trailing rightmost column with the standard treatment

Aligns the chart-of-accounts table with the action-placement rule using the Task 1 mechanics. After this commit the accounts table's Actions column is the rightmost column and move/rename follows the standard hover-revealed icon-button treatment.

- [x] Reorder the accounts tree columns (`frontend/src/features/accounts/accounts-tree.tsx`) so the Actions column is the rightmost trailing column (the Hidden indicator column moves inboard of it; its content/width redesign stays out of scope for `gm9d`).
- [x] Render the move/rename action through `RowActions`: hover/focus-revealed, outline-only at rest (no chip shadow at rest), chip shadow on hover, press-in, tooltip kept ("Move or rename"), still not triggering the row's edit-panel click (`stopPropagation` behavior preserved). Focus restoration after the restructure dialog closes must keep working.
- [x] The accounts table gets no overflow fold (its narrow-screen behavior is unchanged in this plan); do not add new actions.
- [x] Update `frontend/tests/e2e/accounts-page.spec.ts` move/rename interactions for the reveal behavior and new column position; add a cheap assertion that the Actions column is the last column.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Entity chips filter in place

Category, tag, and member chips become filter affordances per the Entity chips rule: activating a chip adds that entity to the embedding browser's filter set; embeddings without a filter bar open Transactions with the filter applied. Chips never navigate to entity pages and never start inline editing.

- [x] Make the three chip renderers activatable (button semantics, keyboard operable, tooltip kept, ink outline + `--shadow-chip` kept, instant one-step hover fill per the theme): category leaf chip (`FqnPath` leaf-chip usage in the transactions Category cell), `TagChip` (row micro chips in `TagChipsLine` and detail `RecordTagSet`; the "…" overflow chip stays a non-interactive indicator), `MemberChip`. Where a chip renders in a context with no activation behavior wired, it must fall back to the current non-interactive marker rendering — never a dead button.
- [x] Transactions page (rows + detail panel): chip activation adds that entity id to the corresponding URL filter param (`category` / `tag` / `member`) via a new callback threaded like `onOpenTransaction` (browser prop → `transactions-page.tsx` `setTransactionFilters`), deduplicating ids already in the filter set and resetting to the first page per existing filter-change behavior. The added filter appears as the standard removable typed filter chip in the filter bar. Chip activation must not toggle row expansion or open the detail panel; in the detail panel the panel stays open while the underlying list filters.
- [x] Account/group register peek panel (embedding without a filter bar): tag chip activation in the peeked transaction opens Transactions with that tag filter applied (navigate to `/transactions` with the corresponding repeated-id param). No register filter bar is added.
- [x] Amount chips and all indicators (class icons, status markers, hidden markers, type badges, mixed sentinels) stay non-interactive; verify none of them gained hover/press affordances.
- [x] e2e (`frontend/tests/e2e/transactions-page.spec.ts`, register spec where the peek panel is covered): clicking a row category chip adds the category filter chip and URL param and narrows the list without expanding the row; activating a tag chip in the detail panel adds the tag filter while the panel stays open; activating a tag chip in a register peek panel lands on Transactions with the tag filter chip active.
- [x] Update `PROJECT_STATE.md`: fold the affordance-class alignment (trailing row-actions columns, hover-revealed row actions, chips-as-filter-affordances) into the existing web UI bullet(s) — keep it to a line or two.
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
- [x] Run `just review-loop "Align web UI with affordance-class and action-placement rules (kata fp3e): shared RowActions cluster; trailing rightmost actions column in transactions and accounts tables; open-detail moved out of the description cell; hover/focus-revealed icon buttons with no chip shadow at rest; collapse ladder reordered to member, status, actions-fold-to-overflow, tags, category; category/tag/member chips filter in place (URL filter params), register peek chips open Transactions with the filter. Constraints: frontend-only; no ground-truth doc edits; no new accounts row actions (delete/hide/featured belong to gm9d); chips never navigate to entity pages; indicators stay non-interactive; single-height rows and keyboard table driving preserved."`
- [x] Move this plan to `docs/plans/completed/`
