# Plan: Dictionary ID validation audit - Kata issue `2y6b`

Audit service-layer APIs that accept account, category, tag, or household-member ids, then fix the paths that only validate "positive id" before handing those ids to repositories. Validation must stay in the owning service packages and use the existing dictionary reference APIs so missing, tombstoned, hidden, and active-resource rules remain consistent.

## Plan Context

- Ground truth: `docs/architecture.md` (services own reference validation; stores do not precheck references), `docs/business-requirements.md` (hidden dictionary resources and API-first behavior), `docs/TESTING.md` (app-tests only for app behavior), and `docs/plan_template.md`.
- Existing reference validators already live on the dictionary services:
  - `accounts.Service.ValidateActiveReference(s)` with `accounts.ReferenceOptions{AllowHidden: true}` when an explicit id should allow hidden accounts.
  - `categories.Service.ValidateActiveReference(s)` and `tags.Service.ValidateActiveReference(s)` with `AllowHidden: true` for explicit write/search ids.
  - `members.Service.ValidateActiveReference(s)` for active household members.
- Current audit snapshot:
  - Already covered: transaction create/replace/shorthand, transaction-template create/replace, bulk category/account/tag updates, credit-limit create, and credit-limit list-by-account validate active dictionary references before writes or account-scoped reads.
  - Likely gaps: `accounts.Service.ListBalances` validates `account_ids` as positive only; `creditlimits.Service.CurrentByAccounts` validates `accountIDs` as positive only; `transactions.Service.List` validates `account_id`, `category_id`, `tag_id`, and `member_id` filters as positive only; `transactions.Service.SearchRecords` validates single id filters as positive only, including the account-scoped records route.
  - Dictionary CRUD target ids (`Get`, `Update`, `Delete`, `ActiveUsage`) already map existence through their repositories and are target resources, not shallow reference-filter gaps.
- Error semantics to preserve or establish:
  - Non-positive ids continue to return existing `invalid_request` shape errors such as `account_id must be positive`.
  - Missing or tombstoned query/filter ids return `invalid_request` because the filter itself is invalid.
  - Missing or tombstoned path ids on account-scoped record search return `not_found` for the target account.
  - Hidden active ids are valid when supplied explicitly; do not make hidden resources fail reference validation. Preserve existing `include_hidden` result filtering on account balances.
- Do not update `PROJECT_STATE.md` unless the implementation changes a user-visible capability statement beyond validation hardening.

## Tasks

### Task/Commit 1: Audit and fix account-id read validation

This task handles the account-oriented service APIs whose current behavior can silently return empty results for positive but missing account ids. It should keep list/balance repository predicates simple and add service-owned validation before repositories run.

- [x] Re-run an explicit service API inventory for account/category/tag/member id inputs under `internal/services`, and keep the final "covered vs fixed" audit list in a Kata progress comment for `2y6b`.
- [x] Update `accounts.Service.ListBalances` so `BalanceListOptions.AccountIDs` are deduplicated, positive-checked with the current message, and then validated as active account references through the account service cache before calling the repository.
- [x] Preserve current balance semantics: active balance accounts only, existing `include_hidden` behavior, no new account-type validation unless an existing local contract already requires it.
- [x] Extend `creditlimits.AccountReferenceValidator` to support batch active-reference validation, and update `creditlimits.Service.CurrentByAccounts` to validate its deduplicated account id set before the batch current-limit repository query.
- [x] Map missing/tombstoned `account_ids` on balance-list query input to `invalid_request`; keep `CurrentByAccounts` internal error mapping consistent with the account-reference validation contract.
- [x] Update short package docs for `accounts` and `creditlimits` only if the validation/read contract is no longer accurately described.
- [x] Add app-tests through the generated REST client in `internal/apptest/runtime/account_test.go` or adjacent existing balance coverage:
  - [x] `GET /api/accounts/balances?account_ids=<missing positive id>` returns 400.
  - [x] A tombstoned account id in `account_ids` returns 400.
  - [x] Existing zero/non-positive validation still returns 400 with the current shape error.
  - [x] Existing valid balance and current-credit-limit behavior still passes.
- [x] Verification
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just test-frontend-e2e` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `2y6b`
  - [x] Commit changes

### Task/Commit 2: Fix transaction list and record-search dictionary filters

This task validates transaction read filters before repository queries so positive missing ids no longer look like legitimate no-match searches. It should keep HTTP handlers thin by routing account-scoped behavior through service-owned validation instead of adding reference checks in `internal/httpapi`.

- [x] Add private transaction-service helpers that validate dictionary filter ids after existing shape validation:
  - [x] `ListOptions.AccountIDs`, `CategoryIDs`, `TagIDs`, and `MemberIDs`.
  - [x] `RecordSearchOptions.AccountID`, `CategoryID`, `TagID`, and `MemberID`.
  - [x] Use the existing dictionary reference services and `AllowHidden: true` for explicit account/category/tag ids.
- [x] Keep `account_fqn_prefix` outside this audit because it is an FQN prefix string, not a dictionary id.
- [x] For `transactions.Service.List`, map missing/tombstoned dictionary filter ids to an `invalid_request` error such as "transaction filters reference missing or inactive resource".
- [x] For global `transactions.Service.SearchRecords`, map missing/tombstoned id filters to an `invalid_request` error such as "record search filters reference missing or inactive resource".
- [x] Add a service-owned account-scoped record-search entrypoint, or equivalent private helper structure, so `GET /api/accounts/{account_id}/records` can validate the path account id as the target resource and return `not_found` when that account is missing or tombstoned.
- [x] Update `internal/httpapi/strict_transactions.go` to call the service-owned account-scoped record-search path, without duplicating dictionary validation in the handler.
- [x] Update `internal/services/transactions/PACKAGE.md` only if the record-search/list filter validation contract changes the documented implicit contracts.
- [x] Add app-tests through the generated REST client:
  - [x] In `transaction_list_filter_test.go`, missing positive `account_id`, `category_id`, `tag_id`, and `member_id` filters return 400.
  - [x] In `transaction_list_filter_test.go`, tombstoned account/category/tag/member filter ids return 400.
  - [x] In `transaction_update_search_test.go`, global `GET /api/records` missing and tombstoned account/category/tag/member id filters return 400.
  - [x] In `transaction_update_search_test.go`, `GET /api/accounts/{account_id}/records` returns 404 for missing and tombstoned path account ids.
  - [x] In `transaction_update_search_test.go`, account-scoped record search still returns 400 for missing/tombstoned category/tag/member query filters.
  - [x] Existing positive-shape, pagination, running-balance, and prefix-search tests continue to pass.
- [x] Verification
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just test-frontend-e2e` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `2y6b`
  - [x] Commit changes

## Final Verification

- [x] Confirm the final audit list covers every service-layer entrypoint accepting account/member/tag/category ids and clearly identifies fixed vs already-valid paths.
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just test-frontend-e2e` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Dictionary id validation audit (kata 2y6b): service-layer account/category/tag/member id inputs audited; read filters and account-id batch reads now validate active references through owning services; non-positive shape errors preserved; missing/tombstoned query ids return invalid_request; account-scoped record path id returns not_found; handlers stay thin."`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata issue `2y6b` with implementation evidence and validation commands.
