# Plan: Support changing account type via update API (Kata dgkf)

Allow changing an account's type (`balance` / `flow` / `system`) through the account update API. The field update is trivial; the core of the task is validation: an account's type participates in every intent-shape rule (`docs/accounting-semantics.md:90-107`), so the service must verify that every active transaction the account participates in remains classification-valid under the new type, and reject the change with a stable machine-readable error otherwise. Backend/API only — the account edit UI is a separate blocked issue (`5z54`).

## Plan Context

- Kata issue: `dgkf` — "Support changing account type via update API". Blocks `5z54` (UI).
- Read `docs/accounting-semantics.md` (intent shape rules, classification components) before implementing; it is ground truth and must NOT be edited.
- What blocks type changes today (all three layers need extending):
  - `UpdateAccountRequest` in `api/openapi.yaml` (~`:4682-4703`) has no `account_type` and `additionalProperties: false`.
  - `accounts.UpdateInput` (`internal/services/accounts/accounts.go:79-85`) has no type field; `UpdateMutable` (`accounts.go:320-370`), `hasChanges` (`:482-487`).
  - `AccountStore.UpdateMutable` (`internal/store/accounts.go:215-270`) never sets `account_type` (INSERT does, `:35-41`; DB enum is UPPERCASE via `enumValue`, see `:97,148`).
- Validation design (decided):
  - Classification is owned by the transactions service: `validateIntentShape` / `classifySemanticRecords` (`internal/services/transactions/classification.go:141-247`), entry `ValidateTransactionClassification` (`classification.go:20-23`). The existing bulk-reassign path `validateBulkReassignAccountClassification` (`internal/services/transactions/transactions.go:986-1022`) already loads every affected transaction, swaps `record.AccountType`, and re-validates — mirror exactly that mechanism for a hypothetical type change (reuse its repository path for loading transactions that reference an account; add a store query only if none is reusable).
  - Add a method on `transactions.Service` like `ValidateAccountTypeChange(ctx, accountID int64, newType accounts.AccountType) error` that re-validates all affected active transactions with the substituted type and returns the first violation.
  - The accounts service cannot import transactions (import cycle). Define a small validator interface in `internal/services/accounts` (e.g. `TypeChangeValidator`) and inject the transactions service into the accounts service in `internal/runtime` composition. Construction order (transactions needs accounts) makes a post-construction setter the pragmatic wiring — precedent: `services.Operations.SetTrigger(runner)` (`internal/runtime/app.go:557`). Nil validator (not wired) must fail type changes, not skip validation.
  - `UpdateMutable` with a type change: validate the new type value (`ValidAccountType`, `accounts.go:24`), no-op when equal to the current type, run the type-change validator, then persist. Rejection error: `services.Conflict(...)` (HTTP 409) with a stable message mirroring the delete-blocked pattern (`accounts.go:506`), e.g. "account type change would invalidate existing transaction records". Bad enum value stays `services.InvalidRequest` (400).
  - The accounts reference cache write-through in `UpdateMutable` must carry the new type so subsequent transaction writes validate against it (verify the existing write-through covers `AccountType`; fix if not).
- Explicit scope exclusions (do not implement):
  - Recurring definitions and transaction templates do not validate against account type today (`recurring.go:878` validates references only; `transactiontemplates.go:371-409` shape checks are type-free) — do NOT add type validation for them in this task.
  - Credit-limit history has no account-type restriction today — do not add one.
  - No UI changes (`5z54`), no changes to balance/report query semantics (they already filter by type and will naturally reflect a changed type).
- OpenAPI: add optional `account_type` to `UpdateAccountRequest` (same enum as create), document the 409 conflict response on `updateAccount` if not already present. Regenerate: `just openapi` and `just frontend-openapi`. Handlers stay thin (`internal/httpapi/strict_entities.go:132-144` maps the new field only).
- Tests are app-tests per `docs/TESTING.md` (read before writing tests), in `internal/apptest/runtime/account_test.go` (update-boundary test at `:15` currently asserts type is unchanged across updates — extend/adjust deliberately, that assertion is now obsolete for requests that set the field) and classification patterns in `transaction_classification_test.go`.
- Docs: update `internal/services/accounts/PACKAGE.md` (and transactions PACKAGE.md if the new cross-service validator is a contract) in the same commit. PROJECT_STATE.md: extend the account CRUD capability line with type changes.
- Do not change ground-truth docs (`docs/accounting-semantics.md`, `docs/data-model.md` — no schema change here, `docs/webui-design.md`, etc.).

## Tasks

### Task/Commit 1: Transactions-side type-change validation

The reusable validation core: given an account and a hypothetical new type, decide whether all existing active transactions remain valid.

- [x] Add `ValidateAccountTypeChange(ctx, accountID, newType)` to `internal/services/transactions`, mirroring `validateBulkReassignAccountClassification`: load all active transactions with records referencing the account (reuse the bulk-reassign repository path; add a store query only if necessary), substitute the account type on that account's records, and re-run classification validation; return the semantic-shape error unwrapped to a stable service error on first violation, nil when unaffected/valid.
- [x] Cover the validator indirectly at the app boundary in Commit 2 (no unit tests per `docs/TESTING.md`); keep this commit compiling and green.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `dgkf` (`kata comment dgkf --agent ...`)
  - [x] Commit changes

### Task/Commit 2: Account update API accepts type changes end to end

Expose the type change through service, store, runtime wiring, and REST, with app-test coverage.

- [x] `internal/services/accounts`: add `AccountType` to `UpdateInput`, define the `TypeChangeValidator` interface + runtime setter, extend `UpdateMutable` (validate enum, no-op on same type, run validator — nil validator rejects type changes, persist, write-through reference cache with the new type).
- [x] `internal/store/accounts.go`: include `account_type` in the dynamic UPDATE set (uppercase enum conversion mirroring INSERT).
- [x] `internal/runtime/app.go`: wire the transactions service into the accounts service validator setter.
- [x] `api/openapi.yaml`: optional `account_type` on `UpdateAccountRequest`; ensure `updateAccount` documents 400/404/409 responses; regenerate `just openapi` and `just frontend-openapi`; handler maps the field.
- [x] App-tests in `internal/apptest/runtime/account_test.go` (helpers as needed):
  - [x] Type change round-trips for an account with no journal records (e.g. `flow` → `balance`), response and subsequent reads/list-type filters reflect the new type.
  - [x] Type change that keeps records valid succeeds (e.g. an account participating only as a positive `fee` record: `flow` → `system` stays shape-valid per `docs/accounting-semantics.md:98`).
  - [x] Type change that would invalidate records is rejected with 409 and the stable error (e.g. a `flow` account with `expense` records → `balance` or `system`), and the account keeps its old type.
  - [x] After a successful type change, a new transaction write is validated against the NEW type (write that was valid under the old type now rejected, or vice versa) — proves cache write-through.
  - [x] Balance-surface behavior flips with the type (e.g. account appears in/out of the balances listing after change) if cheap to assert with existing helpers.
- [x] Update `internal/services/accounts/PACKAGE.md` (type-change validation contract) and `internal/services/transactions/PACKAGE.md` (validator ownership) as contracts change; extend the PROJECT_STATE.md account capability line.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue `dgkf` (`kata comment dgkf --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Account type change via update API (kata dgkf): UpdateAccountRequest gains optional account_type; accounts.UpdateMutable validates the change through a transactions-owned ValidateAccountTypeChange (mirrors bulk-reassign swap-and-revalidate over all affected active transactions) injected via a runtime setter to avoid the import cycle; rejection is a stable 409 conflict; reference-cache write-through carries the new type; recurring/templates/credit-limits deliberately untouched (no type validation exists there today); app-test coverage for valid/invalid/no-record changes and post-change write validation"`
- [x] Move this plan to `docs/plans/completed/`
