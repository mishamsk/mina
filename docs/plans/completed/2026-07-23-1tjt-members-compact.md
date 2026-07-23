# Plan: Restore the compact Members table layout — Kata `1tjt`

The Members reference table uses the same compact, bounded, left-aligned list pattern as Tags, with the actions column narrow and adjacent to content. Kata issue: `1tjt`.

## Plan Context

- Kata `1tjt` acceptance (ground truth for this plan):
  - Members uses the same compact, bounded, left-aligned reference-list pattern as Tags (per `docs/webui-design.md` Screen 6: "Members and Tags render as compact left-aligned lists with a bounded maximum width instead of stretching a near-single-column table across the viewport; the trailing actions column stays narrow").
  - The actions column stays narrow and adjacent to useful content.
  - Search, scrolling, row activation (drill-down page), action overflow, empty state, and supported viewport behavior remain correct.
  - Regression coverage compares the structural sizing behavior of Members and Tags.
- Owning docs: `docs/webui-design.md` Screen 6 (already specifies this — the Members page regressed from it); `docs/webui-theme-arcade-cabinet.md`. Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from a documented rule; note any such edit prominently in the completion report.
- Affected code: `frontend/src/features/members/` page/table vs the Tags implementation in `frontend/src/features/tags/` — reuse whatever shared bounded-list mechanism Tags uses rather than duplicating it.
- Must not regress: reference row-activation rules, delete quick actions, trailing-column action rules, member drill-down pages.

## Tasks

### Task 1: Bounded compact Members layout

End state: Members matches the Tags pattern structurally.

- [x] The Members list renders with the same bounded maximum width and left alignment as Tags at every supported viewport; the actions column is narrow and sits adjacent to the name content; no large empty region before actions.
- [x] Search, scrolling, row activation to the member page, delete action with confirm, and the empty state all still work; shared mechanism reused from Tags (no duplicated layout code).
- [x] Commit the task as `Restore the compact Members table layout`.

### Task 2: Structural regression coverage

End state: e2e pins the Members/Tags structural parity.

- [x] E2E asserts, at a wide viewport, that the Members table's bounding width and actions-column offset match the Tags table's structural behavior (bounded width, actions adjacent), and that a narrow viewport stays correct.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover Members compact layout with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Members table restored to the Tags compact bounded pattern per webui-design Screen 6; actions adjacent; structural parity e2e; reference-table rules unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `1tjt` with the commits and validation evidence: `kata close 1tjt --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
