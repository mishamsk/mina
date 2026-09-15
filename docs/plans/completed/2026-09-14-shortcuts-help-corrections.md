# Plan: Keyboard shortcuts help corrections (feedback fleet, Brief B)

## Goal

The keyboard shortcuts help shows the Transaction entry group only while the entry modal is visible, which requires `?` to open the help above the open entry modal (stacked, with focus returning into the modal on close). The Command palette group is removed entirely. The dialog shows no focus ring on its scroll region, arrow and page keys scroll the catalog regardless of which element inside the dialog has focus, and Escape closes it. `?` stays suppressed while typing in editable targets and while the palette, a confirmation, a popover, or the recurring editor is open.

## Constraints

- No Kata issue; this is Brief B of `docs/plans/2026-09-14-p1-p2-feedback-fleet.md`.
- Stacking: raise the help dialog above the entry and template modals but below confirmations: overlay `z-[75]`, content `z-[76]` in `frontend/src/features/app-shell/keyboard-shortcuts-dialog.tsx`, keeping `data-modal-overlay` on the overlay. No extra Escape plumbing: Radix scopes Escape to the topmost dismissable layer and pauses the lower focus scope; the existing `onCloseAutoFocus` returns focus to the captured opener inside the modal.
- Keeping `?` alive inside the entry modal without re-enabling `n` or `Cmd/Ctrl K` there: keep `data-global-shortcut-blocking-overlay` on the entry modal; add an entry-modal marker attribute and a second predicate in `frontend/src/features/app-shell/global-shortcuts.ts` (`hasHelpBlockingOverlay`, which ignores only that marker) used solely by the `?` handler in `app-shell.tsx`; `isEditableTarget` stays in the `?` guard.
- Groups: delete `commandPaletteShortcutGroup` and its merge slot; move `transactionEntryShortcutGroup` out of the static prefix and register it from `EntryModal` (permanently mounted, `open` prop) through `useShortcutGroup(..., open)` with `order: 2` so it renders right after Global while the modal is open. The template-editor modal keeps blocking `?`.
- Scroll region: keep `tabIndex={0}` on the catalog region (existing Tab assertions rely on it) and add `focus-visible:outline-none`; add a dialog-level `onKeyDown` on the content that scrolls the region for ArrowDown/ArrowUp (about 56px), PageDown/PageUp (about 90% of the visible height), Home/End, with `preventDefault`, regardless of whether the region or the close button has focus. Escape is untouched.
- Design spec: unchanged landmark treatment; no visible ring on any element at open (the region receives initial focus without a ring; the close button shows its ring only when tabbed to); the dialog above the entry modal keeps the modal visible behind the scrim; nothing shifts.
- Docs: update the `KeyboardShortcutsDialog` primitive bullet in `docs/webui-design.md` (Global plus mounted page/overlay groups; Transaction entry group only while the entry modal is open; help stacks above the entry modal; suppressed while typing or while palette, confirmations, popovers, or the recurring editor are open); light touch on the overlay inventory bullet if needed; `frontend/src/features/app-shell/PACKAGE.md`, `frontend/src/features/ledger/PACKAGE.md`, and `frontend/src/features/command-palette/PACKAGE.md` via the `write-package-docs` skill. `PROJECT_STATE.md` unchanged.
- Testing policy (mandatory): `docs/FRONTEND-TESTING.md` governs. Do not add e2e tests; reviewers must not request coverage; fold changes into `frontend/tests/e2e/keyboard-shortcuts.spec.ts` (3 tests): the first test stops asserting the Transaction entry heading off-modal and stops asserting the Command palette row; the scroll-region test may assert one ArrowDown scroll with the close button focused instead of the End press; the overlay test inverts its entry-modal step to "help opens above the modal, shows the Transaction entry group, Escape closes help and focus returns into the modal" using a `data-testid` locator for the modal while help is open (Radix marks the modal `aria-hidden` under a stacked dialog). Net test count unchanged. No REST as action or evidence, no matrices, no geometry assertions, no fixed waits.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo`: on Overview `?` shows Global only; with the entry modal open, `?` opens help above the modal showing Global and Transaction entry, `Escape` closes help with focus back on the element that had it in the modal, and `n`/`Cmd/Ctrl K` stay inert in the modal; `?` typed in a field does nothing; with the palette open `?` does nothing; no Command palette group anywhere; no focus ring visible on open; ArrowDown/PageDown scroll the catalog with the close button focused; Escape closes.
- [x] Screenshots of the help above the entry modal and of the help on Overview are attached to the completion report.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/keyboard-shortcuts.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/transactions/entry.spec.ts` passes on chromium and webkit with test counts unchanged.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-shortcuts-help-corrections.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report. Reviewers must not request added coverage.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Stacking, `?` predicate, and modal-scoped entry group

- [x] Help opens above the entry modal; the entry group registers only while the modal is open; the palette group is gone.
- [x] Commit as `fix(app-shell): stack shortcuts help above the entry modal and scope its groups`.

### Task 2: Dialog focus and scrolling

- [x] No ring on the region; arrow and page keys scroll from anywhere in the dialog; Escape closes.
- [x] Commit as `fix(app-shell): scroll the shortcuts catalog with arrows and drop its focus ring`.

### Task 3: Docs and folded assertions

- [x] Design doc and package docs updated; the three existing tests adjusted; `just prose-fmt` run.
- [x] Commit as `docs(app-shell): document shortcuts help stacking and modal-scoped groups`.
