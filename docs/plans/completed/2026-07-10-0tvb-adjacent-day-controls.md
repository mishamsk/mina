# Plan: Previous-day and next-day transaction anchor controls (`0tvb`)

Add Previous day / Next day icon buttons adjacent to the Go-to-day input on the transactions toolbar. Each shifts the selected anchor by exactly one local calendar day and reloads the anchored page, so walking adjacent days no longer requires reopening the date picker.

## Plan Context

- Ground truth: `docs/webui-design.md` (toolbar patterns; icon-only controls require tooltips; URL-backed state) and `docs/webui-theme-arcade-cabinet.md` (icon-button affordance).
- Current state: the Go-to-day input (`#transactions-date-jump`, `frontend/src/pages/transactions-page.tsx`) drives `useTransactionDateJump` (`frontend/src/features/ledger/use-transaction-date-jump.ts`) — `dateJumpValue` state, `jumpToDate(anchorDate)` with ISO `yyyy-mm-dd`, `dateJumpLoading` transient state, cancellation via jump ids.
- Behavior:
  - Previous/Next are icon-only buttons (chevron/arrow glyphs) with tooltips and accessible names ("Previous day", "Next day"), placed adjacent to the date input inside the same labeled column, matching the toolbar control row height and affordance (the qwjb geometry contract for the toolbar must hold).
  - Base date: the current anchor (`dateJumpValue`) when set; when no anchor is set, the base is today's local calendar date (so Previous jumps to yesterday, Next to tomorrow). The input reflects the new anchor after each step.
  - Day arithmetic is local-calendar-safe: compute from the `yyyy-mm-dd` parts (never `new Date("yyyy-mm-dd")` string parsing, which is UTC) so month/year boundaries and DST transitions step exactly one calendar day.
  - Future dates are allowed — Next never disables at today.
  - The buttons disable only while `dateJumpLoading` is true (matching the input's transient `aria-disabled` treatment), never otherwise.
  - Each step goes through the existing `jumpToDate` path so URL/page state, filters, cancellation, and reload semantics stay identical to a manual date jump.
- Protect — do not regress: manual Go-to-day entry and Enter handling; the class dropdown and Add-filter controls (Tasks `cqft`/`qwjb` — toolbar geometry e2e must stay green); URL-backed filter state; transactions browser behavior; existing transactions e2e.
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `0tvb`.

## Tasks

### Task/Commit 1: Adjacent-day controls on the transactions toolbar

- [x] Add Previous day / Next day icon buttons adjacent to `#transactions-date-jump` with tooltips, accessible names, theme-standard icon-button affordance, and the control-row alignment; wire both through the existing `jumpToDate` flow with local-calendar ±1 day arithmetic and the no-anchor→today base rule; reflect the new anchor in the input; disable only during `dateJumpLoading`.
- [x] Extend `frontend/tests/e2e/transactions-page.spec.ts`: stepping from a set anchor moves the list to the adjacent day's page and updates the input and URL/page state; stepping with no anchor uses today's local date as base; Next remains enabled at and beyond today; keyboard activation works; a month-boundary step (e.g., anchor on the 1st stepping back) lands on the correct calendar day; toolbar geometry assertions stay green.
- [x] Update `PROJECT_STATE.md` with a one-line note about adjacent-day navigation on the transactions page.
- [x] Update the ledger package doc only if a non-obvious contract emerges.
- [x] Add Kata `0tvb` progress and verification evidence.
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
- [x] Run `just review-loop "Add previous/next-day anchor controls beside Go-to-day using the existing jumpToDate flow; local-calendar day arithmetic, no-anchor defaults to today, future dates allowed, disable only during transient loading; toolbar geometry and existing filters unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `0tvb` only after the plan is moved to completed
