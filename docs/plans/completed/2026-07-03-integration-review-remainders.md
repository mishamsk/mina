# Plan: Integration review remainders (ui-stage-2)

Final fix pass for the two comments left unresolved when the integrated review-loop exhausted its iterations. Address exactly these; nothing else.

## Plan Context

- Do not run review-loop. These ARE the unresolved review comments; per the repo workflow they are addressed directly without another review run.
- Do not edit any file under `docs/` except `frontend/src/features/ledger/PACKAGE.md` (package doc, in scope below) and moving this plan to `docs/plans/completed/` when done.
- Protect — do not regress: all existing title tests in `internal/apptest/runtime/transaction_classification_test.go` (including the cross-currency fixtures added by review commits `efadb50`/`06b028d`/`44f810e`), anchor pagination tests, month-totals tests, the 34-test frontend e2e suite.

## Tasks

### Task/Commit 1: Cross-currency spend titles use the original funding account

Review comment ([major], `internal/services/transactions/classification.go:355`): the spend title selector only considers negative `expense`/`fee` balance records for the "from" side. In the cross-currency spend shape the original funding account sits on the `exchange` records and the negative expense balance record is the bought-currency cash account, so responses title `EUR → Local` instead of `Checking → Local`.

- [x] Make the spend "from" side resolve to the original funding account for cross-currency spend shapes per the summary-line rules in `docs/webui-design.md` (funding → merchant), consistent with `docs/accounting-semantics.md` shape definitions; single-currency spend titles must not change
- [x] Extend `internal/apptest/runtime/transaction_classification_test.go` with an assertion that the cross-currency spend title names the funding account (e.g. `Checking → Local`), covering create, read, and list responses
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: Ledger PACKAGE.md ownership correction

Review comment ([minor], `frontend/src/features/ledger/PACKAGE.md:11`): the transaction-detail bullets assign route-owned behavior (deep-link fetches, REST tombstone delete, URL-addressed panel close, snapshot refresh) to the ledger feature package, but those live in `frontend/src/pages/transactions-page.tsx`.

- [x] Correct `frontend/src/features/ledger/PACKAGE.md` so the ledger package documents what it owns (panel rendering, record table, confirmation UI) and the route-owned responsibilities (URL state, missing-detail fetch, delete call, refresh) are attributed to the page, per `docs/frontend-architecture.md` boundaries
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Move this plan to `docs/plans/completed/`
