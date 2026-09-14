# Plan: Keyboard shortcuts help review fixes (Kata f6qg, fix pass 1)

## Goal

Close the review findings on branch `f6qg-shortcuts-help-modal`: global shortcuts are suppressed while the transaction entry modal is open, the help catalog contains only groups a user can actually see, the dialog opens without a tooltip flash, and small consistency issues are cleaned up.

## Constraints

- Do not run review-loop.
- Implementation-only; do not edit completed plans, `docs/architecture.md`, or `docs/frontend-architecture.md`. Package docs and the two design-doc bullets touched by this branch may be adjusted where the fixes change their wording.
- Fixes required:
  1. Entry modal suppression (major, operator-verified: `?` mounts the help dialog beneath the entry modal at a lower z-index and steals focus into it): add `data-global-shortcut-blocking-overlay` to the entry modal's `Dialog.Content` in `frontend/src/features/ledger/entry-modal.tsx`, mirroring `frontend/src/features/templates/template-editor-modal.tsx`. This also makes `Cmd/Ctrl K` and `n` inert while the modal is open, which matches the design intent for modal overlays.
  2. Dead groups: remove the `palette` group registration in `frontend/src/features/command-palette/command-palette.tsx` (the palette is always closed when help renders). Convert the entry-modal group in `entry-modal.tsx` into a static "Transaction entry" group in the shell catalog (`frontend/src/features/app-shell/global-shortcuts.ts`), shown on every route after Global, because the modal opens from anywhere via `n` and its keys (`Cmd/Ctrl Enter`, `Cmd/Ctrl Shift Enter`, picker segment keys, `Esc`) are worth learning before opening it; drop the per-mount registration. Keep the recurring-editor group.
  3. Initial focus: on open, focus the catalog scroll region (already `tabIndex=0`) or the dialog content via `onOpenAutoFocus` with `focusWithoutTooltip`, so the close button's tooltip does not flash on every open; the close button remains reachable by Tab.
  4. Consistency: import the registry through the `@/store` barrel with named exports instead of deep `@/store/keyboard-shortcuts` imports; make the `n` handler in `app-shell.tsx` use the extracted `isEditableTarget`; replace the `"↑ / ↓"` combined token in `frontend/src/features/ledger/transaction-browser.tsx` with separate `↑` and `↓` chips; replace `browseShortcuts.slice(0, 1)` with two explicit constants (browse vs Edit mode); give `ReferenceTree` a caller-supplied group title so Categories, Tags, and Templates pages name their own group instead of "Reference tables".
- Protect, do not regress: every behavior verified by the operator on this branch (groups per route, Edit-mode group only while enabled, palette action opener focus restore, `?` suppression inside inputs and while the palette is open, phone-width rendering, cabinet landmark treatment) and the existing e2e suite.
- Coverage: extend `frontend/tests/e2e/keyboard-shortcuts.spec.ts` (3 tests) so the suppression test also opens the entry modal with `n`, presses `?`, and asserts no keyboard-shortcuts dialog element exists in the DOM (use a locator that is not filtered by `aria-hidden`, such as `page.locator("[role='dialog'][aria-label='Keyboard shortcuts']")` or the dialog's `data-testid`), then closes the modal.
- Mina is pre-production with no users: no compatibility shims.

## Success Criteria

- [x] With `just dev --demo`: open the entry modal with `n`, press `?` and `Cmd/Ctrl K`; nothing opens and focus stays in the modal. Close it; `?` opens help showing Global, Transaction entry, and the route's group; the close button's tooltip is not visible on open.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/keyboard-shortcuts.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/transactions/entry.spec.ts tests/e2e/recurring-page.spec.ts` passes on chromium and webkit.
- [x] `just pre-commit` passes.
- [x] Commit as `fix(app-shell): suppress shortcuts under the entry modal and tidy the help catalog`.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.
