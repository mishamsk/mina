# Plan: Prevent assigned tag chips from overlapping the tag editor menu — Kata `yvk7`

The inline tag editor's assigned-tag chips, suggestion dropdown, and Save/Cancel controls never overlap each other at supported widths and densities, and the popup positions safely near viewport edges. Kata issue: `yvk7`.

## Plan Context

- Kata `yvk7` acceptance (ground truth for this plan):
  - Assigned tags and the tag dropdown never overlap at supported widths or table densities.
  - Existing assignments remain visible and removable without covering search results or Save/Cancel controls.
  - The popup positions and sizes safely near viewport edges and inside constrained transaction rows.
  - Regression coverage for many assigned tags and narrow viewports.
- Owning docs: `docs/webui-design.md` (tag chips render at micro size and collapse into an overflow indicator; inline editors are the shared pickers), `docs/webui-theme-arcade-cabinet.md` (chip/landmark treatments; popups never clipped by table cells). Targeted ground-truth doc updates are allowed only if the implementation genuinely diverges from a documented rule; note any such edit prominently in the completion report.
- Affected code: `frontend/src/features/ledger` tag inline editor (`record-reference-cells.tsx`, `EntityMultiPicker` in `entity-picker.tsx`) and its popup layout. The wkpr explicit-commit single-editor model, 46vf in-place saves, and 329k no-include-hidden contracts (see `frontend/src/features/ledger/PACKAGE.md`) must not regress.
- The editor renders inside constrained table cells in every embedding (transaction rows, expanded records, detail panel); the fix must hold in all of them.

## Tasks

### Task 1: Non-overlapping tag editor layout

End state: within the tag editor popup, assigned chips, the search input, the suggestion list, and Save/Cancel occupy distinct, non-overlapping regions in every embedding.

- [x] With many assigned tags (10+), chips never cover the suggestion list, the search input, or Save/Cancel; chips remain individually removable; the popup constrains and scrolls its own content rather than growing over its controls.
- [x] The popup stays fully on-screen and unclipped near viewport edges (right edge, bottom edge) and inside narrow cells at supported table widths and both densities.
- [x] Commit the task as `Prevent assigned tag chips from overlapping the tag editor menu`.

### Task 2: Regression coverage

End state: e2e coverage pins the layout at the stress points.

- [x] E2E asserts non-overlap (bounding-box checks) for a transaction with many tags and at a narrow supported viewport, including that Save/Cancel stay visible and clickable.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover tag editor overlap regressions with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Inline tag editor layout: assigned chips, search, suggestions, and Save/Cancel never overlap; popup safe near viewport edges and in constrained rows; wkpr/46vf/329k inline-editing contracts unchanged."`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `yvk7` with the commits and validation evidence: `kata close yvk7 --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
