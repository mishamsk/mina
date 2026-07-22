# Plan: Remove Include hidden controls from inline transaction editors — Kata `329k`

Inline transaction editors (category, tags, member) no longer render an "Include hidden" toggle; hidden entities stay excluded from their results, while broader pickers and management surfaces keep the toggle. Kata issue: `329k`.

## Plan Context

- Kata `329k` acceptance (ground truth for this plan):
  - Inline transaction editors do not render Include hidden controls.
  - Hidden entities remain excluded from inline-editor results.
  - Broader pickers and management surfaces (filter menus and reference-page toolbars) retain Include hidden where `docs/webui-design.md` calls for it.
  - Category, tag, and member inline editors remain usable at supported table widths.
- Owning docs: `docs/webui-design.md` (hidden entities rule; inline editors are the shared pickers), `docs/frontend-architecture.md`. Do not edit ground-truth docs.
- Affected inline-editor code: `frontend/src/features/ledger/record-reference-cells.tsx` (category, tag, and member editors plus their hidden-option filtering). The change is presentation scope only — which surfaces show the toggle — not the hidden-exclusion data behavior.
- The wkpr explicit-commit single-editor model and the 46vf in-place save behavior (see `frontend/src/features/ledger/PACKAGE.md`) must not regress.
- Update `frontend/src/features/ledger/PACKAGE.md` implicit contracts if the inline-editor picker contract changes in the same commit.

## Tasks

### Task 1: Drop Include hidden from inline editors only

End state: no inline transaction editor (transaction-row, expanded-record, or detail-panel variants) renders an Include hidden control; other picker surfaces are unchanged.

- [x] Inline category, tag, and member editors render without the Include hidden toggle at every embedding; their result lists still exclude hidden entities.
- [x] Filter menus and reference/management surfaces keep their Include hidden toggles exactly as today.
- [x] Inline editors remain usable at supported table widths (no clipped input, no broken cell layout).
- [x] Update `frontend/src/features/ledger/PACKAGE.md` if the picker contract wording changes.
- [x] Commit the task as `Remove Include hidden controls from inline transaction editors`.

### Task 2: End-to-end coverage

End state: e2e coverage pins the new surface split.

- [x] E2E asserts inline editors expose no Include hidden control while at least one broader surface (e.g. a filter menu) still does, and that a hidden entity does not appear in inline-editor results.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover inline editor hidden-entity behavior with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Inline transaction editors drop the Include hidden toggle; hidden entities stay excluded from inline results; broader pickers and management surfaces keep the toggle; wkpr/46vf inline-editing contracts unchanged."`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `329k` with the commits and validation evidence: `kata close 329k --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
