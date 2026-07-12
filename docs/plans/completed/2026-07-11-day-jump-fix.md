# Plan: Go To Day fixes + surviving toolbar polish (Kata 1c5v, 8ara)

Fix the day-jump bugs from Misha's 2026-07-11 review and the parts of `8ara` that survived the d8z6 toolbar redesign. The operator has amended `docs/webui-design.md` on this branch with the target semantics — read those bullets first ("Day-step controls are square icon buttons … plus a Today shortcut…" and "Jumping to a day lands the view on the page containing that day and brings the day's first row into view with a transient highlight; day-stepping keeps working after any jump."). Do not edit ground-truth docs.

## Plan Context

- Kata issues: `1c5v` (day-jump bugs + Today control) and `8ara` (surviving polish: tooltip nit + e2e gaps). One sub-branch.
- MANDATORY pre-reads: the amended `docs/webui-design.md` toolbar bullets, `docs/frontend-architecture.md`, `docs/TESTING.md`.
- Reported bugs (repro on demo data, Transactions page):
  1. Open Go To Day, pick 2026-05-27 → nothing visibly changes (table still starts at May 31).
  2. After that, the previous/next day step buttons stop doing anything.
  3. No working Today control.
- Code focus: `frontend/src/features/ledger/use-transaction-date-jump.ts` (148 lines) and the toolbar wiring in `transaction-browser-toolbar.tsx` / `use-transaction-browser-page.ts`.
- Operator analysis (verify with a failing e2e BEFORE fixing — the existing jump specs only cover far-away dates):
  - Bug 1 has a design component: `jumpToDate` → `jumpToTransactionDatePage` → `transactionPageFromOffset` lands at PAGE granularity. When the target date is on the current page, the URL doesn't change and nothing visibly happens. Per the amended design doc, the fix is: land on the page containing the day AND scroll the day's first transaction row into view with a transient highlight (also when the page didn't change). Do not switch the URL model to arbitrary offsets — pages stay pages.
  - Bug 2 is a state bug to root-cause: candidates are `dateJumpLoading` wedging true (the `finally` only clears it when `activeDateJumpIdRef` still matches), the early-return in `jumpToDate` when `dateJumpLoading` is true silently dropping a step after `jumpToAdjacentDate` already advanced `dateJumpValue` (value drifts without a jump), and the `setSearchParams` guard bailing when page/filters changed mid-flight. Reproduce exactly Misha's sequence (jump via the picker, then step) in an e2e first, then fix so stepping always works after any jump outcome.
  - Bug 3: add a Today control per the design doc — a square icon button (or compact labeled button consistent with the theme) in the day-nav cluster that sets the date input to the current local day and jumps to it. Keep accessible name "Today".
- 8ara surviving scope (everything else in that issue is superseded by d8z6's redesign — do NOT resurrect chip-wrap/mt-5 alignment items):
  - Tooltip nit: a control's tooltip can reappear while its popover/menu is open (originally the filter trigger; check the current Filter/X toggle + Add-filter button) — suppress the tooltip while the associated popover is open.
  - e2e gaps: add a tooltip-visibility assertion (tooltip shows on hover, does NOT show while the popover is open) and drive one filter-bar keyboard flow via REAL Tab traversal (no programmatic `.focus()` shortcuts) from the search input through the toolbar controls into the filter bar.
- e2e for 1c5v (extend `transactions-page.spec.ts` day-jump coverage): near-date jump (target on the current page) scrolls/highlights the day's first row; far-date jump changes page and highlights; stepping works after both kinds of jumps and after an aborted/no-op jump; Today returns to the current day (demo data's "today" has no transactions — assert the landing behavior is sane: first page / nearest day, matching whatever the fixed implementation does deterministically).
- The drill-down embedding shares this toolbar — behavior must hold there too (one representative assertion is enough).
- Docs: no further ground-truth edits (operator owns them). Update `frontend/src/features/ledger/PACKAGE.md` only if the hook contract changes. No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: 1c5v — day-jump repositioning, stepping reliability, Today control

- [x] Write failing e2e first for the three bugs (near-date jump no-op; stepping dead after a jump; missing Today), reproducing Misha's exact sequence.
- [x] Fix `use-transaction-date-jump.ts` (and toolbar wiring): scroll-into-view + transient highlight of the anchor day's first row on every successful jump (including same-page), robust stepping after any jump outcome, and the Today control.
- [x] Make the new e2e green; extend coverage per Plan Context (far/near jumps, stepping after jumps, Today, one drill-down assertion).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `1c5v` (`kata comment 1c5v --agent ...`)
  - [x] Commit changes

### Task/Commit 2: 8ara — tooltip suppression while popover open + e2e hardening

- [x] Suppress tooltips on controls whose popover/menu is currently open (Filter/X toggle, Add-filter button; audit the toolbar for others).
- [x] Add the tooltip-visibility e2e assertion and the real-Tab-traversal keyboard flow spec per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `8ara` (`kata comment 8ara --agent ...`; note which original 8ara items were superseded by d8z6)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Day-jump fixes + toolbar polish (kata 1c5v, 8ara): jump-to-date now scrolls/highlights the anchor day's first row including same-page jumps (pages stay page-granular per amended webui-design), day-stepping survives every jump outcome, explicit Today control added; tooltip suppressed while its popover is open; e2e adds failing-first day-jump coverage, tooltip visibility, and a real-Tab keyboard traversal; webui-design amendments operator-owned and already committed; superseded 8ara chip-wrap/alignment items deliberately not resurrected"`
- [x] Move this plan to `docs/plans/completed/`
