# Plan: Keep mixed amount chips inside the amount column (`e1ke`)

Stop mixed-transaction amount chips from overlapping the Member column: every child of `data-testid="amount-chip"` must stay within the amount cell at every supported width, with mixed chips staying single-row and readable. Fix the column allocation (or the member-reveal breakpoint) and add regression coverage at the exact breakpoint where Member first appears.

## Plan Context

- Ground truth: `docs/webui-design.md` — stable percentage-based column layout; column-collapse priority (member collapses first); mixed lines carry compact component amounts on a single-height line; monetary amounts right-aligned. `docs/webui-theme-arcade-cabinet.md` — amount chip treatment.
- Defect (TX-6 audit, Kata `e1ke`): at ~1445px viewport — just past the container width where the Member column first appears (member is hidden under `@container transactions-table (max-width: 1120px)`, `frontend/src/styles.css:276-289`) — the first child of the mixed amount chip starts ~7px left of the amount column, overlapping the member cell. Mixed chips (`frontend/src/features/ledger/amount-text.tsx:127`, multi-component like `-5.00 / +100.00 $`) are the widest amount rendering.
- The transactions column widths were recently rebalanced (amount base 13%, ≤1120 22%, ≤920 25%; actions 7/8/9%) — the overlap window is where member shows AND amount is at its narrow base percentage. Fix by either reserving enough minimum amount width for the widest realistic mixed chip, or keeping Member collapsed until the mixed chip genuinely fits (kata allows both). Prefer the smallest CSS change consistent with the collapse-priority rule; do not add JavaScript measurement.
- Every supported width matters: the fix must hold from 1200px viewport up through wide screens, and the amount cell must never emit a horizontal scrollbar or clip chips into a second row.
- Protect — do not regress: column sums (each breakpoint's percentages total 100), collapse-priority ordering (member → status → actions fold → tags → category), pj89's actions-column sizing and fold breakpoint (860px), amount right-alignment, single-height rows, existing transactions e2e including the column-collapse ordering test and toolbar geometry.
- Regression e2e: with a mixed transaction present (create via API — a journal with components yielding a `-x / +y` display), walk viewport widths across the member-reveal breakpoint (just below, at, and above) and assert every `amount-chip` child's bounding box is contained within its amount cell's box, member content is not overlapped (no intersection between chip children and the member cell box), and the chip stays on one row.
- Follow `docs/TESTING.md`; browser behavior belongs in Playwright frontend e2e tests.
- Kata issue: `e1ke`.

## Tasks

### Task/Commit 1: Fix the overlap and pin it with breakpoint coverage

- [x] Adjust the transactions-table column allocation and/or member-reveal breakpoint in `frontend/src/styles.css` so mixed amount chips fit inside the amount cell at every supported width; keep percentage sums at 100 and the collapse-priority ordering intact.
- [x] Extend `frontend/tests/e2e/transactions-page.spec.ts` with the breakpoint regression: mixed-transaction fixture, widths straddling the member-reveal boundary, containment assertions (chip children within amount cell; no intersection with the member cell), single-row chip.
- [x] Update `PROJECT_STATE.md` only if it misstates anything (likely no change — this is a layout defect fix).
- [x] Add Kata `e1ke` progress and verification evidence.
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
- [x] Run `just review-loop "Keep mixed amount chips contained in the amount column at all widths, especially where Member first appears; preserve column sums, collapse ordering, and pj89 action-column sizing"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `e1ke` only after the plan is moved to completed
