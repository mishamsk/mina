# Plan: Entity list keyboard navigation and focus styling (feedback fleet, Brief A)

## Goal

Every entity table (Categories, Tags, Templates, Accounts tree, Members, Recurring definitions, account and group registers, the Transactions browser, and the Status audit log) is a single Tab stop whose rows are walked with the keyboard: Up/Down move the active row, Home/End jump to the first and last row, Enter/Space activate the row exactly as a plain click does, the active row is highlighted with the table's hover fill instead of the purple focus ring, keyboard-selected rows scroll into view inside their designated scroller, and nested row controls remain reachable by Tab from the active row.

- One generic roving-rows hook shared by all lists; one shared `isInteractiveTarget` helper replacing four private copies.
- Design docs state the rule; package docs record the contract.

## Constraints

- No Kata issue; this is Brief A of `docs/plans/2026-09-14-p1-p2-feedback-fleet.md`.
- Root causes (operator-verified live at 1280×633: Tab lands on the first row, then on its link and action buttons; two ArrowDown presses scroll the container 80px with focus unmoved; the row shows the `--ring` outline):
  - Every row has `tabIndex={0}` (reference-tree, accounts-tree, members, recurring, register, transaction browser, audit log), so the table is N tab stops and `frontend/src/styles.css` (the `[tabindex]:not([tabindex="-1"])` entry in the `:focus-visible` opt-in list) paints the ring on each row.
  - Four lists never handle arrow keys, so the browser scrolls the nearest scroller.
- Implementation shape:
  - `frontend/src/hooks/use-roving-rows.ts` (generic; allowed by the hooks boundary): inputs are a rows resolver (container ref + row selector), optional `onActivate(index, row, event)` and `onActiveChange(index, row, event)`; outputs per row `tabIndex` (0 only for the active index, default 0), `onKeyDown`, `onFocus` (adopt the index on click or programmatic focus), and `data-active`. Keys: ArrowUp/ArrowDown clamped (no wrap), Home/End, Enter/Space → `onActivate`; every handled key calls `preventDefault`. Movement: `scrollIntoView({ block: "nearest" })` then `focus({ preventScroll: true })`. Ignore keys whose target is a nested control (`isInteractiveTarget`). Clamp the active index when rows shrink so the existing removed-row focus fallbacks keep working.
  - Promote one copy of `isInteractiveTarget` to `frontend/src/components/link-activation.ts` beside `activateRowLink`; delete the private copies in `reference-tree.tsx`, `account-register-table.tsx`, `transaction-browser.tsx`, and `recurring-page-content.tsx`.
  - Apply the hook in: `features/reference/reference-tree.tsx` (link rows via `rowHref` and side-panel rows via `onRowClick`), `features/accounts/accounts-tree.tsx`, `features/members/members-page-content.tsx`, `features/recurring/recurring-page-content.tsx` (also add the missing interactive-target guard on its row `onClick`), `features/accounts/account-register-table.tsx` (keep its "re-open detail for the walked row" side effect; add Space for parity), `features/ledger/transaction-browser.tsx` (keep Shift+Arrow selection extension and Edit-mode Enter/Space semantics), `features/status/status-audit-log.tsx` (replace its `tr[tabindex='0']` queries with a data attribute selector; add scroll-into-view). Link rows keep delegating activation to `activateRowLink` so modified clicks and middle-click keep native behavior; opener rows keep passing the `tr` as opener.
  - Extend the existing compact-shell `scroll-mb-[calc(5.5rem+env(safe-area-inset-bottom))]` row class to the reference, accounts, members, and recurring rows so keyboard walks stay above the fixed toolbar everywhere.
  - Do not edit the global `:focus-visible` selector; opt rows out with `focus-visible:outline-none` and delete the explicit ring classes on register, browser, and audit-log rows. Keep the transient date-jump highlight in the transaction browser as is.
  - Out of scope: the account-summary scroll region on the account page keeps its tab stop and keyboard scrolling.
- Design spec (from `docs/webui-design.md` table rules and `docs/webui-theme-arcade-cabinet.md` focus and hover bullets): the active row shows the same instant fill step as hover (`color-mix(in srgb, var(--band), var(--table-header) 28%)`; the transaction browser keeps its even-row `--card` mix and the audit log its interactive-bright mix), applied through `data-[active=true]:` or `focus-within:` with no transition; no outline, no border change, no geometry change; Edit-mode selection tint and checkbox semantics are untouched; a row that gains focus by click adopts the active index without any extra visual; hover on a non-active row still shows its hover fill.
- Help groups: add `↑ ↓` (move row), `Home`/`End` (first/last row) entries to the reference, accounts, members, and recurring groups, and Home/End to the register and browser groups, using the Status page wording precedent.
- Docs: one clause in the Keyboard bullet of `docs/webui-design.md` (tables are one Tab stop; Home/End; nested controls reachable by Tab from the active row) and one clause in the Focus bullet of `docs/webui-theme-arcade-cabinet.md` (the active row of a roving-tabindex table shows the hover fill, not the ring); package docs for components, hooks, reference, accounts, members, templates, recurring, ledger, status via the `write-package-docs` skill; `PROJECT_STATE.md` unchanged unless a bullet describes row keyboard behavior.
- Testing policy (mandatory): `docs/FRONTEND-TESTING.md` governs. Do not add e2e tests; reviewers must not request coverage; fold any missing assertion into an existing journey. Specifically: extend the register keyboard journey in `frontend/tests/e2e/accounts-page.spec.ts` ("account register walks transaction detail by keyboard") with Home/End, and add a Tab-then-ArrowDown-then-Enter assertion to an existing Categories row journey in `frontend/tests/e2e/categories-page.spec.ts`; nothing else. Net e2e test count must not increase. No REST calls as action or evidence, no matrices, no geometry assertions, no fixed waits.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo` at 1280×633 in chromium and webkit: on Categories, Tab from the toolbar lands on the first row as the only table stop; ArrowDown/ArrowUp move the active row with the hover fill and no ring; Home/End jump; Enter opens the row's destination; Tab from the active row reaches its name link and action buttons; a row out of view scrolls into view on keyboard selection. The same holds on Accounts, Tags, Templates (Enter opens the editor panel), Members, Recurring (Enter opens the editor), a register, the Transactions browser (browse and Edit mode), and the Status audit log.
- [x] Screenshots of an active row on Categories and on the Transactions browser are attached to the completion report and match the design spec.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e` passes (full suite: shared row behavior changed) with the e2e test count unchanged.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-entity-list-keyboard.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report. Reviewers must not request added coverage.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Shared roving-rows hook and interactive-target helper

- [x] Hook and helper exist with package docs; no list uses them yet.
- [x] Commit as `feat(hooks): add a roving-tabindex table row hook`.

### Task 2: Reference lists (Categories, Tags, Templates, Accounts tree, Members, Recurring)

- [x] All six lists use the hook, the active-row fill, no ring, scroll margins, and updated help groups; link rows keep native modified-click behavior; opener rows keep focus recovery.
- [x] Commit as `fix(frontend): walk entity list rows with roving keyboard focus`.

### Task 3: Registers, Transactions browser, audit log

- [x] The three detail-panel or selection lists use the hook while preserving their walk side effects and Edit-mode semantics; explicit ring classes removed.
- [x] Commit as `fix(frontend): roving row focus for registers, transactions, and the audit log`.

### Task 4: Docs and folded assertions

- [x] Design doc clauses, package docs, and the two folded e2e assertions are in place; `just prose-fmt` run.
- [x] Commit as `docs(frontend): document roving row focus and active-row styling`.
