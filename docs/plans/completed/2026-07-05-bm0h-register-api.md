# Plan: Account-record search across an FQN prefix — Kata issue `bm0h`

Add group-register querying to the record search API: records across an account FQN prefix (e.g. `banks:Chase:*`), including the prefix's flow accounts. The kata's other acceptance item — per-record running balance — is ALREADY implemented and tested on `GET /api/accounts/{account_id}/records?include_running_balance=true` (window CTE over full history, per-currency, cancelled-excluded, pagination-correct); do not touch it beyond the interaction rule below. Backend/API only (blocks 6a1w, t3ph).

## Plan Context

- Ground truth: `docs/accounting-semantics.md:17-18,39-42` (prefix grouping mixes `balance` + `flow` accounts under one prefix), `docs/webui-design.md:223` (group pages: combined register across the whole prefix incl. flow accounts), `docs/architecture.md` (typed allowlists, services validate, store owns SQL, parameter binding), `docs/TESTING.md`. Read before starting.
- Current state (line numbers as of this plan's commit):
  - Two search ops: `GET /api/records` (`searchJournalRecords`, `api/openapi.yaml:1477`, optional `account_id` query param) and `GET /api/accounts/{account_id}/records` (`searchAccountJournalRecords`, `:1615`, path-bound, `include_running_balance` at `:1734-1740`).
  - Service `RecordSearchOptions` (`internal/services/transactions/transactions.go:128-151`) has single `AccountID *int64`; validation at `:1045-1075` (incl. `include_running_balance requires account_id`).
  - Store `SearchRecords` (`internal/store/transactions.go:640-780`): filter composition `:672-739`, default order `tx.initiated_date ASC, jr.transaction_id ASC, jr.record_id ASC` (`:750`), running-balance CTE `:645-664`.
  - Account FQN storage: `fqn TEXT` + generated `parent_fqn`/`name`/`level` (`internal/store/migrations/00005_create_account.sql:5,22-28`). NO prefix query exists anywhere yet.
  - Tests: `internal/apptest/runtime/transaction_update_search_test.go` (filters table `:176`, pagination `:343`, running balance `:455-561`) — the model to extend.
- API design decisions (operator-fixed; do not relitigate):
  - Extend `GET /api/records` with optional `account_fqn_prefix` (string): matches records whose account `fqn` equals the prefix OR starts with `prefix + ":"` — the node itself plus all descendants, naturally including `flow` accounts under the prefix. Validated against the account-FQN segment format (reuse the existing FQN validation rules); 400 on malformed.
  - Mutual exclusions (400 `invalid_request`): `account_fqn_prefix` with `account_id`; `account_fqn_prefix` with `include_running_balance` (running balance stays an accounting truth of ONE account's register — a combined multi-account cumulative balance is not defined by the design; group pages get subtotals from the balances API instead).
  - Store implementation: prefix filtering joins `account` and compares `a.fqn = ?` OR prefix-match with bound parameters (LIKE with escaped pattern via the existing `escapeLikePattern`, or `starts_with` — pick the idiomatic DuckDB form); composes with every existing filter, sort, pagination, and `total_count` exactly like other filters.
  - `GET /api/accounts/{account_id}/records` unchanged.
- Regenerate Go + frontend clients via the owning `just` recipes.
- App-tests via generated client only (extend `transaction_update_search_test.go`); JSON-over-HTTP → `just test-integration` before commit.
- Update `PROJECT_STATE.md` in the final commit; package docs only if an implicit contract changes.
- Preserve, do not regress: both search endpoints' current behavior, running-balance semantics and tests, transactions list filters.

## Tasks

### Task/Commit 1: `account_fqn_prefix` on record search

- [x] OpenAPI param + description (node + descendants incl. flow accounts; exclusions documented); regenerate clients.
- [x] Service: `RecordSearchOptions` gains the prefix field; validation per the decisions (format, exclusions).
- [x] Store: prefix predicate in `SearchRecords` (bound params, escaped pattern), composing with all filters/pagination/count.
- [x] App-tests: prefix returns the node's own records plus descendant balance AND flow account records; sibling/non-prefix accounts excluded; a prefix that is also a full account FQN includes that account; composes with a filter (e.g. posting status) + pagination + `total_count`; `account_fqn_prefix`+`account_id` → 400; `account_fqn_prefix`+`include_running_balance` → 400 (on the global endpoint); malformed prefix → 400; no-param behavior unchanged.
- [x] Update `PROJECT_STATE.md`.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Record search FQN-prefix querying (kata bm0h): GET /api/records gains account_fqn_prefix (node + descendants incl. flow accounts, bound/escaped matching), 400 with account_id or include_running_balance, composes with all filters/pagination/total_count. Running balance already shipped and untouched. Constraints: backend/API only; additive; account-scoped endpoint unchanged; clients regenerated."`
- [x] Move this plan to `docs/plans/completed/`
