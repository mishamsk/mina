# Plan: Balances API — USD equivalents and bulk current credit limits — Kata issue `y7yk`

Extend `GET /api/accounts/balances` so the Overview page (and balance strip / accounts tree later) can render group subtotals as `≈ USD` and remaining credit on cards without client-side accounting derivation or N+1 credit-limit calls. Backend/API only — no frontend consumers in this task (vp80 depends on it).

## Plan Context

- Ground truth: `docs/architecture.md` (package boundaries, typed allowlists), `docs/business-requirements.md` (`:98`, `:150-151` USD-at-recording semantics; `:82-85` credit limits), `docs/accounting-semantics.md` (balance semantics), `docs/webui-design.md` §1 Overview (consumer requirements), `docs/TESTING.md` (app-test class rules — read before writing tests), `api/openapi.yaml`. Read before starting.
- Current state (line numbers as of this plan's commit):
  - `GET /api/accounts/balances` (`api/openapi.yaml:668-699`, schema `AccountBalance` `:1890-1914`): per account+currency rows with `current_balance`/`posted_balance`; strict handler `internal/httpapi/strict_entities.go:41-53` (mapper `:337-353`); service `internal/services/accounts/accounts.go:253-266`; store CTE query `internal/store/accounts.go:149-210`.
  - USD precedent — month totals: sums stored `journal_record.amount_usd` (nullable, set at recording or backfilled; NEVER converted at query time) with `unconverted_count` for NULL rows (`internal/store/transactions.go:168-247`, `api/openapi.yaml:2679-2710`). `amount_usd` column: `internal/store/migrations/00008_...sql:22`.
  - Credit limits: `internal/services/creditlimits/creditlimits.go` (model `:13-21`, no "current limit" method anywhere); store `internal/store/credit_limit_history.go` (`ListByAccount` only); per-account REST endpoints exist. `docs/data-model.md:368-402`.
- API design decisions (operator-fixed; do not relitigate):
  - Each `AccountBalance` row gains two required fields: `current_balance_usd` (decimal string — sum of stored `amount_usd` over the row's active non-cancelled records that have one; `"0"` for zero-record rows) and `unconverted_count` (int64 — count of the row's active records lacking `amount_usd`). Same stored-value semantics as month totals: no live exchange-rate join, no query-time conversion. Document in the OpenAPI description that the USD figure is approximate and partial when `unconverted_count > 0`.
  - Each `AccountBalance` row gains an optional `credit_limit` (decimal string) — the account's current credit limit: latest active credit-limit-history row with `effective_date <= today`, absent when the account has none. Resolved via ONE batch store query for all requested accounts (no N+1), exposed through a new `creditlimits` service method taking the account-id set and an explicit as-of civil date; the strict handler composes the two service results by `account_id` (pure transport merge, no domain decisions). "Today" derives from the same clock source existing handlers/runtime use for civil dates.
  - No new endpoints; no changes to existing params or field names; additive only.
- Regenerate both clients (Go + frontend) from the updated OpenAPI via the owning `just` recipes; generated code is never hand-edited.
- Tests per `docs/TESTING.md`: app-tests through the generated REST client only (extend `internal/apptest/runtime/account_test.go` balances coverage or add a runtime test file); no store/service calls from tests. This touches real-network REST behavior → `just test-integration` before commit.
- Update package docs only if an implicit contract changes (e.g. `creditlimits` gaining a read contract others rely on); otherwise none.
- Update `PROJECT_STATE.md` in the final commit (balances API carries USD equivalents and current credit limits).
- Preserve, do not regress: existing balances semantics (active balance accounts, cancelled excluded, zero rows for record-less accounts, include_hidden/account_ids filters), existing credit-limit endpoints, month-totals behavior.

## Tasks

### Task/Commit 1: USD equivalents on balance rows

- [x] OpenAPI: add required `current_balance_usd` + `unconverted_count` to `AccountBalance` with the stored-`amount_usd` semantics description; regenerate Go and frontend clients.
- [x] Store: extend the `ListBalances` query to sum `amount_usd` and count NULLs per account+currency row (mirror the month-totals SQL pattern); zero-record rows get `"0"`/`0`.
- [x] Service + handler mapping: carry the new fields through `accounts.AccountBalance` and `accountBalanceAPIResponse`.
- [x] App-tests: balances rows assert USD sums and unconverted counts — cover: records with amount_usd, records without (unconverted counted), mixed, zero-record account row.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: Bulk current credit limits on balance rows

- [x] Store: batch query on credit_limit_history — latest active row per account with `effective_date <= as-of date`, for a set of account ids.
- [x] Service: `creditlimits` method returning current limits keyed by account id for an id set + explicit as-of civil date (validate ids like other list options).
- [x] Handler: `ListAccountBalances` composes balances + current limits by `account_id`; optional `credit_limit` on each row. OpenAPI updated; clients regenerated.
- [x] App-tests: card account with limit history shows the latest effective ≤ today limit (not a future-dated one), account without history omits the field, multiple accounts resolve in one response; tombstoned history rows ignored.
- [x] Update `PROJECT_STATE.md`; update `creditlimits`/store package docs only if an implicit contract changed.
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
- [x] Run `just review-loop "Balances API extension (kata y7yk): AccountBalance rows gain required current_balance_usd + unconverted_count (stored amount_usd sums, month-totals precedent, no query-time conversion) and optional credit_limit (latest active history row effective_date <= today, single batch query, handler-level composition of accounts + creditlimits services). Constraints: backend/API only; additive schema; clients regenerated not hand-edited; app-tests via generated REST client only per docs/TESTING.md."`
- [x] Move this plan to `docs/plans/completed/`
