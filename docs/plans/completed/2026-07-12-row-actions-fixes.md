# Plan: Fix plan 1 for always-visible row actions — webkit overflow keyboard focus (Kata r4yb)

Finish the r4yb branch: implementation and review-loop findings are committed, but the operator's verification run found one deterministic webkit failure in the rewritten overflow-keyboard spec, and the original plan's last two checkboxes (review-loop record, archive) are unticked because the prior session crashed while babysitting the loop's final confirmation pass.

## Plan Context

- Do not run review-loop. (The task's one allowed review-loop already ran; its 1 major + 2 minor findings were fixed in commits `f7497b63`, `4769c3d4`, `e4a5a871`, `069c6a8a`.)
- Operator-verified failure (deterministic, fails solo and in the full suite; chromium passes):
  - `frontend/tests/e2e/reference-row-actions.spec.ts:96` "reference row actions fold only when their action cell cannot fit them" fails on WEBKIT at `:240`: after opening the folded overflow menu, the spec presses Tab a fixed number of times and expects the "Move or rename" button in `.row-actions-menu` to be focused; in webkit the focus never lands there ("inactive").
  - Root cause to confirm: webkit's initial-focus/Tab semantics inside the Radix popover differ from chromium — the `onOpenAutoFocus` focus target (`frontend/src/components/row-actions.tsx:188` area, adjusted in `e4a5a871`) plus a fixed Tab count is not engine-portable.
- Fix direction (decided): make overflow-panel keyboard navigation deterministic cross-engine at the COMPONENT level, not by loosening the spec:
  - Ensure opening the folded menu reliably places focus on the first enabled action in BOTH engines (verify the auto-focus actually applies in webkit; Radix `onOpenAutoFocus` + manual focus may need `requestAnimationFrame`/`setTimeout(0)` or Radix's own autofocus instead of preventDefault+manual).
  - Prefer explicit key handling within the panel if needed (ArrowDown/ArrowUp moving through action buttons is acceptable menu semantics) — if added, assert arrow navigation in the spec instead of a brittle Tab count; keep Escape-closes-and-returns-focus coverage.
  - The spec must assert real focus flow (focus lands in panel on open; navigation reaches "Move or rename"; Enter activates) and pass on chromium AND webkit.
- Bookkeeping to finish (after the suite is green): in `docs/plans/2026-07-11-always-visible-row-actions.md`, tick the review-loop checkbox with a one-line annotation that the loop ran and its findings were fixed (`f7497b63`..`069c6a8a`) with the final confirmation pass cut short by a session crash and not re-run per operator budget rules; tick the archive checkbox; move that plan to `docs/plans/completed/`.
- Protect — do not regress: all commits on this branch (`e620df59`..`069c6a8a`), the operator's `docs/webui-design.md` amendment, every other e2e spec. No ground-truth doc edits.

## Tasks

### Task/Commit 1: Cross-engine overflow keyboard focus + finish the original plan

- [x] Fix the overflow-panel initial focus / keyboard navigation per Plan Context; adjust the spec at `reference-row-actions.spec.ts:96` to assert the robust focus flow.
- [x] Full suite green in chromium and webkit.
- [x] Finish the original plan's bookkeeping per Plan Context and archive it.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `r4yb` (`kata comment r4yb --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
