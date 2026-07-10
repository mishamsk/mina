# Plan: Stabilize the transactions filter toolbar (`qwjb`)

Make the transactions filter toolbar geometrically stable: the Add-filter trigger becomes a square 36×36 icon-only button aligned with the search and date controls, active filter chips render immediately to its right in the same wrapping row, and adding/removing filters neither moves the trigger nor causes avoidable vertical toolbar jumps.

## Plan Context

- Ground truth: `docs/webui-design.md` — one header pattern per page with the filter/toolbar row beneath; controls are never icon-only except with tooltips; `FilterBar`/`FilterChip` are URL-backed typed filters. `docs/webui-theme-arcade-cabinet.md` — icon-button affordance treatment (outline, hard shadow, press-in).
- Current defects (TX-2 audit, Kata `qwjb`):
  - The trigger is a default-size text button (`frontend/src/features/ledger/transaction-filter-controls.tsx:695-699` — `<Filter/> Add filter`), 130×32, misaligned with the 36px (`h-9`) search input and Go-to-day date input in the toolbar (`frontend/src/pages/transactions-page.tsx:290-325`).
  - The component root is `flex flex-col gap-3` with active chips rendered in a separate block below the trigger (`transaction-filter-controls.tsx:683,~738`), so the first added chip inserts a new row: the toolbar grows and the trigger row shifts.
- Target behavior per the kata acceptance:
  - Square 36×36 icon-only trigger (filter glyph), `aria-label="Add filter"`, tooltip "Add filter", aligned on the same baseline/row as the search and date controls (their labeled-column layout must be respected — the trigger aligns with the control row, not the labels).
  - Active filter chips render immediately to the right of the trigger, in the same horizontally wrapping row; chip wrap may grow the toolbar only when a row genuinely runs out of horizontal space (unavoidable), never on the first chip.
  - Adding/removing filters keeps the trigger in place: no horizontal displacement of the trigger when chips appear/disappear, no vertical jump for the first chip row.
- Keyboard/focus: the popover trigger keeps its focus behavior; chips stay keyboard-removable as today; tooltip must not interfere with popover open state.
- Protect — do not regress: the filter popover editor flows (dimension selection, entity pickers, range editors, Escape handling per `transaction-filter-controls.tsx:700-716`); URL-backed filter state; chip remove behavior; search/date-jump controls; transactions browser behavior below the toolbar; existing `transactions-page.spec.ts` coverage; the entry side panel layout.
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `qwjb`.

## Tasks

### Task/Commit 1: Icon trigger, inline chips, stable geometry

- [x] Replace the Add-filter text button with a 36×36 icon-only button (filter glyph, `aria-label="Add filter"`, tooltip) using the standard icon-button affordance, vertically aligned with the search/date control row in the transactions toolbar.
- [x] Move active filter chips inline: immediately right of the trigger in the same wrapping row; no separate chips block; removing the last chip returns the toolbar to its chipless geometry without shifting the trigger.
- [x] Keep popover, chip removal, URL state, and keyboard/focus behavior intact.
- [x] Extend `frontend/tests/e2e/transactions-page.spec.ts` with geometry assertions: the trigger is 36×36 and its bounding box (and the toolbar height) is unchanged after adding one filter chip and after removing it; the chip renders to the right of the trigger on the same row; keyboard filter add/remove still works. Use measured geometry, not class names.
- [x] Update `PROJECT_STATE.md` only if it describes the filter toolbar's shape (likely no change).
- [x] Update the ledger feature package doc only if a non-obvious contract emerges.
- [x] Add Kata `qwjb` progress and verification evidence.
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
- [x] Run `just review-loop "Stabilize the transactions filter toolbar: 36x36 icon-only Add-filter trigger aligned with search/date controls, chips inline to its right in the same wrapping row, no toolbar jumps on add/remove; popover flows, URL filters, and keyboard behavior unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `qwjb` only after the plan is moved to completed
