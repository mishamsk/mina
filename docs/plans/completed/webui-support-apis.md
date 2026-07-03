# Plan: Web UI support APIs — pagination totals, transaction sort, balances, running balance

Backend API work unblocking the next Phase 2 web UI steps: page-count pagination, newest-first transactions, and the balance data needed for account pages and Overview. All items come from `docs/webui-design.md` Backend Additions or from web UI review findings.

## Plan Context

- `GET /api/transactions` currently accepts only `limit`/`offset` and returns ascending initiated-date order; other list endpoints already have `sort`/`sort_dir` allowlists. No paginated list response carries a total count.
- The frontend fix/theme plan (`docs/plans/webui-arcade-cabinet-theme-and-fixes.md`) depends on Tasks 1-2 for "Page X of Y" pagination and newest-first default; Tasks 3-4 unblock the next screens (account pages, Overview) and can land independently.
- Balance semantics per `docs/webui-design.md`: displayed balance = posted + pending records, cancelled excluded; account pages also show a posted-only figure. Only `balance`-type accounts surface balances.
- Out of scope (still listed Backend Additions): featured-account metadata flag, server counterparty titles, date-anchored pagination, USD-converted balance aggregates, hierarchy restructuring.

## Tasks

### Task/Commit 1: Pagination totals on list responses

Clients cannot render "Page X of Y" or know result sizes. Add a total count to paginated list responses.

- [x] Add a `total_count` field (count of items matching the current filters, ignoring limit/offset) to the paginated list response schemas in `api/openapi.yaml`: transactions, journal-record search, account-records, and the paginated reference lists (accounts, categories, tags, members, transaction templates)
- [x] Implement counts in store list queries (single count query per list call against the same filter set) and surface them through services and `internal/httpapi` response mapping
- [x] Regenerate server and frontend clients (`just` codegen recipes); keep generated output fresh per `frontend-openapi-check`
- [x] Add tests covering counts with filters and with empty results
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: Transactions list sort with newest-first default

The transactions list is the only paginated list without sort parameters, and its fixed ascending order is backwards for the UI's "recent first" default.

- [x] Add `sort` (`initiated_date`, `created_at`) and `sort_dir` (`asc`/`desc`) parameters to `GET /api/transactions` with a store-owned allowlist, matching the conventions of the existing list endpoints
- [x] Default order becomes `initiated_date` descending with a stable `transaction_id` descending tiebreaker; document the default in the OpenAPI description
- [x] Regenerate clients; add tests for both directions and the tiebreaker
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 3: Account balances endpoint

Account pages, the chart of accounts, and Overview all need server-computed balances; the UI never derives them client-side.

- [x] Add a bulk balances read (e.g. `GET /api/accounts/balances`) returning, for each active `balance`-type account: account id, currency, current balance (posted + pending, cancelled excluded), and posted-only balance; support an explicit account-ids filter for targeted reads
- [x] Service-layer semantics live with the accounts service; store owns one aggregation query over active journal records
- [x] Regenerate clients; tests cover pending/posted/cancelled record mixes, multi-currency accounts (per-currency rows or documented single-currency contract per `account.currency`), and accounts with no records
- [x] Update `docs/webui-design.md` Backend Additions (balance item becomes delivered capability) and `PROJECT_STATE.md` in the same commit
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 4: Running balance in account record listings

The account register shows a per-record running balance in chronological view.

- [x] Extend `GET /api/accounts/{account_id}/records` with an opt-in running balance (e.g. `include_running_balance=true`): each record row carries the account's balance after that record, computed over the full history in chronological order; reject or ignore the option when the request's sort order is not chronological — document the contract in OpenAPI
- [x] Store owns the windowed aggregation; tests cover pagination continuity (balance correct on page 2), pending/cancelled handling consistent with Task 3 semantics
- [x] Regenerate clients; update Backend Additions list in `docs/webui-design.md`
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
- [x] Run `just review-loop "<Web UI support APIs: pagination total_count across list endpoints; transactions sort with desc default; bulk account balances (posted+pending and posted-only, balance accounts only); opt-in running balance on account records; store-owned allowlists and count/aggregation queries>"`
- [x] Move this plan to `docs/plans/completed/`
