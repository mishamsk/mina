# Plan: Definitively fix clipped filled favorite stars — Kata `f6xc`

The filled favorite star renders fully unclipped in every location, fixed at the root cause in the shared icon/toggle primitive, with a geometry regression check that fails on clipping. Kata issue: `f6xc`.

## Plan Context

- Kata `f6xc` acceptance (ground truth for this plan):
  - Identify and fix the ROOT CAUSE — no page-specific offsets or magic margins; multiple prior local fixes have failed. Start with a written diagnosis: reproduce the clip, inspect the shared flat-toggle/icon-button primitive's box (line-height, overflow, fixed slot sizing, SVG viewBox vs integer pixel sizing per the theme's 16/24px rule), and identify exactly which box clips the glyph before changing anything. Record the diagnosis in the completion report.
  - Filled and unfilled stars render fully inside every account/reference row and featured toggle location (chart of accounts, account page header, any table with the featured slot).
  - The fix holds across supported table densities, font scaling, viewport sizes, both e2e browsers (Chromium and WebKit), focus/hover states, and themes.
  - A visual or geometry-based regression check fails if the glyph is clipped (e.g. compare the rendered star's bounding box against its container's clip rect, or pixel-sample the glyph's bottom row).
  - Verify the shared icon/button primitive so this cannot recur in another table (the theme doc requires the yellow-filled featured star "rendered unclipped" and fixed per-column toggle slots).
- Owning docs: `docs/webui-theme-arcade-cabinet.md` (flat toggle icons; star treatment; icon sizing rules), `docs/webui-design.md` (affordance classes). Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from a documented rule; note any such edit prominently in the completion report.
- Likely code: the shared flat-toggle/star rendering (accounts tree rows, reference rows, account page header) and any shared icon-button primitive in `frontend/src/components` / `frontend/src/features/accounts`. Find every star render site and fix them through the shared primitive.
- Must not regress: 1tjt compact reference layouts, row-action fit behavior (trxj), toggle slot alignment per the theme doc.

## Tasks

### Task 1: Root-cause diagnosis and shared fix

End state: stars render unclipped everywhere, fixed once in the shared primitive.

- [x] Written diagnosis (in the completion report) naming the clipping box and why prior offsets failed; the fix lands in the shared primitive/styles, with no per-page offsets, and removes any prior local hacks it supersedes.
- [x] Filled and unfilled stars render fully in the chart of accounts, account page header, and every reference table with the featured slot, at both densities, in Chromium and WebKit, in hover/focus states.
- [x] Commit the task as `Fix favorite star clipping at the shared primitive root cause`.

### Task 2: Geometry regression check

End state: clipping cannot silently return.

- [x] A geometry-based e2e check asserts the star glyph's rendered box sits fully inside its unclipped container (or equivalent pixel-based check) in at least the chart of accounts and one reference table, at both densities, in both browsers; the check demonstrably fails against the pre-fix code (state how that was verified in the completion report).
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Add geometry regression check for favorite star clipping`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Favorite star clipping fixed at the shared primitive root cause with a geometry regression check; no page-specific offsets; toggle slot alignment and reference layouts unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `f6xc` with the commits and validation evidence: `kata close f6xc --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
