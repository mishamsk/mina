# Plan: Keep the active transaction-entry tab when clearing a draft (Kata nwv6)

## Goal

Confirming Clear draft in the transaction editor resets the draft without changing the operator's selected entry type: the active tab (Spend, Income, Refund, Transfer, Exchange, or Advanced) stays selected while that tab's values, every other create-tab draft, the template selection, and the persisted draft state are reset.

- No clear path silently switches the editor to Spend, and the remembered entry tab preference is not overwritten with Spend by clearing.
- Browser coverage clears from a non-Spend shorthand tab and from Advanced.

## Constraints

- Kata issue: `nwv6`.
- Root cause (operator-established): `resetCreateDraft` in `frontend/src/features/ledger/entry-panel.tsx` rebuilds the draft from `defaultDraft()` whose `activeTab` is hard-coded to `"spend"`, then also assigns `"spend"` to `rememberedActiveTabRef` and calls `setTransactionEntryActiveTab("spend")`, persisting Spend as the remembered tab preference. Fix inside that function: capture the current active tab, build the blank draft with that tab (both the draft and the ordinary baseline), and keep the remembered tab and the preference on the preserved tab. A small helper such as `blankDraftForTab(tab)` beside `defaultDraft()` is fine since `draftFromTemplate` already builds the same shape.
- Do not change: the delete-the-record persistence semantics (`deleteTransactionEntryDraft`) and the write-back early return, template-picker remount via `pickerLifecycle`, pending-template and error resets, the post-clear `focusTemplatePicker()` focus target, the entry-modal fallback "Clear entry draft?" path (it never touches the tab preference; verify it does not land on Spend after Retry, but change nothing unless it does), template replacement moving to the template's target tab, post-save sticky behavior, and the `?entry=new` hydration.
- `draftUserInput` deliberately ignores `activeTab`; keep it that way so a blank draft on a non-Spend tab remains clean and unpersisted.
- Browser coverage per `docs/FRONTEND-TESTING.md`, in `frontend/tests/e2e/transactions/entry.spec.ts` (15 tests today, cap 25): extend the existing "create drafts recover after closing and can be cleared" journey or add at most one test so that clearing from Transfer (or another non-Spend shorthand tab) and from Advanced each keep their tab selected, with values reset and the Memo empty. Web-first assertions only.
- Docs: tighten the Clear draft sentence in the entry modal bullet of `docs/webui-design.md` (around "Its generic Clear draft action confirms modified work, resets every tab and the template picker...") to state the active tab is preserved; update `frontend/src/features/ledger/PACKAGE.md` via the `write-package-docs` skill. Do not change `docs/architecture.md`, `docs/frontend-architecture.md`, `VISION.md`, or `SCOPE.md`.
- Mina is pre-production with no users: no compatibility shims.
- Do not edit this plan except to tick checkboxes and to move it to `docs/plans/completed/`.

## Success Criteria

- [x] With `just dev --demo`: on Transfer, Exchange, and Advanced, entering values then confirming Clear draft leaves the same tab selected with blank values, a remounted template picker, and no persisted draft record; closing and reopening the editor lands on that same tab.
- [x] The Spend case and all other clear/launch paths behave exactly as before.
- [x] `just frontend-check` passes.
- [x] `just test-frontend-e2e tests/e2e/transactions/entry.spec.ts tests/e2e/transactions/entry-pickers.spec.ts` passes on chromium and webkit.
- [x] `just pre-commit` passes.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-09-14-keep-entry-tab-on-clear.md"` exactly once, resolve its findings, and rerun affected validation. Never invoke review-loop a second time, even if findings remain; report any remaining findings in the completion report.
- [x] Close Kata `nwv6` with the commits and validation evidence (`kata close nwv6 --done --message "..." --commit <sha> --test "<suites>" --agent`).
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Preserve the active tab in the clear path

Apply the fix described in Constraints to `resetCreateDraft`, keeping the draft, the ordinary baseline, the remembered tab ref, and the tab preference all on the preserved tab.

- [x] Manual verification with `just dev --demo` for Transfer, Exchange, Advanced, and Spend, including reopen-after-clear.
- [x] Commit as `fix(ledger): keep the active entry tab when clearing a draft`.

### Task 2: Browser coverage

Cover clearing from a non-Spend shorthand tab and from Advanced as described in Constraints.

- [x] Targeted e2e passes on chromium and webkit; the spec stays within its cap.
- [x] Commit as `test(frontend): cover keeping the entry tab when clearing a draft`.

### Task 3: Docs

Apply the doc updates listed in Constraints and run `just prose-fmt`.

- [x] Design doc sentence and ledger package doc updated.
- [x] Commit as `docs(frontend): state that Clear draft keeps the active entry tab`.
