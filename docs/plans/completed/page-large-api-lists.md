# Page Large API Lists

## Plan Context

- Kata 4576 scope: audit unbounded list/search APIs, page transactions, records, and account records, and confirm exchange-rate and credit-limit history paging semantics.
- Existing entity, exchange-rate, and credit-limit history lists use `limit` and `offset` with OpenAPI validation and store-owned deterministic ordering.
- `GET /api/transactions`, `GET /api/records`, and `GET /api/accounts/{account_id}/records` are the large-list gaps.
- Use offset pagination only for this task. Do not add totals, cursors, or new response envelope fields unless implementation proves they are required.
- Preserve current default behavior when paging params are omitted: same ordering and same response shape, just with optional bounded result sets.

## Tasks

### Commit 1: Define Pagination Contract For Large Lists

- [x] Audit all REST `GET` list/search endpoints against `api/openapi.yaml` and record the final scope in the commit message.
- [x] Add optional `limit` and `offset` query parameters to:
  - [x] `GET /api/transactions`
  - [x] `GET /api/records`
  - [x] `GET /api/accounts/{account_id}/records`
- [x] Match existing list constraints:
  - [x] `limit`: integer, minimum `1`, maximum `500`
  - [x] `offset`: integer, minimum `0`
- [x] Keep existing transaction and record response schemas unchanged.
- [x] Do not add sort query parameters unless needed to preserve deterministic paging; current date/id ordering should remain the default contract.
- [x] Regenerate generated REST server and client code with `just openapi`.
- [x] Update app-test expectations that currently treat `GET /api/transactions?limit=1` as an unsupported query.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Commit 2: Page Transaction Lists

- [x] Add transaction list options at the service boundary for optional paging.
  - [x] Keep validation in the OpenAPI transport layer for query shape and numeric bounds.
  - [x] Keep transaction domain behavior in `internal/services/transactions`.
- [x] Update the transaction repository interface and `internal/store.TransactionStore.List` to accept paging options.
- [x] Apply `LIMIT`/`OFFSET` after the existing deterministic order: `initiated_date ASC, transaction_id ASC`.
- [x] Keep nested journal-record loading limited to the selected page of transaction IDs.
- [x] Update `internal/httpapi/strict_transactions.go` to map generated list params into service options.
- [x] Add app-test coverage through the generated REST client:
  - [x] Omitted params still return all active transactions in the previous order.
  - [x] `limit` returns only the first page.
  - [x] `offset` skips earlier ordered transactions.
  - [x] Combined `limit` and `offset` returns the expected window with nested records intact.
  - [x] Invalid `limit`/`offset` values return the standard JSON invalid-request envelope.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Commit 3: Page Record Searches And Account Records

- [x] Extend `transactions.RecordSearchOptions` with optional paging.
- [x] Map `limit` and `offset` for both record endpoints:
  - [x] `GET /api/records`
  - [x] `GET /api/accounts/{account_id}/records`
- [x] Apply paging after the existing deterministic record order: `tx.initiated_date ASC, jr.transaction_id ASC, jr.record_id ASC`.
- [x] Preserve every existing filter and account-view behavior.
- [x] Add app-test coverage through the generated REST client:
  - [x] `GET /api/records` pages across all matching active records.
  - [x] `GET /api/accounts/{account_id}/records` pages only within the selected account.
  - [x] Paging composes with at least one existing filter.
  - [x] Invalid `limit`/`offset` values return the standard JSON invalid-request envelope.
- [x] Re-check exchange-rate and credit-limit history paging behavior.
  - [x] Confirm `GET /api/exchange-rates` already applies `limit`/`offset` after deterministic ordering.
  - [x] Confirm `GET /api/accounts/{account_id}/credit-limit-history` already applies `limit`/`offset` after deterministic ordering.
  - [x] Add or extend app-tests only if current coverage does not prove both semantics.
- [x] Update `PROJECT_STATE.md` only if this lands as a completed API capability change, keeping the entry short and evergreen.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Commit changes

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available
- [x] `just openapi-check` passes
- [x] `just fmt` passes
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "page large API lists; offset pagination only; preserve existing response shapes and deterministic ordering"`
- [x] Move this plan to `docs/plans/completed/`
