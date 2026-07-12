# Plan: Compact Members and Tags layouts (Kata qkss)

Replace the full-width, essentially one-column Members and Tags tables with compact, left-aligned layouts with a bounded maximum width, per the operator-amended `docs/webui-design.md` reference-data bullet (read it first; do not edit ground-truth docs). Members is a flat list; Tags is a tree (shared ReferenceTree with hierarchy + include-hidden) and must keep its FQN tree rendering. Categories is explicitly excluded (its intent badge gives it a real second column).

## Plan Context

- Kata issue: `qkss`. Builds on merged `r4yb` (always-visible RowActions with fit-based overflow) and `6pdf` (row activation navigates to `/members/:memberId` / `/tags/:tagId`) — do NOT re-implement or duplicate their rules; the compact layout embeds the existing RowActions cluster and activation semantics unchanged.
- MANDATORY pre-reads: the amended `docs/webui-design.md` bullets (compact layout, row actions, row activation), `docs/webui-theme-arcade-cabinet.md`, `docs/frontend-architecture.md`, `docs/TESTING.md`.
- Layout (decided):
  - A reasonable bounded max width for the list container (pick a value that reads well for name-length content, e.g. ~40-48rem for Members; Tags may need a bit more for deep FQNs) — left-aligned within the page content area, not centered.
  - Narrow trailing actions column: the RowActions cluster (Members: edit/delete; Tags: hide toggle, move/rename, delete, edit) hugs the right edge of the COMPACT container, not the viewport.
  - The r4yb alignment rule (trailing padding matches leading padding) applies within the compact container.
  - Tags keeps tree indentation, group rows, and the include-hidden toggle exactly as today; only the width/geometry changes.
  - Usable at 1200–1920px and in narrow responsive states (the fit-based overflow from r4yb already handles narrow action cells — verify it still cuts over correctly inside the narrower container).
- Code focus: `frontend/src/features/members/members-page-content.tsx`, `frontend/src/features/tags/tags-page-content.tsx`, shared `frontend/src/features/reference/reference-tree.tsx` (parameterize width behavior rather than forking — categories keeps the wide layout).
- e2e impact:
  - `reference-table-layout.spec.ts` geometry assertions for members/tags need updating to the compact model (add explicit max-width/bounded-width assertions; keep the categories wide-layout assertions).
  - Members/tags page specs keep working (activation, RowActions, panels); update any full-width assumptions.
  - Add: actions column right edge stays within the compact container; overflow cutover still works at narrow widths inside the compact container.
- The side panels (create/edit) are overlays and are unaffected.
- Docs: no further ground-truth edits. No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: Compact layout for Members and Tags

- [x] Implement the bounded-width, left-aligned layouts per Plan Context (shared parameterization in reference-tree where sensible; categories unchanged).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `qkss` (`kata comment qkss --agent ...`)
  - [x] Commit changes

### Task/Commit 2: e2e geometry and behavior alignment

- [x] Update layout/geometry specs and add compact-width + narrow-cutover coverage per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `qkss`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Compact Members/Tags layouts (kata qkss): bounded-max-width left-aligned lists per operator-amended webui-design; Tags keeps FQN tree rendering and include-hidden; RowActions cluster and 6pdf row-activation semantics embedded unchanged with actions hugging the compact container edge; categories deliberately keeps the wide two-column layout; geometry e2e updated with compact-width and narrow-cutover coverage; ground-truth doc edit operator-owned and already committed"`
- [x] Move this plan to `docs/plans/completed/`
