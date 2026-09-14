# Plan: Align the Economic intent selector with adjacent controls (Kata me5f)

## Goal

In the desktop Categories toolbar, the Economic intent dropdown has the same outer height and vertical alignment as the search field and the Include hidden control, with its selection, keyboard, focus, and responsive behavior unchanged, and focused geometry coverage that prevents the regression.

## Constraints

- Kata issue: `me5f`.
- Root cause (operator-measured at 1280×800): the trigger in `frontend/src/pages/categories-page.tsx` uses `size="compact"`, which maps to `h-8` (32px) in `frontend/src/components/ui/select.tsx`, while the search input in `frontend/src/features/reference/reference-toolbar.tsx` and the Include hidden `Button size="lg"` are `h-9` (36px); the `items-end` row bottom-aligns them so the trigger's top edge and label sit 4px lower. Fix: use the default trigger size on that control (keep `min-w-32`, the `id`/`htmlFor` label pairing, and the label wrapper). Do not change the shared Select component, the `compact` size used by dense in-table controls, or the toolbar row classes.
- Preserve selection, keyboard, focus, URL `economic_intent` behavior, and the compact-shell listbox behavior.
- Coverage per `docs/FRONTEND-TESTING.md`: one fixture-free test in `frontend/tests/e2e/categories-page.spec.ts` (6 tests today) at `1280×800` asserting the intent trigger's bounding-box height and top edge match the search input's within 1px and its height matches the Include hidden control's within 1px, using the existing null-guard `boundingBox` style from `frontend/tests/e2e/reference-drilldowns.spec.ts`. No pixel matrices.
- Docs: soften the word "compact" in the Categories bullet of `docs/webui-design.md` (currently "a compact Economic intent selector") to mean narrow at standard toolbar-control height so the regression does not return; add nothing else. Update `frontend/src/features/reference/PACKAGE.md` only if a standing-control height expectation is worth stating, via the `write-package-docs` skill. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `docs/webui-theme-arcade-cabinet.md`, `VISION.md`, or `SCOPE.md`.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo` at 1280×800, the Economic intent trigger, the search input, and Include hidden share the same height and top edge; selecting an intent still updates the URL and the list.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/categories-page.spec.ts` passes on chromium and webkit.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-align-economic-intent-selector.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `me5f` with the commits and validation evidence (`kata close me5f --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Standard-height intent trigger

- [x] The trigger uses the default size; manual check confirms alignment and unchanged behavior.
- [x] Commit as `fix(categories): align the Economic intent selector with toolbar controls`.

### Task 2: Geometry coverage and docs

- [x] The geometry test passes on both browsers; the design-doc wording is updated; `just prose-fmt` run.
- [x] Commit as `test(frontend): guard Categories toolbar control alignment`.
