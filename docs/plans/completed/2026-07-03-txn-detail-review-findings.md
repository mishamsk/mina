# Plan: Transaction detail panel — review findings (Kata 5039 follow-up)

Implementation-only fix pass from the operator review. The panel's URL model, data flow, delete flow, theme treatment, and e2e coverage are verified sound; this plan fixes the title treatment, overlay interaction defects, and a post-delete refetch race.

## Plan Context

- Do not run review-loop. This is a review-fix pass; the operator reviews the result directly.
- Mandatory reading: `docs/webui-theme-arcade-cabinet.md` (Typography rules), `docs/webui-design.md` (Overlays, Dates and statuses).
- Do not edit any file under `docs/` except moving this plan to `docs/plans/completed/` when done.
- Protect — do not regress (live-verified, e2e-covered): panel open affordance and content, deep-link open, Esc close with URL and focus restore to the row button, landmark theme treatment, delete confirm/cancel/toast/refresh, inline row expand, all previously merged table fixes, 34-test e2e suite green.
- Frontend-only.

## Tasks

### Task/Commit 1: Title treatment and reconciliation status

The panel header applies CSS `uppercase` to the server `display_title` (`frontend/src/features/ledger/transaction-detail-panel.tsx:377-380`); the theme reserves uppercase for headings and forbids it on user-derived content (account leaf names, memo fallbacks). The record table also renders reconciliation status for every record (`transaction-detail-panel.tsx:208-210`) while the design keeps reconciliation indicators hidden until Phase 5 data exists.

- [x] Render `display_title` in the panel header without a case transform, keeping the heading font/weight and aligning the size to a theme scale step; static labels (section headings, "JOURNAL RECORDS", metadata labels) stay uppercase
- [x] Remove the reconciliation status from the record table until reconciliation data exists (posting status stays)
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Overlay stacking and focus correctness

Three interaction defects in the new overlay code: (a) the entry panel and detail panel each register global Escape listeners, so one Esc closes both when both are open (`entry-panel.tsx:475-479`, `transaction-detail-panel.tsx:264`); (b) the global `n` shortcut stays live while the detail panel is open (`transactions-page.tsx:215-239`) and the entry panel's autofocus yanks focus out of the panel's trap; (c) closing the delete confirmation via Cancel/Esc drops focus to `body` instead of restoring it to the Delete trigger (`transaction-detail-panel.tsx:325-341`).

- [x] Make Escape close only the topmost open overlay (confirm dialog → detail panel → entry panel), one layer per keypress
- [x] Suspend the `n` new-transaction shortcut while the detail panel (or its dialog) is open
- [x] Restore focus to the Delete button when the confirmation dialog closes without deleting
- [x] Extend e2e: with entry panel and detail panel both open, one Esc closes only the detail panel; Cancel in the delete dialog returns focus to the Delete button
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 3: Post-delete refetch race

After a successful delete the detail effect refetches the deleted transaction id, producing a console `404 GET /api/transactions/{id}` (live-observed). The panel closes correctly; only the stray request is wrong.

- [x] Clear the detail state/URL before or atomically with the delete completion so no fetch for the deleted id fires; no error may surface in the console during the delete flow
- [x] Extend the delete e2e to assert no console error / failed transaction request occurs during the flow
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
- [x] Move this plan to `docs/plans/completed/` (move `docs/plans/2026-07-03-transaction-detail-view.md` there as well — its implementation is complete; the operator owns its remaining unchecked operator-side items)
