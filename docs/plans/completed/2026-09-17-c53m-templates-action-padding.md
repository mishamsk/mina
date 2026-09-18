# Plan: Fix Templates table trailing action padding — c53m

## Goal

Make Templates leaf and group actions end at the standard 12px table inset, matching the Name cell's leading padding, while preserving stable columns, action order, responsive overflow, and keyboard access. Kata issue: `c53m`.

## Constraints

- Frontend-only, confined to the Templates call site and its package contract. Do not change Go, OpenAPI, shared primitives, shared styles, or Categories, Tags, Members, Accounts, and Recurring tables; those tables must remain visually unchanged.
- Do not touch `VISION.md`, `SCOPE.md`, `docs/architecture.md`, `docs/frontend-architecture.md`, `docs/webui-design.md`, or `docs/webui-theme-arcade-cabinet.md`. No `PROJECT_STATE.md` update for this call-site-only correction.
- Use `write-package-docs` for `frontend/src/features/templates/PACKAGE.md`. Shared package docs remain unchanged because this plan does not change their primitives; any separately justified shared change would require the corresponding reference/components package docs and reconsideration of user-visible effects elsewhere.
- Preserve the existing fixed-table layout, fluid Name sizing, Defaults percentage sizing, header band, and narrow-width rules. Do not derive widths or slot declarations from currently loaded rows, search results, hover, focus, or action availability. Removing the oversized action column lets the fluid Name column reclaim its space once; it must not cause subsequent content-dependent shifts.
- Preserve action eligibility, disabled styling, tooltips, handlers, propagation guards, roving-row focus, and overflow behavior. Do not add template toggles or change deletion semantics.
- `docs/FRONTEND-TESTING.md` governs. No new e2e test for a bug fix or small behavior change; fold a visible assertion into the existing journey that already exercises that surface, or add nothing.
- No REST calls as the action or evidence under test; fixture-only API setup is allowed when it keeps a journey short. No per-state or per-route matrices, no exact-geometry assertions, no fixed waits.
- Net e2e test count may only go down or stay equal for this task (baseline: 137 `test(` declarations under `frontend/tests/e2e`, counted with `rg -n '^test\(' frontend/tests/e2e`). Expected test edits: none (a coarse "no empty indicator slot rendered in Templates rows" assertion may be folded into an existing Templates journey only if it is not a pixel/geometry assertion; adding nothing is the default).
- Do not add e2e tests; reviewers must not request coverage; fold any missing assertion into an existing journey.
- Before authoring a subplan, the operator reads the relevant `docs/webui-design.md` sections (Keyboard, Tables and filtering, Transaction entry) and `docs/webui-theme-arcade-cabinet.md`, and the planning prompt requires a short design spec in the subplan: placement, states, geometry stability (no layout jumps on focus, hover, or modifier state), theme tokens, keyboard and focus behavior.
- Implementor screenshots of the changed surface are required in the completion report; the operator judges them against the theme doc before merge. Anything jumpy, re-ordering, or styled off-theme is a fix-plan defect, not a nit.
- Focus visuals follow the existing entity-list contract: roving-tabindex row navigation with hover-style row highlight; no focus ring on non-editable surfaces.
- The implementor must close every `agent-browser` session it opens, including named `--session` sessions, before finishing, and include screenshot paths in the completion report.
- Run formatting and validation through Justfile recipes only. Run `just prose-fmt`, `just pre-commit`, and `just test-frontend-e2e` before the implementation commit. No backend suites (`just test` or `just test-integration`); no tests or broad validation for the docs-only plan-move commit.

## Design Spec

- Placement: trailing actions column, rightmost, unchanged order Use / Edit / Create recurring / Move / Delete for leaves and Move for groups; the rightmost button's outer edge sits at the standard `px-3` (12px) inset from the table's inner right border, matching the Name cell's left inset.
- Geometry stability: fixed column width equal to the cluster plus padding; no width change between rows, on hover/focus, on paging, or on search; header band unchanged.
- Theme: no new tokens; row-action buttons keep the outline-at-rest / chip-shadow-on-hover / press-in treatment; disabled Delete keeps the muted treatment.
- Keyboard/focus: unchanged roving-row contract; Tab from the active row reaches the first action; the fold-into-⋯ behavior unchanged.
- Screenshots required in the completion report: Templates page at 1280px wide (roomy) showing the cluster at the standard inset next to the border, and at a narrow width showing the fold into ⋯; plus a Categories screenshot at 1280px proving it is unchanged.

## Verified Evidence and Decision

- `kata show c53m --agent` confirms the inset, rightmost placement, responsive, and keyboard acceptance criteria. Planning reads include the required architecture, design, theme, testing, and three package docs; the theme's no-toggle/no-slot rule is at `docs/webui-theme-arcade-cabinet.md:125`.
- `frontend/src/features/templates/templates-page-content.tsx:272–325` returns five button-class leaf actions and only Move for groups, with no toggles. Its `ReferenceTree` starts at line 385, sets the 15.25rem override at line 387, declares unused featured/hidden slots at line 407, and renders Defaults at lines 438–442.
- `frontend/src/components/row-actions.tsx:70–71` defines 28px placeholder slots; lines 152–157 preserve missing declared slots, lines 161–166 count them in the direct cluster, and lines 290–298 render them. Lines 276–288 already provide a full-width, right-justified foldable cluster. The two phantom slots plus gaps account for 64px beyond the normal inset: `12 + 7×28 + 6×4 + 12 = 244px` (15.25rem).
- `frontend/src/features/reference/reference-tree.tsx:141–142` supplies the 11.25rem default, exactly `12 + 5×28 + 4×4 + 12 = 180px`. Lines 191–204 retain Defaults at 20% above `sm` and actions at the fixed variable width; lines 324–329 and 403–407 apply the same variable to loading and loaded surfaces. Lines 416–433 define the fixed table and empty actions header, and lines 522–532 retain `px-3 py-2` and forward slots to foldable `RowActions`.
- Comparators are intentional: Categories has featured/hidden toggles at `frontend/src/features/categories/categories-page-content.tsx:236–258`, a group hidden toggle at lines 274–288, and slot declarations at line 354. Tags has equivalent toggles at `frontend/src/features/tags/tags-page-content.tsx:232–252`, group hidden at lines 268–282, and declarations at line 346. Members has a hidden toggle at `frontend/src/features/members/members-page-content.tsx:421–435` and declares both slots at line 449; its empty featured slot is intentional because the table renders hidden toggles.
- `frontend/src/styles.css:818–827` folds five controls below a 156px content width. The existing journey at `frontend/tests/e2e/templates-page.spec.ts:141–172` uses a 600px viewport and activates Create recurring from overflow. Source inspection confirms 137 existing e2e declarations; no tests were run during planning.
- Decision: remove Templates' `indicatorSlots` and custom `actionsColumnWidthClassName` props, inheriting the shared 180px roomy width. No shared guard is needed: the caller already knows this table has no toggles, and a row-local guard could erase intentional alignment slots in other tables. Keep one implementation task.

## Success Criteria

- [x] Templates leaves show the five actions in their existing order with no phantom indicator slots, and groups show only Move, right-aligned at the same standard inset. The roomy column fits the cluster plus padding exactly; Name and Defaults remain stable across row content and search, with no data-page-dependent sizing.
- [x] Manual browser evidence confirms unchanged hover/focus geometry and header band, Tab from the active leaf row reaches Use, Tab from a group reaches Move, and narrow leaves fold into reachable ⋯ actions. Categories, Tags, Members, Accounts, and Recurring remain visually unchanged; shared code and their call sites have no diff.
- [x] Capture Templates at 1280px with representative leaf and group rows and at 600px with overflow visible; capture Categories at 1280px against a same-data baseline. Include screenshot paths and observed keyboard/search stability in the completion report, and close all opened browser sessions. Templates follows API result pages into one tree rather than exposing a paging control; do not add pagination UI or a paging test for this task.
- [x] `frontend/src/features/templates/PACKAGE.md` records the table-wide no-toggle/no-slot contract and stable action-column sizing through `write-package-docs`, linking to the owning table/theme rules instead of duplicating them.
- [x] `just pre-commit` and `just test-frontend-e2e` pass before the implementation commit; e2e declaration count stays at or below 137, with no added tests.
- [x] From a clean worktree after committing the implementation and this plan if still uncommitted, run `just review-loop --plan "docs/plans/2026-09-17-c53m-templates-action-padding.md"` exactly once. Resolve in-scope findings, rerun only affected validation, and commit resulting fixes. Never rerun review-loop, even if findings remain; report remaining findings in the completion report. Reviewers must not request coverage or new tests; any necessary assertion belongs in an existing journey.
- [x] Close Kata with the verified implementation/fix commit and actual validation evidence: `kata close c53m --done --message "Templates trailing actions use the standard inset; responsive and keyboard behavior verified." --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
- [x] Move this plan to `docs/plans/completed/2026-09-17-c53m-templates-action-padding.md`, commit the docs-only move without rerunning suites or review-loop, and leave the worktree clean.

## Tasks

### Task 1: End Templates actions at the standard inset

- [x] Remove only the Templates slot declaration and oversized action-width override; inherit the shared roomy width and existing narrow sizing. Keep all action definitions, Defaults rendering, and row behavior intact.
- [x] Update the Templates package contract using `write-package-docs`; leave shared package docs and `PROJECT_STATE.md` unchanged.
- [x] Perform the manual visual/keyboard checks and capture the required screenshots, keeping a same-data Categories baseline for comparison. Add no tests by default; retain the existing narrow Templates journey.
- [x] Run the plan-wide formatting and validation commands, confirm the e2e declaration count has not increased, and inspect the diff for the intended Templates-only scope.
- [x] Commit as `fix(templates): end trailing row actions at the standard table inset`, then complete the one-time review, Kata closure, and plan move in Success Criteria.
