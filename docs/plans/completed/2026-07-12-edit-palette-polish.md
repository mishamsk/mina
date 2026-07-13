# Plan: Saved-transaction edit polish + palette search polish (Kata 5hvz, ybtb)

Grouped low-priority review residuals. Both issues predate the inline-recurring direction change (b1m2) and the editing suite (4xb9/gtmn/89d7/ds26) — reconcile each item against CURRENT behavior first; fix what still applies, and record any item that is already resolved by the newer work in the kata close instead of re-implementing it.

## Plan Context

- Kata issues: `5hvz` and `ybtb`. One sub-branch, one commit each.
- MANDATORY pre-reads: `docs/webui-design.md` (detail actions, feedback rules), `docs/recurring-transactions-semantics.md` (no confirm-with-edits — expected occurrences are confirmed first, edited after), `docs/TESTING.md`.
- 5hvz items (verify each against current code):
  1. Expected-transaction edit dead-end: the backend rejects PUT on expected transactions (`internal/services/transactions/transactions.go` replace guard), but UI surfaces may still offer Edit/Split (detail panel actions on an expected transaction; entry-panel escalation; anything the editing-suite exclusions missed) and the entry panel may permit keeping expected status on a replacement. Resolution per current semantics: expected transactions expose confirm/dismiss (b1m2), not Edit/Duplicate/Split — hide or disable those actions with an explanatory tooltip wherever they remain reachable, and prevent the expected-status dead-end path pre-submit.
  2. Nanosecond server timestamps blank `datetime-local` controls (>3-digit fractional seconds invalid): normalize/truncate fractions when formatting values into datetime-local inputs (display-only; saves already work).
  3. e2e keyboard tweaks (restore honest coverage): toolbar keyboard test uses a text click where it swapped out Space-toggle; `chooseOptionByKeyboard` early-return can skip actual selection (make it assert selection happened); revisit the unexplained advanced-test date change (restore or justify in the kata comment).
  4. Unsaved in-flight edit sessions are discarded without prompt when launching another Edit/Duplicate/Split: add the standard confirmation prompt before discarding an in-flight unsaved edit session (persisted-draft protection stays as is).
- ybtb items (all in the command palette / ledger format area):
  1. `command-palette.spec.ts` first search test: explicitly assert the target row is absent from the visible table before pressing Enter (guards against seed drift).
  2. `MixedSentinel` duplicated from `transaction-browser.tsx` — export once from the ledger barrel and reuse; also check the ~40px Mixed chip against its 1.75rem status grid track (fix the spill if real).
  3. Palette calls `lineDisplayAmounts` without LookupMaps — pass the maps (or the same fallback the table uses) so currency_exchange sold-side display cannot diverge from the table.
  4. Space-on-empty keydown: add an `isComposing` guard.
  5. Add `.catch` to the palette search promise chain so an unexpected throw clears the skeleton state.
- e2e: cover the expected-transaction action gating (detail panel + any remaining surface) and the discard-prompt; adjust/strengthen the keyboard specs per 5hvz(3) and the palette spec per ybtb(1). Everything else is unit-level behavior verified through existing suites.
- No ground-truth doc edits. No PROJECT_STATE.md change (polish). PACKAGE.md only if a contract line changes.

## Tasks

### Task/Commit 1: 5hvz — expected-edit gating, ns timestamps, discard prompt, keyboard e2e

- [x] Implement/reconcile items 1–4 per Plan Context (record already-resolved items in the kata comment).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `5hvz` (`kata comment 5hvz --agent ...`)
  - [x] Commit changes

### Task/Commit 2: ybtb — palette search polish

- [x] Implement items 1–5 per Plan Context.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `ybtb` (`kata comment ybtb --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Edit + palette polish (kata 5hvz, ybtb): expected transactions no longer offer Edit/Duplicate/Split anywhere (confirm/dismiss own them per recurring semantics) with pre-submit dead-end prevention; ns timestamps normalized for datetime-local; unsaved in-flight edit sessions get a discard confirmation; keyboard e2e honesty restored; palette: off-page assertion, shared MixedSentinel, LookupMaps for display amounts, isComposing guard, search promise catch; items already resolved by b1m2/editing-suite recorded in kata instead of re-implemented"`
- [x] Move this plan to `docs/plans/completed/`
