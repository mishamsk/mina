# Plan: Transactions toolbar redesign — dedicated filter bar, X dismiss, icon day-nav (Kata d8z6, bqc9)

Redesign the transactions toolbar per the amended `docs/webui-design.md` (operator commit on this branch — read the "Tables and filtering" filter-bar bullets and the Transactions "Toolbar:" line first; they are the ground truth for this task): filter chips move out of the toolbar row into a dedicated full-width filter bar beneath it, the Filter button becomes an X while the bar is open, day-step controls become icon-only square buttons, and the Clear-all semantics question (`bqc9`) is resolved as "X clears chip-backed dimensions only; standing search and class controls survive".

## Plan Context

- Kata issues: `d8z6` (redesign) and `bqc9` (Clear-all semantics, folded in per its comment). One sub-branch.
- MANDATORY pre-reads: the amended `docs/webui-design.md` sections named above (do NOT edit the doc further — the operator owns it), `docs/webui-theme-arcade-cabinet.md` (icon buttons, shadows, press feedback), `docs/frontend-architecture.md`, `docs/TESTING.md`.
- Current implementation (post-5qj0/d9hq consolidation):
  - `frontend/src/features/ledger/transaction-browser-toolbar.tsx` (142 lines) — the shared toolbar row: search field, "PREVIOUS DAY"/"NEXT DAY" text buttons + date input, themed class Select, used by `pages/transactions-page.tsx:224` area and `features/reference/reference-drilldown-page.tsx:442` area (extra-controls slot carries the drill-down's exact-scope checkbox).
  - `frontend/src/features/ledger/transaction-filter-controls.tsx` (1003 lines) — Filter trigger button (`:708-717`), Add-filter popover/dimension editors, chips row, "Clear all" (`:984-996`, shown when `activeFilterCount > 1`). Today chips accumulate inside/below the toolbar row and inflate it.
- Redesign (decided; matches the amended design doc):
  - Toolbar row hosts: search, icon-only square previous/next day buttons (chevron glyphs, keep accessible names "Previous day"/"Next day"), go-to-day date input, themed class Select, and the Filter toggle button — one stable-height row that never grows when filters exist.
  - The Filter toggle opens/closes a dedicated full-width filter bar rendered directly beneath the toolbar row (both on the transactions page and inside the drill-down embedding — it lives in the shared components, landing once). The Add-filter menu and all typed filter chips render inside that bar.
  - While the bar is open the Filter toggle renders as an X icon button (same square footprint, tooltip "Close filters" or similar); activating it closes the bar AND clears every chip-backed filter dimension. It replaces the "Clear all" text control — remove that control.
  - bqc9 semantics (decided): the X never touches the standing search input or the class dropdown; they clear only through their own affordances. This replaces today's inconsistent Clear-all (which silently reset class but kept search).
  - Auto-open: the filter bar is open whenever chip-backed filters are active (deep links, chip activation from rows/panels) and stays closed otherwise until the user opens it. Dismissing via X (which clears chips) therefore closes it consistently.
  - The d9hq themed Select already fixed the class-dropdown shadow; verify the Filter toggle, class trigger, date input, and day-step buttons share consistent heights/shadows so the row is visually aligned (the original d8z6 alignment complaint).
- Keep the day-jump BEHAVIOR unchanged: `1c5v` (go-to-day apply bug and day-stepping breakage) is a separate later task — do not attempt behavioral fixes to date jumping here, and do not regress existing day-jump e2e.
- e2e: update existing toolbar specs deliberately for the new structure, preserving each spec's behavioral intent: chips-related flows now interact inside the filter bar; the "stable inline trigger geometry" spec (`transactions-page.spec.ts:1247`) re-targets the new invariant (toolbar row height stable with/without active filters; toggle keeps its footprint); "Previous/Next day" interactions keep working via unchanged accessible names. Add new coverage:
  - X dismiss: with chips + search text + class selected, activating X closes the bar, clears chip dimensions (URL updated), search text and class remain (bqc9), and the Filter toggle returns to its filter glyph.
  - Auto-open: deep-link URL with an entity filter renders the bar open with the chip; chip activation from a row opens the bar.
  - bqc9 minor: after a multi-class URL, the next class change normalizes the URL to a single class param (assert it).
  - Drill-down embedding shows the same bar behavior (one representative assertion in `reference-drilldowns.spec.ts`).
- Docs: no further ground-truth edits. Update `frontend/src/features/ledger/PACKAGE.md` if the toolbar/filter-controls contract line changes. PROJECT_STATE.md: not needed (UI refinement of an existing capability) — skip unless a capability line literally describes the old toolbar.
- Do not add new filter dimensions or change filter query semantics; this is presentation/interaction restructuring plus the bqc9 semantics decision.

## Tasks

### Task/Commit 1: Toolbar row + dedicated filter bar restructure

- [x] Restructure `transaction-browser-toolbar.tsx` + `transaction-filter-controls.tsx` per the design in Plan Context: stable-height toolbar row (search, icon-only day-step buttons, date input, class Select, Filter/X toggle) and the full-width filter bar beneath (Add-filter menu + chips), wired identically for the transactions page and the drill-down embedding.
- [x] Implement X-dismiss semantics (close bar + clear chip-backed dimensions only; remove the Clear all control) and auto-open on active chip-backed filters.
- [x] Verify visual alignment of the toolbar row controls (heights, shadows, square day-step buttons per the theme doc).
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if contracts changed.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issues `d8z6` and `bqc9` (`kata comment ... --agent`)
  - [x] Commit changes

### Task/Commit 2: e2e alignment and new coverage

- [x] Update existing toolbar/chips/geometry specs to the new structure per Plan Context, preserving behavioral intent; keep day-jump specs passing unchanged.
- [x] Add the new e2e coverage listed in Plan Context (X dismiss incl. bqc9 semantics, auto-open, multi-class URL normalization, drill-down bar parity).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issues `d8z6` and `bqc9`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Transactions toolbar redesign (kata d8z6, bqc9): stable-height toolbar row (search, icon-only chevron day-step buttons, go-to-day input, themed class Select, Filter/X toggle) with a dedicated full-width filter bar beneath hosting Add-filter and chips; X dismiss closes the bar and clears chip-backed dimensions only — standing search and class survive (bqc9 decision); auto-open on chip-backed filters; Clear all control removed; shared components so transactions page and drill-down get it once; webui-design amendments are operator-owned and already committed — implementor must not edit ground-truth docs; day-jump behavior deliberately unchanged (1c5v is a later task)"`
- [x] Move this plan to `docs/plans/completed/`
