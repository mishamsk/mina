# Plan: Entry chords (feedback fleet, Brief D)

## Goal

`n` opens the transaction entry modal on Spend; two-key chords `n s`, `n i`, `n r`, `n t`, `n e`, and `n a` open it on Spend, Income, Refund, Transfer, Exchange, and Advanced. After `n`, a short chord window accepts the tab key; when it lapses the modal opens on Spend. Chords are ignored while typing or while a blocking overlay is open. The Global help group and the palette entry commands advertise the chords.

## Constraints

- No Kata issue; this is Brief D of `docs/plans/2026-09-14-p1-p2-feedback-fleet.md`.
- Implementation lives entirely in the existing `n` keydown effect in `frontend/src/features/app-shell/app-shell.tsx` (effect-local pending state and timer; no store, no new module):
  - Switch the listener to capture phase (as the Cmd/Ctrl+K handler already is) so the second key beats row-scoped Edit-mode keys such as `a` or `t`.
  - First key: the existing guards stay (no modifiers, `hasActiveOverlay()`, `isEditableTarget`); on match `preventDefault`, mark the chord pending, and start a 500 ms timer that opens Spend explicitly (`openTransactionEntryPanel("spend", captureTransactionEntryLaunchContext())`). Plain `n` therefore opens Spend regardless of the remembered tab preference; the Transactions page buttons keep their current behavior.
  - While pending: modifier-only keys are ignored; a mapped key (`s`, `i`, `r`, `t`, `e`, `a`) clears the timer, `preventDefault` and `stopPropagation`, and opens that tab (`a` maps to `advanced`); `Escape` cancels the chord silently; any other key clears the timer and opens Spend immediately without swallowing that key.
  - Cancel a pending chord on window `blur` and `visibilitychange` and in the effect cleanup (pattern from `frontend/src/hooks/use-accelerator-held.ts`).
- Help: in `frontend/src/features/app-shell/global-shortcuts.ts` keep the `n` row ("New transaction", Spend) and add one chord row with keys `["n", "s"]`, label "New transaction on a tab", and detail "n then s, i, r, t, e, or a for Spend, Income, Refund, Transfer, Exchange, or Advanced." (the existing `detail` convention; do not invent a "then" token in `Kbd`).
- Palette (`frontend/src/features/command-palette/command-palette.tsx`): change the five entry commands' `shortcut` from `["n"]` to their chord tokens, and add an `entry-advanced` command ("New advanced entry", `["n", "a"]`, opens `advanced`) so every chord has a palette counterpart; keep template commands without hints.
- Preserve: `n` suppression inside the palette, confirmations, the recurring editor, and editable targets; the `?entry=new:<tab>` URL round trip (Advanced serializes as `journal`); all other global shortcuts.
- Docs: amend the Global shortcuts bullet and the entry-points bullet in `docs/webui-design.md` (chords and the window); the `KeyboardShortcutsDialog`/`Kbd` primitive bullets only if wording changes; `frontend/src/features/app-shell/PACKAGE.md` and `frontend/src/features/command-palette/PACKAGE.md` via the `write-package-docs` skill; `PROJECT_STATE.md` one phrase.
- Testing policy (mandatory): `docs/FRONTEND-TESTING.md` governs. Do not add e2e tests; reviewers must not request coverage. Fold exactly one chord assertion into the existing journey in `frontend/tests/e2e/transactions/entry.spec.ts` that presses `n` on Overview (close the editor, press `n` then `i`, assert the Income tab is selected). The existing plain-`n` Spend assertion in `keyboard-shortcuts.spec.ts` and the suppression assertions stay as they are. Net test count unchanged. No REST as action or evidence, no matrices, no fixed waits (use web-first assertions; the 500 ms window is exercised by the immediate second key, not by waiting).
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo`: on Overview and on Transactions, `n` alone opens Spend after the window; `n i`, `n r`, `n t`, `n e`, `n a` open the respective tabs immediately; `n` then `x` opens Spend; `n` then `Escape` opens nothing; typing `n` inside the search field types the letter; `n` while the palette is open does nothing; in Transactions Edit mode with a row focused, `n t` opens Transfer rather than the Tags dock; the help lists both rows; palette entry commands show their chord chips.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/transactions/entry.spec.ts tests/e2e/keyboard-shortcuts.spec.ts tests/e2e/command-palette.spec.ts tests/e2e/recurring-page.spec.ts` passes on chromium and webkit with test counts unchanged.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-entry-chords.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report. Reviewers must not request added coverage.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Chord handling in the shell

- [x] The chord window, mappings, cancellation, and capture-phase ordering work per Constraints.
- [x] Commit as `feat(app-shell): add entry chords for new transaction tabs`.

### Task 2: Help rows, palette hints, docs, and the folded assertion

- [x] Help and palette advertise the chords (including the new Advanced command); docs and package docs updated; one assertion folded; `just prose-fmt` run.
- [x] Commit as `docs(frontend): advertise entry chords in help and the palette`.
