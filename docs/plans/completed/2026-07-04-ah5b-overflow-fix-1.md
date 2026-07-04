# Plan: ah5b tag chip overflow — operator review fixes (fix plan 1) — Kata issue `ah5b`

Address operator-review findings on branch `ah5b-tag-chip-overflow`: overflow chip placement reads out of order, the two-row cap duplicates literals it defines as CSS vars, focus recovery bypasses the tooltip-suppressing helper, and two test gaps. Implementation-only; the two-row overflow behavior itself is verified working live — do not redesign it.

## Plan Context

- Do not run review-loop.
- Live evidence (operator, 1440px and 1100px viewports, demo data + 9-tag transaction): two-row fill and measured overflow work correctly; row heights stay uniform. One visual defect: while overflowing, the "…" chip is absolutely positioned `top-0 right-0`, so it renders at the end of the FIRST chip row while the second row continues with more chips below it — the list reads "t0 t1 t2 … / t3 t4 t5", implying the list ends where it doesn't.
- Protect — do not regress: measured overflow (chip only on real overflow; all chips visible when they fit on two rows), two-row cap within standard row height, clipped chips hidden from AT and focus, no observer thrash, overflow chip testid `transaction-tags-overflow` and full-FQN tooltip, single-height rows, existing e2e suite green.
- Scope exclusions: no new features, no ground-truth doc edits, no PROJECT_STATE.md update, no changes outside `frontend/src/features/ledger/transaction-browser.tsx`, `frontend/src/features/ledger/tag-chip.tsx` (only if a shared height token requires it), and `frontend/tests/e2e/transactions-page.spec.ts`.

## Tasks

### Task/Commit 1: Overflow chip placement and two-row cap token hygiene

- [x] Move the overflow "…" chip to the end of the visible chip flow: bottom-right of the two-row area (`bottom-0 right-0` instead of `top-0 right-0`), so overflowing reads "…continues" after the last visible chip. Ensure the reserved space (`pr-6` while overflowing) still prevents the chip from covering a visible chip on the second row; the first row must not reserve a hole once the chip sits on the bottom row — verify visually at a width where row one is full.
- [x] `transaction-browser.tsx:239`: express the two-row `max-h` calc in terms of the CSS vars it already defines on the same element (`--tag-chip-row-gap`, `--tag-chip-shadow-room`) and the chip height (share one source of truth with `TagChip`'s micro height instead of a hardcoded `2rem` assuming `h-4`), so the cap cannot silently drift from the chip size.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Commit changes

### Task/Commit 2: Focus recovery polish and test gaps

- [x] `transaction-browser.tsx:194-230`: focus recovery must use the repo's `focusWithoutTooltip` helper (`frontend/src/components/tooltip.tsx:20`) instead of plain `.focus()` so programmatic focus moves do not pop tooltips; and compute the recovery target from the pre-clip focused tag id rather than requiring `document.activeElement` to still be inside the tag list (a browser may blur the element the instant it turns `visibility:hidden`, leaving focus on `body`).
- [x] e2e: add a row-height assertion for a no-memo transaction with enough tags to fill two chip rows vs an ordinary row (the case most at risk of growing row height is currently untested).
- [x] e2e: fix the overflow tooltip assertion's implicit coupling to API tag ordering — assert against the component's actual render order (the order of the row's tags), or make the component's tooltip order deterministic and assert that; do not build the expectation by independently sorting.
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
