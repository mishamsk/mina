# Plan: Fix plan 1 for recurring definitions page — unfold wide-width row actions (Kata bnvy)

Operator live-verification finding on the otherwise-complete bnvy branch: at a 1500px viewport every definitions row renders the folded overflow (⋯) instead of its action cluster. Commit `2e709567` enabled folding for recurring rows, but the actions column is sized so narrow that folding is permanent — contradicting the webui-design row-actions rule ("Fit decides presentation, never count: when the actions cell fits the full action cluster it shows all buttons"). A wide screen must show the full cluster.

## Plan Context

- Do not run review-loop.
- Fix: size the recurring definitions table's trailing actions column so the full action cluster (confirm-next, pause/resume toggle, defer where applicable, edit, cancel) renders unfolded at normal desktop widths (>= ~1200px content area); folding engages only under genuine narrow-width constraint, exactly like the reference tables post-r4yb. Rebalance the other column widths as needed (the table currently has generous free space in SCHEDULE/STATUS/NEXT).
- Interval-only Defer: rows for date-rule definitions have one fewer action — keep the r4yb fixed-slot/alignment discipline so clusters align across rows.
- e2e: add/adjust a geometry assertion that definitions rows show the unfolded cluster at the default desktop viewport and fold at a narrow viewport (mirror the reference-row-actions cutover spec pattern).
- Protect — do not regress: everything already committed on this branch (table, editor, row-action behavior, e2e), the narrow-width fold cutover, all other suites.
- No ground-truth doc edits.

## Tasks

### Task/Commit 1: Unfold definitions row actions at wide widths

- [x] Implement per Plan Context; geometry e2e added/updated.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `bnvy` (`kata comment bnvy --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
