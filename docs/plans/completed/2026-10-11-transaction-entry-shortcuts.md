# Plan: Reliable transaction-entry shortcuts and discoverable button hints

## Goal

Make transaction-entry actions work throughout the active editor, including after clicking away from an input and opening and closing keyboard help. Simplify hotkey capture where it makes this behavior more robust, and show existing shortcuts on hover for key action buttons throughout Mina.

- `Ctrl+Enter`: Save and add another in create/duplicate; Update transaction in edit/split.
- `Ctrl+Shift+Enter`: Save and close in create/duplicate; update and close in edit/split, where both save shortcuts perform the same action.
- `Ctrl+S`: Save the create draft and close, preserving the existing draft-save eligibility and behavior.
- `Ctrl` means the physical Control key on every platform, including macOS; these hints must never render as `Cmd/Ctrl`.

## Constraints

- Inspect the transaction hotkey capture path and simplify redundant routing, handlers, or capture-specific checks where supported by the code. Establish clear ownership that works with input and non-input focus; keep this simplification strictly within hotkey capture, without refactoring editor state, submission, draft persistence, focus management, or unrelated UI behavior.
- Replace the transaction submission and draft-save bindings with physical Control, without retaining Command aliases for those actions. Preserve template-search `Cmd/Ctrl+Shift+F`, picker navigation, global entry chords, and unrelated shortcuts. Do not add configurable bindings, a new global shortcut framework, or browser keyboard locking.
- Save shortcuts belong to the active transaction editor and must yield to higher-priority help, confirmation, and nested editing surfaces. Preserve validation, disabled/pending action gates, explicit stale-write retries, draft protection, and focus restoration; shortcut and button activation must use the same action semantics.
- Button hints cover existing explicit action shortcuts across the app, rather than assigning new shortcuts or advertising ordinary Enter/Space activation. Scope hints to the action and context where the shortcut actually works; a staged Escape ladder must not be described as unconditional close.
- Shortcut hints open on pointer hover only; keyboard or programmatic focus must not newly trigger them. Reuse the shared styled `Tooltip` with narrowly scoped hover-only support if needed, preserving unrelated tooltip behavior, accessible button names, refs, native button semantics, tab order, disabled explanations, and the flat treatment in `docs/webui-theme-arcade-cabinet.md`; do not introduce native `title` tooltips or a theme redesign. Keyboard shortcuts remain discoverable through `?` help.
- Backend, REST, accounting behavior, persisted preferences, and immutable completed plans stay outside this change.

## Success Criteria

- [x] Both save shortcuts work with focus in an input, on a button or tab, and on the outer dialog after clicking non-interactive form space. Reproduce the user's sequence: leave the input, open `?` help, close help, then save without refocusing an input.
- [x] `Ctrl+S` saves the eligible create draft and closes from input and non-input editor focus; the transaction editor no longer binds draft-save to Command+S. Template search retains `Cmd/Ctrl+Shift+F` and its eligibility rules, and help closes back into the active editor so its shortcuts remain available.
- [x] Create/duplicate save-and-add keeps the editor open and advances the existing session workflow; save-and-close closes after successful save subject to existing draft protections. Edit/split updates close on success. Invalid input retains the editor and shows the existing validation feedback.
- [x] A help or confirmation surface above the editor cannot trigger an underlying transaction save. Picker Enter behavior remains intact, and modified save handling respects already-handled events, text composition, and unavailable/pending actions without duplicate submission.
- [x] Hover exposes action plus shortcut on Save and add another, Save and close, and Update transaction; existing explicit shortcuts on other key buttons receive equivalent hints. Tab navigation and programmatic focus alone do not open the new shortcut hints. Buttons without an action shortcut do not acquire fabricated hints.
- [x] Hints, contextual keyboard help, and dispatch agree. Transaction help explains physical Control on Mac and shows only actions applicable to the current launch; create-only draft and template actions are not advertised in edit/split or other contexts where they are unavailable.
- [x] Extend the existing browser journeys in `frontend/tests/e2e/transactions/entry.spec.ts` and `frontend/tests/e2e/keyboard-shortcuts.spec.ts` with representative submission and draft-save shortcuts, help-return, overlay suppression, hover hints, and absence of focus-triggered hints in both configured Chromium and WebKit projects; keep coverage small and assert visible results, following `docs/TESTING.md` and `docs/FRONTEND-TESTING.md`.
- [ ] Manually verify physical Control+Enter, Control+Shift+Enter, and Control+S in native Safari on macOS with input and non-input focus, including the help-return sequence; record browser/OS versions and results. Playwright key injection and WebKit alone do not prove OS-level delivery. If native verification is unavailable or a collision remains, report that gap and leave this criterion unchecked.
- [x] Update the shortcut and discoverability rules in `docs/webui-design.md`; use `write-package-docs` for every touched package and update only affected contracts. Update `PROJECT_STATE.md` only with concise user-visible progress.
- [x] Run `just prose-fmt`, `just pre-commit`, `just test`, and `just test-frontend-e2e` during implementation and before the application commit. Commit the cohesive change as `fix(ui): make entry shortcuts reliable and expose button hints`.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-10-11-transaction-entry-shortcuts.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Verification Evidence

- Focused entry and keyboard-help journeys: 30 passed across configured Chromium and WebKit projects.
- Full frontend suite: 274 passed across Chromium and WebKit; final affected journeys: 76 passed after the button-hint audit.
- `just prose-fmt`, `just pre-commit`, and `just test` passed; all review fixes also passed required checks and affected Chromium/WebKit journeys.
- One review-loop invocation completed cleanly: eight validated findings fixed in separate commits, then no remaining findings across seven post-fix reviewers.
- Application commit: `bd475243`; review fixes end at `deb5c56e`.
- Native Safari verification was not performed and remains unchecked at Misha’s request. Installed versions observed: Safari 26.6, macOS 15.7.8 (24G824); no native key-delivery result is claimed.

## Implementation Scope

- Transaction hotkey capture and contextual help: `frontend/src/features/ledger/entry-panel.tsx`, `entry-modal.tsx`, and `entry-shortcuts.ts`; inspect their interaction with app-shell help stacking and opener restoration, then choose the smallest clear capture path that handles the active editor regardless of focus and yields to higher-priority surfaces. Remove superseded capture code rather than adding parallel handlers; any document listener must remain scoped to the active editor.
- Button-hint audit starts with ledger entry/footer and Edit-mode dock actions, app-shell command-palette and help controls, Transactions New transaction controls in `frontend/src/pages/transactions-page.tsx` and ledger empty states, and template-editor Save. Include other explicit shortcut-bearing buttons found during that audit, using each owner's existing shortcut and eligibility rules. Existing `Mod+Enter` handlers outside transaction entry already accept Control; their hints may advertise that reliable variant without reassigning unrelated behavior.
- Keep the key definitions reused by handlers, help, and hints narrow and local to their owners; generic components must not import Mina workflow definitions. Do not turn this change into an unrelated package-doc audit or shortcut redesign.

## Compatibility Evidence

- [Apple's Safari shortcut reference](https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac) assigns Command+Return and Shift+Command+Return to browser actions in the Smart Search field; this establishes contextual overlap, not proof of a system-wide collision inside Mina.
- [Gmail's shortcut reference](https://support.google.com/mail/answer/6594?hl=en) uses a modifier+Enter submit action. Physical Control on Mac is a deliberate variation to avoid the Command family while retaining the familiar Enter/Shift pairing.
