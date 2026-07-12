# Plan: Disabled row-action affordance + indicator slot polish (Kata jrqp, f9c5)

Two grouped reference-table visual fixes per Misha's 2026-07-11 review, governed by the operator-amended `docs/webui-theme-arcade-cabinet.md` (read the amended "Affordance classes" bullets first; do not edit ground-truth docs):

1. `jrqp`: a blocked Delete row action only drops its shadow and still plays the press-in animation when clicked. Disabled buttons must read unmistakably disabled and be unmoving.
2. `f9c5`: the featured star glyph is clipped at the bottom, and the hidden-eye glyph is misaligned across rows because star/no-star rows place it at different x positions. Fixed slots: star always LEFT of the eye; the eye in a constant slot across all rows and tables.

## Plan Context

- Kata issues: `jrqp` and `f9c5`. One sub-branch.
- MANDATORY pre-reads: the amended `docs/webui-theme-arcade-cabinet.md` affordance bullets, `docs/webui-design.md` row-actions rules, `docs/TESTING.md`.
- jrqp direction (per amended theme rule):
  - Disabled buttons (aria-disabled row actions AND all other disabled arcade buttons — audit `frontend/src/components/ui/button.tsx` variants and `row-actions.tsx` `disabledActionButtonClassName`): `--muted-foreground` outline/glyph on a muted fill, `cursor-not-allowed`, tooltip stays, and NO hover/press feedback — no translate, no shadow gain/drop on hover or active. The existing per-site `aria-disabled:*` class stacks should collapse into one shared treatment (button variant or shared class) instead of copies.
  - Apply consistently: all RowActions consumers (accounts, categories, tags, members, recurring), side-panel delete buttons, and any other `aria-disabled`/`disabled` arcade buttons found in the audit.
- f9c5 direction (per amended theme rule):
  - In the trailing cluster, give the toggle/indicator glyphs fixed per-column slots: star slot immediately LEFT of the hidden-eye slot; slots reserved (empty spacer) when a row lacks the toggle or a table has no featured flag yet (categories/tags — backend `18w4` landed but the star UX is deliberately follow-up; only RESERVE the slot, do not add a category/tag star toggle).
  - Fix the star glyph bottom clipping (likely an icon-size/line-height/overflow issue on the filled star in `row-actions.tsx` or the toggle button sizing).
  - Result: the hidden eye is vertically aligned across every row of accounts, categories, tags (and members if applicable), star or no star.
- e2e: extend `reference-row-actions.spec.ts` / `reference-table-layout.spec.ts`:
  - Disabled delete: computed style assertions (cursor, no transform on active — assert the button's bounding box does not move when clicked; document.activeElement/press does not fire the action), keep existing aria-disabled coverage.
  - Slot alignment: x-position of the eye toggle equal across rows with and without a star (accounts), and equal across categories/tags rows; star renders unclipped (bounding box height ≥ glyph size) — cheap geometry assertions.
- Docs: no further ground-truth edits (theme amendments are operator-owned and committed). No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: jrqp — unmistakable, unmoving disabled buttons

- [x] Implement the shared disabled treatment per Plan Context; sweep all disabled arcade-button sites onto it.
- [x] e2e assertions per Plan Context (cursor, unmoving on click, action not fired).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `jrqp` (`kata comment jrqp --agent ...`)
  - [x] Commit changes

### Task/Commit 2: f9c5 — fixed indicator slots and unclipped star

- [x] Implement fixed star/eye slots with reservations and fix the star clipping per Plan Context.
- [x] e2e alignment/clipping assertions per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `f9c5` (`kata comment f9c5 --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Row-action affordance polish (kata jrqp, f9c5): disabled arcade buttons unified onto one unmistakable, unmoving treatment (muted outline/glyph/fill, not-allowed cursor, zero hover/press feedback) per operator-amended theme doc; trailing toggle glyphs get fixed per-column slots (star left of eye, slots reserved incl. categories/tags which get no star toggle yet) with the star glyph unclipped; geometry and disabled-behavior e2e added; ground-truth theme edits operator-owned and already committed"`
- [x] Move this plan to `docs/plans/completed/`
