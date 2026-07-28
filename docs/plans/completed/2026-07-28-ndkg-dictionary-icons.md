# Plan: Differentiate dictionary edit and move/rename icons (Kata `ndkg`)

Accounts, Categories, and Tags row actions use two distinct, immediately recognizable icons for Edit and Move/Rename — the same pair on all three surfaces — with behavior, labels, tooltips, and keyboard access unchanged.

## Plan Context

- Kata issue: `ndkg` — "Differentiate dictionary edit and move/rename icons" (P2, frontend-only iconography polish).
- Verified (operator, 2026-07-28): both actions currently render the same `MagicEdit` glyph — `frontend/src/features/accounts/accounts-tree.tsx` ("Edit account" ~line 553 and "Move or rename" ~lines 592/624), with the same pattern in `frontend/src/features/categories/categories-page-content.tsx` and `frontend/src/features/tags/tags-page-content.tsx`.
- Decision: Edit renders the pencil-family pixel glyph (consistent with the app's other edit affordances, e.g. inline-edit's `Pencil`); Move/Rename renders a clearly movement-semantic pixelarticons glyph (implementor selects the best fit from the set — e.g. an arrow/corner/drag variant; Lucide fallback only if no pixel glyph reads well at 16px). The same two glyphs appear everywhere the two actions exist for the three entity types.
- Note: the issue text mentions "hover/focus reveal behavior" from an earlier era — current ground truth (`docs/webui-theme-arcade-cabinet.md` affordance rules) is that row actions are always visible with no hover-reveal; follow the current theme, keep the compact trailing-row-action treatment, accessible labels, and tooltips exactly as they are.
- Preserve: action behavior and ordering, disabled treatments, group-row vs leaf-row action sets, fixed toggle slots, and existing e2e (update only icon-specific assertions if any exist).
- Ground truth: `docs/webui-design.md` (row-action rules), `docs/webui-theme-arcade-cabinet.md` (iconography), `docs/TESTING.md` before tests.
- Validation surface: `just pre-commit`, `just test-frontend-e2e`.

## Tasks

### Task 1: Distinct Edit and Move/Rename glyphs on all three dictionary surfaces

- [x] Swap the glyphs per the decision on Accounts, Categories, and Tags (leaf and group rows where each action exists); verify mouse and keyboard access to both actions on representative rows of each page with `just dev --demo`; confirm the two actions are visually distinct at a glance in both banded row parities.
- [x] Adjust/extend e2e assertions that reference the affected buttons if any pin iconography; otherwise assert the two actions expose their distinct accessible labels on each page.
- [x] Commit the task as `fix(frontend): give dictionary edit and move-rename actions distinct icons`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-28-ndkg-dictionary-icons.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `ndkg` with `kata close ndkg --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
