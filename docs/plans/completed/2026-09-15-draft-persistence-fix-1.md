# Plan: Draft persistence review fixes (feedback fleet Brief E, fix pass 1)

## Goal

A saved draft reopens on its own tab from every generic launch, the remembered-tab preference is retired as redundant, and the review's over-engineering items are trimmed.

## Constraints

- Do not run review-loop.
- Implementation-only; do not edit completed plans, `docs/architecture.md`, or `docs/frontend-architecture.md`.
- Testing policy: do not add e2e tests; net count unchanged; adjust existing assertions only where behavior changed; no REST as action or evidence, no matrices, no fixed waits.
- Fixes required:
  1. Launch tab precedence (operator-verified: after saving a Refund draft, plain `n` opens an empty Spend tab and hides the draft, while the Transactions button restores it on Refund): explicit tab from a chord, a palette entry command, or a `?entry=new:<tab>` deep link wins; otherwise a saved draft opens on its saved tab; otherwise Spend. Plain `n` therefore passes no tab (revert the explicit `"spend"` in the `n` timeout path in `frontend/src/features/app-shell/app-shell.tsx` to `undefined`); the page buttons already pass none. Remove the remembered-tab preference `transactionEntryActiveTab` from `frontend/src/store/preferences.ts`, its model field, and every read or write (entry panel hydration, tab switches, Clear draft), since the saved draft now carries the tab; Clear draft keeps the active tab in memory as before. Update `docs/webui-design.md` (the `n` sentence: opens the saved draft if one exists, otherwise Spend; the nwv6 Clear draft sentence no longer mentions a remembered preference) and the ledger, store, and pages package docs.
  2. Gate saved-draft consumption and the Clear draft confirmation on a "saved draft was restored into this session" flag: consume (delete) the stored draft after a transaction is created only when the session restored one; Clear draft confirms when the draft has user input relative to its session baseline or when a saved draft was restored, not by comparing against a blank draft.
  3. Drop the `inert`/`aria-busy` freeze during the Save draft write and its package-doc sentence; keep the generation bump.
  4. Simplify saved-draft delete failure: proceed with the close (a stale copy simply reopens and can be discarded again) instead of a second confirm and relabeled actions; remove `draftDiscardFailed` and the long labels that required the narrow-screen wrapping fix (keep the `flex-wrap` on the dialog action row only if still needed for the standard labels).
  5. Nits: the `Cmd/Ctrl S` guard ignores `Shift`/`Alt`; skip writing a blank draft on `Cmd/Ctrl S` from a clean create (just close); de-duplicate the "reads accept legacy shapes" sentence in `frontend/src/services/indexeddb/PACKAGE.md`; trim the ledger package-doc draft bullet accordingly.
- Protect, do not regress: everything the operator verified live (Save draft dialog with Discard default, Enter and Escape discarding, Save draft and `Cmd/Ctrl S` restoring the draft with its tab, silent close of a clean or untouched-restored draft, Clear draft removing a saved draft, "Discard transaction changes?" with the discard default, rail Edit continuation) and the full e2e suite; the entry spec stays at 15 tests.
- Mina is pre-production with no users: no compatibility shims.

## Success Criteria

- [x] With `just dev --demo`: save a Refund draft with `Cmd/Ctrl S`; plain `n` on Overview reopens it on Refund with its memo; `n i` opens Income with the draft's other tabs intact; with no saved draft, plain `n` opens Spend; Clear draft on a restored draft confirms and removes it; a fresh Spend after "Save and add another" closes without a Clear confirmation.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/transactions/entry.spec.ts tests/e2e/keyboard-shortcuts.spec.ts tests/e2e/command-palette.spec.ts` passes on chromium and webkit with counts unchanged.
- [x] `just pre-commit` passes.
- [x] Commit as `fix(ledger): open saved drafts on their tab and trim draft-save edge handling`.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.
