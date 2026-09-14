# Plan: Fix keyboard behavior in the entry-draft discard confirmation (Kata kp0d)

## Goal

The transaction-entry "Discard entry draft" confirmation (opened when a saved transaction is launched into the editor while an unsaved ordinary draft exists) is fully keyboard-operable: it opens with Discard draft focused so Enter discards, Tab and Shift+Tab move between exactly the two dialog actions inside the dialog's focus trap, and Escape keeps the draft and closes only the confirmation.

- The shared confirmation dialog no longer exposes hidden tab stops in any of its consumers.
- Browser coverage proves initial focus, Tab/Shift+Tab traversal, Enter-to-discard, and Escape-to-keep.

## Constraints

- Kata issue: `kp0d`. The target dialog is `frontend/src/features/ledger/entry-panel.tsx` "Discard entry draft" (labels "Keep draft" / "Discard draft"), reachable by dirtying a create draft, closing the editor, and launching a saved transaction with Edit (see `frontend/tests/e2e/transactions/entry.spec.ts` "palette templates replace sticky defaults and protect modified drafts" for the existing repro path).
- Root causes established by operator repro (chromium and webkit at 1280×800):
  - `frontend/src/components/confirmation-dialog.tsx` wraps each action in `Tooltip` whenever a pending/disabled tooltip is configured; `frontend/src/components/tooltip.tsx` renders a `<span tabIndex={0}>` trigger by default, so the dialog has four tab stops (span, Keep draft, span, Discard draft). In WebKit, Tab from Keep draft lands on the span inside Discard draft and stays there; the Discard button is never reached.
  - The confirm control is a plain `Button` with no ref, and the dialog only supports `initialFocusRef`; Radix focuses Cancel by default, so Discard cannot be the initial focus today.
  - Likely third cause to verify: the entry panel's initialization focus effect (around `entry-panel.tsx` "currentDraftReady" handling) runs after the launch-conflict branch opens the confirmation; its `entryPanelRef.contains(document.activeElement)` guard is false for the portaled dialog, so it can re-focus the template picker (which opens its listbox) and steal focus from the dialog. Fix it if reproducible; do not add speculative guards otherwise.
- Fix the tab-stop pollution in the shared `ConfirmationDialog` for every consumer (pass `focusable={false}` or use `asChild` on its tooltip wrappers so the button itself is the trigger); do not change `Tooltip`'s default for other callers.
- Add an explicit opt-in for initial focus on the confirm action (for example an `initialFocus: "cancel" | "confirm"` prop backed by an internal confirm ref). The default stays Cancel; `frontend/tests/e2e/recurring-page.spec.ts` asserts the recurring discard dialog focuses "Keep editing" first and must keep passing. Only the "Discard entry draft" dialog opts into confirm-first focus in this task.
- Escape behavior stays as is: the dialog's capture listener closes only the confirmation while idle, `cancelPendingLaunch` keeps the ordinary draft and restores focus inside the editor. Verify and cover; do not redesign.
- Preserve: pending states with tooltips (`aria-disabled` buttons remain focusable and show their tooltip), the Escape ladder in `docs/webui-design.md` (entry modal bullet on Esc), `[data-slot='confirmation-dialog-content']`, caller-owned close-focus restoration.
- Browser coverage per `docs/FRONTEND-TESTING.md`: one focused test in `frontend/tests/e2e/transactions/entry.spec.ts` (14 tests today, cap 25) or the closest sibling spec; web-first assertions only, no fixed delays.
- Docs: add at most one sentence to the entry modal section of `docs/webui-design.md` stating that the entry-draft discard confirmation focuses Discard draft on open; update `frontend/src/components/PACKAGE.md` (dialog actions are the only tab stops; confirm-first focus opt-in) and `frontend/src/features/ledger/PACKAGE.md` via the `write-package-docs` skill. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `VISION.md`, or `SCOPE.md`.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] Opening "Discard entry draft" focuses the Discard draft button in chromium and webkit; Enter discards the ordinary draft and opens the launched transaction in the editor.
- [x] Tab moves focus from Discard draft to Keep draft and Shift+Tab back; no other element inside the dialog receives focus, and focus never leaves the dialog while it is open.
- [x] Escape closes only the confirmation; the editor stays open with the ordinary draft values intact and focus inside the editor.
- [x] Every other `ConfirmationDialog` consumer has exactly two action tab stops (spot-check "Clear entry draft?", "Discard transaction changes?", and the recurring "Discard definition changes?" dialogs manually with `just dev --demo`).
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e` passes (full suite: the shared dialog changed).
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-entry-discard-confirmation-keyboard.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `kp0d` with the commits and validation evidence (`kata close kp0d --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Shared confirmation dialog: two tab stops and a confirm-first focus opt-in

Change `frontend/src/components/confirmation-dialog.tsx` so tooltip wrappers never add tab stops, and add the confirm-first initial-focus option with an internal ref on the confirm button. Keep `initialFocusRef` working for its existing callers.

- [x] Dialog actions are the only focusable elements inside any `ConfirmationDialog`; pending tooltips still open on focus/hover of the `aria-disabled` button.
- [x] Confirm-first focus is available and defaults off.
- [x] Commit as `fix(components): keep confirmation dialog actions as the only tab stops`.

### Task 2: Entry-draft discard confirmation focus

Opt the "Discard entry draft" dialog into confirm-first focus. Reproduce the focus-steal by the entry initialization effect; if present, make that effect skip focusing while a launch-conflict confirmation is open (or while the active element is inside an alert dialog) and confirm the template picker listbox does not open underneath the dialog. Verify Escape keeps the draft and returns focus into the editor.

- [x] Manual check with `just dev --demo` in chromium and webkit: initial focus on Discard draft, Tab/Shift+Tab cycle between the two actions, Enter discards, Escape keeps.
- [x] Commit as `fix(ledger): make the entry-draft discard confirmation keyboard operable`.

### Task 3: Browser coverage

Add one focused e2e test reusing the existing repro path: dirty a create draft, reload, launch Edit on a saved row, assert Discard draft is focused, Tab → Keep draft, Shift+Tab → Discard draft, Escape → dialog gone and the draft memo still present in the editor, relaunch Edit → Enter → the saved transaction is loaded in the editor.

- [x] The test passes on chromium and webkit and stays within the spec cap.
- [x] Commit as `test(frontend): cover keyboard operation of the entry-draft discard confirmation`.

### Task 4: Docs

Apply the doc updates listed in Constraints and run `just prose-fmt`.

- [x] Package docs and the single design-doc sentence are updated.
- [x] Commit as `docs(frontend): document confirmation dialog tab stops and confirm-first focus`.
