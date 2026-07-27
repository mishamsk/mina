# Plan: entry-eager-draft fix round 1 — launch-mode tab leak, discard robustness, test/doc accuracy

Operator-review follow-up to `docs/plans/completed/2026-07-27-entry-eager-draft.md`. The core fix is sound and live-verified; this plan closes the audited should-fix findings. Implementation only.

## Plan Context

- Do not run review-loop.
- Findings (operator audit 2026-07-27, file:line verified):
  1. **Create-mode tab preference leaks from edit/split launches.** `frontend/src/features/ledger/entry-panel.tsx:3496` (`editActiveTabAsJournal`) and `:3522` (`updateActiveTab`) call `setTransactionEntryActiveTab` unconditionally, so "Edit as journal" on a saved transaction (or tab toggling during an edit) rewrites the remembered create-mode tab — the next "New transaction" then opens on Advanced. Gate the preference write on create mode (e.g. `!replacement` / ordinary persistence). While there: `applyTemplate` (~`:3544`) updates `rememberedActiveTabRef` without the setter, diverging ref and preference — make them consistent under the same create-mode gate.
  2. **Discard-launch lock has no escape hatch.** `discardPendingLaunch` (`entry-panel.tsx:2616-2659`) disables both dialog buttons and suppresses close while awaiting IndexedDB deletion; if the delete never settles the user can only reload. Deletion is disposable (the code's own comment) — add a bounded timeout that falls through to proceeding with the launch.
  3. **Unhandled rejection on cleanup delete.** `void deleteTransactionEntryDraft();` at `entry-panel.tsx:2806` has no rejection handling (the neighbouring `void writeTransactionEntryDraft(...)` at `:2813` shares the gap). Swallow/log like the other storage paths; behavior is already self-healing.
  4. **ConfirmationDialog pending-state remount drops focus.** `frontend/src/components/confirmation-dialog.tsx:87-105` swaps the wrapper element when `pending` toggles, unmounting the focused button mid-flow. Render the tooltip wrapper unconditionally and gate only its content so the buttons keep identity. Keep the component fully generic; all other call sites must render byte-identically (they omit the new props).
  5. **Racy Duplicate assertion can false-pass.** In `frontend/tests/e2e/transactions-page.spec.ts`, the "pristine create drafts do not block saved transaction launches" Duplicate branch asserts `toHaveCount(0)` on the alert dialog immediately and then a `New spend` heading — which also matches the panel behind a regressed phantom prompt. Make it discriminating: assert a duplicate-specific prefilled value (e.g. the source transaction's memo/amount in the form) and re-check the dialog count after the panel settles.
  6. **services PACKAGE.md misattributes the legacy inference.** `frontend/src/services/indexeddb/PACKAGE.md:11` claims reads infer legacy initialization date/currency; `readTransactionEntryDraft` (`services/indexeddb/index.ts:136-141`) returns the raw union — the inference (`legacyDraftBaseline`) lives in the ledger feature. Fix the services contract to state only that reads return either an envelope or a legacy bare draft and callers handle both; state the inference rule in `frontend/src/features/ledger/PACKAGE.md` where it lives.
- Protect — do not regress:
  - Pristine open persists nothing and never prompts; real input persists/restores per tab; dirty drafts prompt on launch; Keep/Discard both work (all live-verified and pinned by e2e).
  - Sticky-after-save persistence (`persistBaseline`), the legacy bare-draft fail-safe inference, the envelope upgrade path, and the remembered-tab behavior in create mode.
  - All suites currently green (`just pre-commit`, `just test-frontend-e2e`).
- Scope exclusions: the untouched-Duplicate-prefill non-restore is plan-authorized behavior — do not "fix" it; white-box IDB fault-injection tests may stay as-is beyond finding 5; no new features.

## Tasks

### Task 1: Gate the tab-preference writes to create mode

- [x] Fix findings 1 (both call sites plus `applyTemplate` consistency); manually verify: edit a transaction, switch to "Edit as journal", close, then "New transaction" opens on the previously remembered create tab, not Advanced.
- [x] Extend/adjust e2e where an existing spec covers remembered tabs so the leak is pinned.
- [x] Commit as `fix(frontend): keep create-mode tab preference out of edit and split launches`.

### Task 2: Discard-flow robustness and dialog focus

- [x] Fix findings 2, 3, and 4.
- [x] Commit as `fix(frontend): bound discard-launch waits and keep dialog focus stable`.

### Task 3: Test discrimination and package-doc accuracy

- [x] Fix findings 5 and 6.
- [x] Commit as `test(frontend-e2e): discriminate duplicate launch assertion; fix draft storage docs`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just pre-commit` passes.
- [x] `just test-frontend-e2e` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
