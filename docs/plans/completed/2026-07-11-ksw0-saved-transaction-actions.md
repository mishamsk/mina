# Plan: Edit, Duplicate, and Split actions for saved transactions (`ksw0`)

Complete the saved-transaction detail actions per `docs/webui-design.md`: Edit (reopens the shorthand shape when the records still fit it, otherwise the full journal editor; save is a full replacement), Duplicate (entry panel prefilled as a new entry), and Split (journal editor with the records loaded), alongside the existing Delete.

## Plan Context

- Ground truth (no doc edits needed — the rules are already written): `docs/webui-design.md:214` — transaction detail actions are Edit, Duplicate, Delete, Split; `:40` — editing reopens the shorthand shape when its records still fit that shape, otherwise the full editor; `:39` — the journal editor is always one action away and escalation preserves everything; `:230` — Split opens the journal editor with the records loaded, ready to divide across categories, counterparties, or member/person shares. Entry mirrors display; the UI never re-derives accounting truths.
- Current state: the detail panel (`frontend/src/features/ledger/transaction-detail-panel.tsx`) exposes Edit, Duplicate, Delete, and Split. The entry panel (`frontend/src/features/ledger/entry-panel.tsx`, shorthand spend/income/refund/transfer tabs + Advanced journal editor with balanced multi-record saves, draft persistence, edit-as-journal escalation) supports create, duplicate-as-create, and full-replacement edit/split flows through `replaceTransaction` (PUT `/api/transactions/{id}`).
- Edit semantics:
  - Fit detection: a saved transaction "fits" a shorthand tab when its active records map exactly onto that tab's shape (the same mapping the shorthand tabs already produce on save — derive fit by inverting it; do not invent new accounting classification, use the server-provided class plus mechanical record-shape checks).
  - Fit → open the matching shorthand tab prefilled in edit mode; non-fit → open the Advanced journal editor with the records loaded.
  - Save in edit mode calls `replaceTransaction` (full replacement), refreshes through the existing save-refresh fan-out, shows a standard "Transaction updated." toast, and leaves the detail panel consistent (refreshed or closed — follow the least surprising existing pattern).
  - Edit-as-journal escalation must keep working from a shorthand edit (escalate, still saving as a replacement of the same transaction).
- Duplicate: opens the entry panel prefilled from the transaction as a NEW entry (create path, existing POST endpoints; copy date, records/amounts, category, tags, members, memos); saving creates a new transaction with the standard created toast.
- Split: opens the Advanced journal editor with the records loaded in edit mode (full replacement on save), even when the shape would fit a shorthand tab.
- Draft protection: the entry panel persists drafts; opening Edit/Duplicate/Split must not silently destroy an in-progress draft — follow the panel's existing open/replace semantics, and if none exist for this case, guard with the standard confirm pattern before discarding a non-empty draft.
- Placement: the detail panel's actions row (with Delete). No new row actions in the browser (the design places these on the detail view; row actions stay open-detail + quick-delete).
- Protect — do not regress: all existing entry flows (shorthand creates, advanced journal creates, draft persistence, intent-guided pickers, template type-ahead), the detail panel (deep links, delete, focus), the transaction browser, recurring confirm (it materializes via the same refresh fan-out), all existing e2e suites.
- e2e in `transactions-page.spec.ts` (or a focused new spec if cleaner): Edit on a shorthand-fitting spend opens the spend tab prefilled and save replaces (fields changed, same transaction id, list refreshed, toast); Edit on a mixed/non-fitting transaction opens the journal editor with records; escalation from shorthand edit still replaces the same id; Duplicate prefills a new entry and save creates a distinct transaction; Split opens the journal editor for a shorthand-fitting transaction and dividing a record saves the replacement; API failure on replace renders standard feedback; detail panel shows all four actions.
- Update `PROJECT_STATE.md`: one line — saved transactions support Edit/Duplicate/Split with shorthand-fit escalation.
- Package docs: update the ledger PACKAGE.md only if a non-obvious contract emerges (e.g., replacement-save ownership).
- Follow `docs/TESTING.md`.
- Kata issue: `ksw0`.

## Tasks

### Task/Commit 1: Edit mode with fit detection and full-replacement saves

- [x] Entry-panel edit mode: open prefilled from a saved transaction (shorthand tab when the records fit, journal editor otherwise), save via `replaceTransaction` with the standard refresh fan-out and toast, escalation preserved, draft protection per Plan Context.
- [x] Detail panel Edit action wired to it.
- [x] e2e: shorthand-fit edit, non-fit edit, escalated edit — all replacing the same transaction id.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `ksw0`
  - [x] Commit changes

### Task/Commit 2: Duplicate and Split

- [x] Duplicate (new-entry prefill, create path) and Split (journal editor with records, replacement save) actions on the detail panel.
- [x] e2e: duplicate creates a distinct transaction; split divides and replaces; all four actions visible; replace-failure feedback.
- [x] Update `PROJECT_STATE.md` (one line) and ledger package doc if needed.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata `ksw0`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Edit/Duplicate/Split for saved transactions per webui-design: shorthand-fit detection without client-side accounting re-derivation, full-replacement saves via replaceTransaction, duplicate as new-entry prefill, split always in the journal editor; entry flows, drafts, detail panel, and existing e2e unchanged"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata `ksw0` only after the plan is moved to completed
