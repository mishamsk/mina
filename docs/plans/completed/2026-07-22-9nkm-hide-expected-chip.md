# Plan: Render Hide expected as an icon chip in transaction toolbars — Kata `9nkm`

The Hide expected control becomes a Filter-family framed icon toggle: `calendar-weeks` glyph when expected rows are visible, a project-local `calendar-weeks-off` glyph plus the sky pressed tint when hidden, with full state semantics. Kata issue: `9nkm`.

## Plan Context

- The design phase is complete. Implement the behavior contract in `docs/webui-design.md` (section 8 hide-based filter bullet: standing toolbar icon toggle in the Filter-toggle control family beside the class dropdown; constant accessible name "Hide expected"; `aria-pressed` state; tooltip naming state and action; glyph shape carries state — never color alone; never a chip-backed filter dimension; filter-bar clearing does not touch it) and the visual contract in `docs/webui-theme-arcade-cabinet.md` (toolbar state toggles: standard outline buttons latching the sky table-header tint while pressed, swapping to an off/struck glyph; `calendar-weeks` + project-local `calendar-weeks-off` built with pixelarticons' eye-off stepped-strike technique). Both docs are already updated on this branch — implement exactly them.
- Additional detail in the untracked working files `design-prototypes/prototype-a.md` and `design-prototypes/judgment.md` (glyph construction, tooltip wording, narrow behavior, `prefers-reduced-motion` note, e2e hooks). Read them; NEVER commit `design-prototypes/`.
- Grafted decisions: NO latched press translate — pressed state is the sky tint + struck glyph only (matches the shipped Include-hidden toggles); the control keeps its URL-backed `hideExpected` state and slot beside the class dropdown; the Filter X-clear leaves it untouched (already true — must not regress).
- Affected code: `frontend/src/features/ledger/transaction-browser-toolbar.tsx` (replace the current labeled checkbox), the shared line-icons/pixel-glyph module for the new `calendar-weeks-off` glyph. The glyph must stay distinct from the Today button's plain `calendar` glyph.
- Must not regress: toolbar layout/wrap behavior at narrow widths (control wraps atomically), hf98 bulk-mode toolbar swap, existing hide-expected URL semantics and e2e.
- Update `frontend/src/features/ledger/PACKAGE.md` only if contract wording changes; this is toolbar polish — no `PROJECT_STATE.md` update needed.
- Targeted ground-truth doc updates are allowed only if implementation genuinely diverges from the documented rule; note any such edit prominently in the completion report.

## Tasks

### Task 1: Replace the checkbox with the icon toggle

End state: the toolbar renders the framed icon toggle per both doc contracts, in every transaction-browser embedding.

- [x] The Hide expected control is a standard outline icon button (Filter-toggle anatomy and size) beside the class dropdown: `calendar-weeks` glyph when expected rows are visible; when active, `aria-pressed="true"`, sky table-header tint, and the project-local `calendar-weeks-off` struck glyph (stepped-strike per the set's eye-off technique, distinct from the Today button's calendar).
- [x] Constant accessible name "Hide expected"; tooltip names state and action per state; keyboard operable; visible focus ring; `prefers-reduced-motion` respected (no intermediate frames).
- [x] URL-backed hide-expected state and filter X-clear independence unchanged; narrow toolbars wrap the control atomically.
- [x] Commit the task as `Render Hide expected as a toolbar icon toggle`.

### Task 2: End-to-end coverage

End state: e2e pins the toggle's state semantics.

- [x] E2E asserts: control present with accessible name and `aria-pressed` reflecting URL state; toggling hides/shows expected rows and updates the URL; glyph/pressed treatment changes state (asserted via aria-pressed and a state-bearing attribute/class, not raw pixels); filter-bar clear leaves it untouched; behavior at a narrow supported viewport.
- [x] `just test-frontend-e2e` passes.
- [x] Commit the task as `Cover the Hide expected icon toggle with e2e tests`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean (`design-prototypes/` stays untracked and uncommitted).
- [x] With a clean worktree run `just review-loop "Hide expected as a Filter-family icon toggle per updated docs: calendar-weeks/calendar-weeks-off glyphs, sky pressed tint, aria-pressed semantics, URL state and filter-clear independence unchanged."` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Never invoke review-loop a second time — one invocation satisfies this item permanently; findings that remain after the fix commits go into the completion report instead.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
- [x] Close Kata issue `9nkm` with the commits and validation evidence: `kata close 9nkm --done --message "<summary>" --commit <sha> --test "just pre-commit; just test-frontend-e2e" --agent`.
