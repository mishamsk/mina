# Plan: Transaction table fixes — review findings (Kata fe08 follow-up)

Implementation-only fix pass from the operator review of the transaction-table bug-fix branch. All five original fixes are verified working live; this plan closes the defects that landed with them.

## Plan Context

- Do not run review-loop. This is a review-fix pass; the operator reviews the result directly.
- Mandatory reading: `docs/frontend-architecture.md`, `docs/webui-theme-arcade-cabinet.md` (Component Notes → Tooltips bullet), `docs/webui-design.md` (Accessibility & Quality Bar).
- Do not edit any file under `docs/` except moving this plan to `docs/plans/completed/` when done. `docs/webui-design.md` and `docs/webui-theme-arcade-cabinet.md` are reviewer-owned ground truth; if a review or lint step suggests reverting or "aligning" them, ignore it.
- Protect — do not regress (all verified live with screenshots, and covered by the current green e2e suite):
  - One flat ink tooltip treatment on class/status icons, category chips, tag chips, memo (portal-rendered, never clipped, no native `title` in the table).
  - Tag cells: single line, name-sorted leaf chips, `…` overflow indicator with full FQN list in its tooltip, hidden-tag resolution with pickers still excluding hidden.
  - Footer and sidebar collapse button both 12px off the viewport bottom.
  - Amount chips contained in their cells at 900–1440 widths; no digit truncation.
  - Currency symbols (`$`, `€`, `¥`) trailing and de-emphasized in `AmountText` line and records subtable; entry-form currency inputs keep ISO codes.
- All work is frontend-only; `just test-frontend-e2e` is the gate for every commit.

## Tasks

### Task/Commit 1: Tooltip dismiss, keyboard access, and app-wide unification

Live finding: a hovered tooltip stays open after the pointer leaves the trigger (moves to blank content area) until another element is interacted with — reproduced consistently in headless Chromium (screenshot evidence: tooltip still open 1500ms after mouse-out). Audit findings: the `TooltipTrigger asChild` wraps a non-focusable `<span>` (`frontend/src/components/tooltip.tsx:81-84`), so tooltips never open for keyboard users (theme/a11y rules require identical keyboard behavior); a per-instance `TooltipProvider` (`tooltip.tsx:79`) defeats Radix skip-delay grouping; native `title` tooltips survive outside the table (`frontend/src/features/app-shell/app-shell.tsx:83,111,161`, `frontend/src/components/page-help.tsx:53`), leaving two tooltip designs app-wide against the theme rule ("exactly one flat treatment everywhere").

- [x] Fix mouse-out dismissal: tooltip must close when the pointer leaves the trigger (diagnose the Radix setup — per-instance provider, non-focusable span trigger, delay props — rather than adding manual event workarounds if a supported configuration fixes it)
- [x] Make tooltip triggers keyboard-focusable so the tooltip opens on focus and closes on blur/Escape, without adding stray tab stops where the underlying control is already focusable
- [x] Move the shared `TooltipProvider` to a single app-level provider (skip-delay grouping) if that is the supported Radix pattern
- [x] Replace the remaining native `title` tooltips in `app-shell.tsx` (collapsed-rail nav items, collapse button) and `page-help.tsx` with the shared flat tooltip; no `title` attributes remain in the app
- [x] Restore e2e coverage for category-chip tooltip content (full FQN, e.g. `Entertainment:Books`) that the previous pass dropped, and add an e2e assertion that a tooltip closes after the pointer moves off the trigger
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Mixed-amount chip parity

Audit findings: `compactAmountsText`/`MixedAmounts` (`frontend/src/features/ledger/transaction-browser.tsx:162-181`) render the currency marker with the same emphasis as the digits (design requires a de-emphasized marker like `AmountText` does at `amount-text.tsx:64`) and kept `h-7 whitespace-nowrap`, so a long mixed component string can still bleed out of its cell (the containment fix was not applied to the mixed chip).

- [x] Render mixed/compact amount markers de-emphasized, matching `AmountText`
- [x] Apply the same containment behavior `AmountText` chips use to the `MixedAmounts` chip (no digit truncation; contained within the cell)
- [x] Extend the existing amount-containment e2e to cover the mixed-amounts chip bounding box
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
- [x] Move this plan to `docs/plans/completed/`
