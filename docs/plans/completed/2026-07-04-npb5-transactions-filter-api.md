# Plan: Transactions list filter and search API — Kata issue `npb5`

Extend `GET /api/transactions` with the filter-bar dimensions from `docs/webui-design.md` (account, category, tag, member, amount range, date ranges, posting status, transaction class) plus free-text search over memo/counterparty — server-driven, composing with pagination, sort, and `anchor_date`. Backend/API only (blocks 0b17 filter bar).

## Plan Context

- Ground truth: `docs/architecture.md` (typed allowlists; services own validation; store owns SQL), `docs/webui-design.md:74,152` (search over memo+counterparty; filter dimensions — reconciliation status omitted until Phase 5 per the kata), `docs/business-requirements.md:173-184`, `docs/accounting-semantics.md` + `internal/services/transactions/classification.go` (class semantics), `docs/TESTING.md`. Read before starting.
- Current pipeline (line numbers as of this plan's commit): OpenAPI op `api/openapi.yaml:1166-1221`; handler `strict_transactions.go:15-42`; service `ListOptions`/`validateTransactionListOptions` (`transactions.go:154-157,523-535`); store `List` (`internal/store/transactions.go:301-376`) builds `filterQuery` = `FROM transaction WHERE tombstoned_at IS NULL` reused by count+select, with records attached separately; `transactionAnchorOffset` (`:378-412`) builds ITS OWN unfiltered counts.
- Facts that drive the design:
  - All record-level dimensions live on `journal_record` (`account_id`, `category_id`, `member_id`, `tag_ids INTEGER[]` — array column, use `list_contains`; `amount`, `amount_usd`, `memo`, `pending_date`, `posted_date` timestamps, `posting_status`); `initiated_date` is on `transaction`. No class/memo/counterparty columns on `transaction`.
  - `transaction_class` and `display_title` are DERIVED in `classification.go` (`classifyComponentSet` `:246-276` from the set of active records' category economic-intents + account-type/sign shape rules; titles use flow-account names).
  - Precedents to reuse: repeatable typed-allowlist filter (`economic_intent`, `api/openapi.yaml:172-180`, service allowlist validation `categories.go:211-214`, store `IN (...)` composition `store/categories.go:97-102`); the full record-granularity filter builder `SearchRecords`/`RecordSearchOptions` (`transactions.go:451-592`, options `:128-151`, validation `:957-987`, decimal-string params `openapi.yaml:1380-1411`).
- API design decisions (operator-fixed; do not relitigate):
  - Matching semantics: a transaction matches when ANY of its active (non-tombstoned) records matches each record-derived condition — implemented as per-dimension `EXISTS (SELECT 1 FROM journal_record jr [JOIN account a] WHERE jr.transaction_id = transaction.transaction_id AND jr.tombstoned_at IS NULL AND <cond>)` predicates ANDed together (dimensions compose; values within a multi-value dimension OR via `IN`/`list_contains` any-of).
  - Params (all optional, additive): repeatable `account_id`, `category_id`, `tag_id`, `member_id` (int64 ≥ 1, any-of within dimension, exact ids — no descendant rollup at the API); repeatable `posting_status` and `transaction_class` (typed allowlist enums, 400 on invalid); `amount_min`/`amount_max` and `amount_usd_min`/`amount_usd_max` (decimal strings, signed, same semantics/patterns as record search); `initiated_date_from/to` (civil dates), `pending_date_from/to`, `posted_date_from/to` (timestamps) matching the record-search date semantics (`initiated_*` on `transaction.initiated_date`, pending/posted on records); `search` (non-empty free text, case-insensitive contains over `jr.memo` and the record's joined `account.name`, LIKE-escaped per `escapeLikePattern`).
  - One shared filter-predicate builder in the store used by ALL THREE sites: the list `COUNT(*)`, the page select, and both `transactionAnchorOffset` counts — refactor the anchor function to take the same predicate+args so anchor seek and `total_count` stay correct under filters. This is the correctness crux; app-tests must cover anchor+filters together.
  - `transaction_class` filtering happens IN SQL (post-fetch filtering that breaks pagination/total_count is NOT acceptable): derive the class per transaction in a CTE from its active records (aggregate the distinct category economic-intents plus whatever shape inputs `classifyComponentSet` needs, joined via category/account) and match against the requested classes. `classification.go` remains the semantics source of truth — add app-tests asserting SQL-filter parity: for a fixture set containing every class (`spend, income, refund, transfer, currency_exchange, adjustment, fx_gain_loss, mixed`), filtering by each class returns exactly the transactions whose response `transaction_class` equals it. If exact SQL parity for some rule proves genuinely impossible, STOP and leave the item unticked with a note — do not ship approximate class matching silently.
  - Validation lives in the service (`validateTransactionListOptions` extended): positive ids, enum allowlists, non-empty search, decimal parsing; 400 `invalid_request` on violations. No handler-level duplication.
  - No reconciliation-status filter (Phase 5). Sort/anchor rules unchanged (anchor still requires initiated_date desc; filters compose with it).
- Regenerate Go + frontend clients via the owning `just` recipes.
- Tests per `docs/TESTING.md`: app-tests via generated REST client (`internal/apptest/runtime/transaction_test.go` pagination/anchor tests are the model). JSON-over-HTTP behavior → `just test-integration` per commit.
- Update `PROJECT_STATE.md` in the final commit. Package docs only if implicit contracts change.
- Preserve, do not regress: unfiltered list behavior byte-identical (no params → same results), anchor semantics, classification, record search endpoint, month totals.

## Tasks

### Task/Commit 1: Record/transaction-level filters + search + anchor correctness

- [x] OpenAPI: add the params above (minus `transaction_class`) to `listTransactions` with allowlist enums, decimal-string patterns, and repeatable form/explode arrays; regenerate clients.
- [x] Service: extend `transactions.ListOptions` + validation per the decisions.
- [x] Store: shared filter-predicate builder (EXISTS-based record dimensions, transaction-level initiated-date/search composition); apply to list count, page select, and refactored `transactionAnchorOffset`.
- [x] App-tests: each dimension alone (account/category/tag/member/posting status/amount native+usd/date ranges initiated+pending+posted/search memo and counterparty, case-insensitive, LIKE-escape chars); composed dimensions; multi-value any-of within a dimension; `total_count` correctness under filters; anchor_date + filters (mid-history/older-than-all/page-aligned); invalid values → 400; no-params result unchanged.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: transaction_class filter in SQL with parity tests

- [x] Store CTE deriving per-transaction class per `classifyComponentSet` semantics; `transaction_class` repeatable param end-to-end (OpenAPI enum, clients, service allowlist validation).
- [x] App-tests: fixture set covering all eight classes; per-class filter returns exactly the transactions whose response class matches; class composes with other filters, pagination, anchor; invalid class → 400.
- [x] Update `PROJECT_STATE.md`; package docs only if an implicit contract changed.
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
- [x] Run `just review-loop "Transactions list filter/search API (kata npb5): EXISTS-based any-active-record matching per dimension, multi-value typed-allowlist params, decimal-string amount ranges, initiated/pending/posted date ranges, case-insensitive memo+counterparty search, shared filter predicate across list count + page select + anchor offset counts, SQL-derived transaction_class filter with Go-classification parity tests. Constraints: backend/API only; additive params; unfiltered behavior unchanged; no reconciliation filter; services own validation; clients regenerated."`
- [x] Move this plan to `docs/plans/completed/`
