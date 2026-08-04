# Plan: Complete pending entry and transaction actions (`7xnx`)

## Goal

Make pending transactions a first-class manual-entry workflow, preserve their settlement history when posted, and give transaction rows and detail panels one coherent state-dependent action set. Keep Split as a focused spend/income allocation shortcut that opens Advanced with a new flow-side draft row ready to complete.

## Constraints

- Reuse the existing shorthand `SettlementIntent` inputs and atomic `POST /api/records/bulk/settlement`; add no REST operation or schema change.
- Pending and posted timestamps remain service-generated and read-only. A pending-to-posted edit must retain the stored pending timestamp; a directly posted record must not gain one.
- “Record as pending” is a create-mode shorthand option only. It defaults and resets to unchecked, but an unsaved draft retains the operator's choice.
- Use REST-provided `transaction_class` and `record_role` for Split eligibility and seeding; do not derive accounting meaning from records in the browser.
- Split is available only for active `spend` and `income` transactions. It seeds one appended manual row from the first active matching flow record in REST order (`expense` for spend, `income` for income): copy account, currency, tags, member, and memo; clear amount, category, external/import provenance, and source timestamps; use manual/unreconciled defaults.
- Keep the existing editor, row-action, mutation-refresh, draft-protection, and focus-restoration systems; do not introduce a general action framework or redesign the entry forms.
- Follow `docs/TESTING.md`: prove browser behavior with focused Playwright scenarios and do not add unit tests.

## Success Criteria

- [x] Spend, Income, Refund, Transfer, and Exchange can be recorded pending from their shorthand forms; every created owned/party record is pending, while flow/system records remain without settlement timestamps and the unchecked path remains directly posted.
- [x] Advanced replacement from pending to posted retains the prior pending timestamp and receives a posted timestamp, without changing directly posted history.
- [x] Row and detail actions follow the same applicability matrix, Post and Cancel appear together for wholly pending active transactions, and transaction rows themselves remain the only detail-opening affordance.
- [x] Post updates the transaction's pending owned/party records atomically through the existing endpoint, refreshes all affected UI snapshots, preserves focus and mutation feedback, and retains pending timestamps.
- [x] Split is exposed and executable only for active server-classified spend/income transactions; its Advanced launch contains the original records plus the specified blank allocation row and still saves as one full replacement.
- [x] `docs/webui-design.md`, `frontend/src/features/ledger/PACKAGE.md`, and `PROJECT_STATE.md` describe the final behavior without duplicating accounting semantics.
- [x] `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-03-pending-transaction-actions-7xnx.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Close Kata `7xnx` with the implementation commits and validation evidence.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Record pending shorthand transactions without losing settlement history

Extend the per-tab entry draft and tolerant stored-draft migration in `frontend/src/models/ui-state.ts` and `frontend/src/features/ledger/entry-panel.tsx` with the create-only checkbox. Apply its settlement intent through every shorthand submission branch, including the full-journal branches for multi-merchant spends and charged transfers, and reset it after a successful save rather than making it sticky. When Advanced changes an existing pending owned/party row to posted, send its original pending timestamp with posted intent and let the service generate only the posted timestamp.

- [x] Focused entry E2E coverage proves the checkbox is present on all five shorthand tabs, representative shorthand and composed-journal paths produce pending balance records only, unchecked entry stays directly posted, and draft close/reopen retains the checked state until save resets it.
- [x] Replacement E2E coverage proves a pending record edited to posted keeps its exact pending timestamp and gains a posted timestamp.
- [x] Update the transaction-entry rules in `docs/webui-design.md` and the ledger package contract with the create-only settlement and timestamp-preservation behavior.
- [x] Commit as `feat(webui): support pending transaction entry`.

### Task 2: Add atomic Post and align row/detail actions

Add a single-transaction Post mutation to `useTransactionBrowserPage` using `updateJournalRecordsSettlement` for the transaction's pending records, then refetch and run the existing blocking transaction/detail/balance/reference refresh fan-out. Update `TransactionBrowser` and `TransactionDetailPanel` so both surfaces use the same applicability decisions while retaining compact row controls and wider labeled detail-footer buttons. Remove Open transaction detail, move Edit from the detail header to the footer, and keep errors, busy disabling, toast feedback, and focus restoration local to the invoking action.

| Transaction state | Applicable actions |
| --- | --- |
| Active, wholly pending | Edit, Duplicate, conditional Split, Post, Cancel, Delete |
| Active, otherwise | Edit, Duplicate, conditional Split, Delete |
| Cancelled | Duplicate, Restore, Delete |
| Expected occurrence | Confirm, Dismiss |

- [x] Focused detail/browser E2E coverage proves the action matrix on rows and detail footers, Edit's new placement, removal of Open, Post beside Cancel, disabled/error feedback, and focus recovery.
- [x] The Post scenario verifies through the REST response that all applicable records post together, retain pending timestamps, and refresh both the row and an open detail panel.
- [x] Update existing transaction-browser tests and helpers to open detail by row activation instead of the removed action; retain account-register “Open transaction” behavior, which is a different surface.
- [x] Update the transaction detail/action rules in `docs/webui-design.md` and the ledger package contract.
- [x] Commit as `feat(webui): complete transaction action parity`.

### Task 3: Make Split a spend/income allocation shortcut

Apply the active + `spend|income` predicate consistently in row actions, detail actions, and `?entry=split:<id>` resolution so a direct URL cannot bypass eligibility; an ineligible split link uses the existing transaction-unavailable treatment. Build the split launch draft from the current transaction plus the specified appended flow row, treating that seeded state as the launch baseline so closing it unchanged does not trigger a discard warning. Keep ordinary Edit behavior unchanged for every class.

- [x] Split E2E coverage proves visibility for active spend and income, absence for other classes/lifecycles, rejection of an ineligible direct split link, and the appended row's copied and cleared fields.
- [x] The existing replacement scenario uses the pre-added row, rebalances the records, and proves Split preserves the transaction ID and standard save/error/refresh behavior.
- [x] Update Split and deep-link rules in `docs/webui-design.md`, the ledger package contract, and the implemented web UI summary in `PROJECT_STATE.md`.
- [x] Commit as `feat(webui): focus split on spend and income`.
