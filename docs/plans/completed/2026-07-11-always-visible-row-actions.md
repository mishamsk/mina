# Plan: Always-visible row actions, fit-based overflow, no Actions header (Kata r4yb)

Base design change (Misha directive, repeat request): stop hiding row-action buttons behind hover/focus reveal. The operator has amended `docs/webui-design.md` on this branch — the "Per-row actions…" bullet and the new "Tables render no Actions column header…" bullet under "Tables and filtering" are the ground truth; read them first and do not edit them.

## Plan Context

- Kata issue: `r4yb`. Related: `6pdf` (row-opens-detail, next task — do not implement it here).
- MANDATORY pre-reads: the amended `docs/webui-design.md` bullets, `docs/webui-theme-arcade-cabinet.md`, `docs/frontend-architecture.md`, `docs/TESTING.md`.
- The change, per the amended doc:
  1. Row-action buttons are ALWAYS visible — remove every hover-/focus-reveal opacity mechanism.
  2. Fit-based presentation: when the actions cell fits the full cluster, show all buttons; when it cannot, collapse to a single overflow (⋯) button opening a floating panel with all actions. Repurpose the existing RowActions container-query fold machinery (`frontend/src/components/row-actions.tsx`) for this cutover — the fold trigger becomes fit, reveal is gone.
  3. Remove the Actions column header cell text entirely (keep the column; drop the "ACTIONS" header label) in every table using the pattern.
  4. Alignment: the actions column's trailing padding currently leaves a much larger right margin than the table's leading padding — right-pad the actions column so the margins match and the cluster reads centered/balanced.
- Scope: all reference/dictionary tables (categories, tags, members, accounts tree, recurring page review table if it uses RowActions) and any other user of the shared RowActions pattern. The transactions browser's own action handling keeps its column-collapse-priority behavior but must also lose any hover-reveal semantics if it has them.
- Keyboard/a11y: with always-visible buttons, keyboard reachability is plain Tab order (and the overflow panel must be keyboard-operable: open with Enter/Space, arrow/Tab within, Escape closes and returns focus to the ⋯ button). Tooltips stay.
- e2e impact (update deliberately, do not weaken coverage):
  - Reveal-assertion specs are now obsolete as written: `reference-row-actions.spec.ts` (row focus → `opacity: 1` pattern, fold-at-390px flows) and the members keyboard-reveal spec added recently in `members-page.spec.ts` — rewrite them to assert ALWAYS-visible (buttons visible without hover/focus) and the fit-based overflow cutover (narrow viewport → ⋯ button → floating panel lists all actions, keyboard-operable).
  - The panel-covered row-action keyboard interactions from earlier tasks (categories/tags/members specs) still work — keep them.
  - Add: no Actions header assertion; alignment assertion (actions-cell trailing padding ≈ table leading padding) if cheap to measure.
  - `reference-table-layout.spec.ts` geometry assertions may need updating for the header removal.
- Visual: this is a theme-sensitive change — the always-visible buttons must not make rows noisy; keep the compact icon-button styling per the theme doc (no new visual variants; the arcade disabled/neutralization rules from row-actions stay).
- Docs: no further ground-truth edits. `frontend/src/components/PACKAGE.md` or row-actions docs update if a documented contract changes. No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: RowActions cutover — always visible + fit-based overflow + header/alignment

- [x] Rework `row-actions.tsx` and its table consumers per Plan Context (visibility, fit-based ⋯ overflow with floating panel, header label removal, trailing padding alignment).
- [x] Sweep every RowActions consumer and any other hover-reveal action mechanism (including the transactions browser if applicable).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `r4yb` (`kata comment r4yb --agent ...`)
  - [x] Commit changes

### Task/Commit 2: e2e alignment and new coverage

- [x] Rewrite the reveal/fold specs to the always-visible + fit-overflow model; add header-absence and overflow-panel keyboard specs per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `r4yb`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Always-visible row actions (kata r4yb): base design change per operator-amended webui-design — no hover/focus reveal anywhere, fit-based collapse into a single overflow (⋯) button opening a keyboard-operable floating panel, Actions header label removed, actions-column trailing padding matched to table leading padding; RowActions fold machinery repurposed; reveal e2e specs rewritten to the new model without weakening coverage; ground-truth doc edits are operator-owned and already committed"` — ran once; findings were fixed in `f7497b63`..`069c6a8a`; the final confirmation pass was cut short by a session crash and was not rerun per operator budget rules.
- [x] Move this plan to `docs/plans/completed/`
