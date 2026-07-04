# Plan: Escape swallowed by focus-opened tooltip after detail close (Kata 5039 follow-up 2)

Single-defect fix pass from live verification of the previous fix loop.

## Plan Context

- Do not run review-loop. The operator reviews the result directly.
- Do not edit any file under `docs/` except moving this plan to `docs/plans/completed/` when done.
- Live-verified defect: with the entry panel and detail panel both open, Esc #1 correctly closes only the detail panel and restores focus to the row's "Open transaction detail" button. That button is wrapped in the shared `Tooltip` (`frontend/src/features/ledger/transaction-browser.tsx:514`); the tooltip opens on the programmatic focus restore, and the tooltip's Escape dismissal (Radix) calls `preventDefault`, so Esc #2 is consumed dismissing the tooltip — the entry panel handler (`frontend/src/features/ledger/entry-panel.tsx:475-481`) skips `defaultPrevented` events and only Esc #3 closes it. Expected: Esc #2 closes the entry panel.
- Protect — do not regress (all live-verified): tooltip opens on keyboard focus during normal Tab navigation and closes on Escape/blur; Esc #1 closes only the topmost overlay; `n` suspension while the detail panel is open; delete-dialog Cancel restoring focus to Delete; clean delete flow with zero console errors; the 34-test e2e suite.
- Frontend-only, smallest reasonable change. Candidate directions (pick the cleanest supported one, do not build new abstraction layers): suppress the tooltip when focus arrives programmatically from the panel's focus restore (e.g. Radix `onOpenChange` guard or focusing with the documented mechanism that skips tooltip open), or make one Escape both dismiss a tooltip and still count for the topmost overlay. Keyboard-focus tooltips during real Tab navigation must keep working.

## Tasks

### Task/Commit 1: One Esc per layer, tooltips excluded from the overlay stack

- [x] Fix the swallowed Escape: after the detail panel closes and restores focus, the very next Esc closes the entry panel (an open tooltip must not consume an overlay-closing Esc)
- [x] Keep tooltip keyboard behavior intact for real Tab navigation (opens on focus, Escape dismisses it when no overlay is open)
- [x] Extend the existing overlay-stacking e2e: entry panel + detail panel open → Esc closes detail → Esc closes entry (exactly two presses)
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
