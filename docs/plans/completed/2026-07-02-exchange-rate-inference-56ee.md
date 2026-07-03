# Plan: Exchange-Rate `amount_usd` Inference and Backfill (Kata 56ee)

Implement real non-USD `amount_usd` derivation: infer from stored `USD -> currency` rates with linear interpolation across provider gaps, auto-infer on transaction create/replace when the caller omits `amount_usd`, and backfill `NULL` values after each exchange-rate load run. Kata vv79 (extrapolation) folds into 56ee.

## Plan Context

- Rate model: per currency, only active `from_currency = 'USD'` rates count. For a lookup date `d`, fetch the bracketing rates (latest active rate at-or-before `d`, earliest active rate at-or-after `d`).
  - Exact match (`d` equals a rate date): use that rate.
  - Interior gap (both brackets exist, dates differ): linear interpolation on day counts: `rate(d) = r1 + (r2 - r1) * days(d1, d) / days(d1, d2)`.
  - Missing either bracket: unresolved, `amount_usd` stays `NULL`. There is no tail/extrapolation category and no live extrapolation path.
- Conversion: stored rates are `USD -> currency`, so `amount_usd = amount / rate(d)`. Sign follows `amount`; rates are positive.
- If the computed `amount_usd` rounds to zero at scale 8, treat the record as unresolved (`NULL`) — `amount_usd` is validated non-zero when present.
- Rounding: `govalues/decimal` round-half-to-even at scale 8 via the `*Exact` operations; no other rounding mode exists or is needed.
- Rate-lookup date: `posted_date` when present, else the transaction's `initiated_date` — the same convention the loader's needed-date queries use. The shorthand path currently passes `initiated_date` unconditionally and must be fixed to this rule.
- Provenance: `NULL` vs non-`NULL` `amount_usd` is the only signal. No provenance column. Persisted inferred values are never recomputed; backfill touches only `NULL` values.
- Backfill scope: after every successful load run, re-resolve ALL active non-USD journal records with `amount_usd IS NULL` (not just currencies/dates the run touched). A manual load trigger therefore doubles as "force backfill" after manual rate CRUD.
- Write-path consolidation: `exchangerates.Service` becomes the sole writer to `exchange_rate`. The loader keeps planning reads but persists through the rates service. No min/max rate-date cache (decided against; a single bracketing query per record is sufficient).
- Verified findings: no RUB (or any per-currency) cutoff exists in code despite mentions in the completed loader plan — nothing to remove. No crypto provider exists (Frankfurter only), so `C::` currencies stay unresolved; that gap is Kata bookkeeping, not scope.
- Tests are app-tests per `docs/TESTING.md`: fixtures and assertions only through the apptest in-process REST client (exchange-rate CRUD for rate fixtures, fake provider + fake clock for load runs).

## Tasks

### Task/Commit 1: Consolidate the exchange-rate write path

Make `exchangerates.Service` the sole writer to `exchange_rate`. Move bulk upsert from `exchangerateloading.Repository` to `exchangerates`, and have the loader persist through a narrow writer interface satisfied by `exchangerates.Service` (loader imports the rates package — same direction as `transactions` importing `accounts`). Pure refactor: REST-visible behavior is unchanged and existing app-tests must pass unmodified.

- [x] Add a bulk upsert input type and `UpsertActiveUSDRates` method to `exchangerates.Service` (validate currency codes and positive rates; same merge-active-rows semantics as today).
- [x] Add `UpsertActiveUSDRates` to `exchangerates.Repository`; move the store implementation from the `exchangerateloading.Repository` surface to the `exchangerates.Repository` surface.
- [x] Remove `UpsertActiveUSDRates` from `exchangerateloading.Repository`; add a narrow rate-writer dependency to `exchangerateloading.Service` typed with `exchangerates` inputs.
- [x] Wire `exchangerates.Service` as the loader's rate writer in `internal/runtime/app.go` (both regular and startup loader instances).
- [x] Update `internal/services/exchangerates/PACKAGE.md` and `internal/services/exchangerateloading/PACKAGE.md` implicit contracts: rates service is the sole `exchange_rate` writer; loader owns planning only.
- [x] Verification
  - [x] `just test` passes with no changes to existing test scenarios
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue 56ee
  - [x] Commit changes

### Task/Commit 2: Decimal arithmetic and real `SignedAmountUSD`

Implement the inference math. Add the missing arithmetic wrappers on `values.Decimal`, a store query for bracketing rates, and replace the USD-only stub in `exchangerates.Service.SignedAmountUSD` with exact-match / interior-interpolation resolution. After this task, shorthand creates (already wired to the deriver) produce inferred `amount_usd` for non-USD currencies.

- [x] Add `Sub`, `Mul`, and `Div` to `values.Decimal` using `SubExact`/`MulExact`/`QuoExact` at `decimalScale` plus `enforceDecimalConstraints`, following the existing `Add` pattern.
- [x] Add a repository method to `exchangerates.Repository` + store returning the bracketing active `USD -> currency` rates for a (currency, date): latest at-or-before and earliest at-or-after (`CAST(effective_date AS DATE)` comparison, active rows only).
- [x] Implement `SignedAmountUSD` (replacing the `TODO(Kata 56ee)` stub): USD passthrough; exact-date rate → `amount / rate`; interior gap → interpolate `rate(d) = r1 + (r2 - r1) * days(d1, d) / days(d1, d2)` then divide; missing either bracket → `nil, nil`; computed value rounds to zero → `nil, nil`.
- [x] Add app-tests through the REST client (rate fixtures via exchange-rate CRUD, transactions via shorthand APIs): exact-date inference, interpolated weekend/gap date, date before earliest rate → `amount_usd` null, date after latest rate → null, `C::` currency → null, negative amounts keep sign.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (shorthand JSON responses now carry inferred `amount_usd`)
  - [x] Update progress in Kata issue 56ee
  - [x] Commit changes

### Task/Commit 3: Auto-infer on full create/replace and fix the shorthand date rule

Extend inference to the full transaction APIs: when a caller omits `amount_usd` on a record, infer it; explicit caller-supplied values are honored untouched. Apply the posted-date-else-initiated lookup rule everywhere, fixing the shorthand path which currently always uses `initiated_date`.

- [x] In `transactions.Service.Create` and `Replace`, for each `JournalRecordInput` with nil `AmountUSD`, derive it via `amountUSDDeriver.SignedAmountUSD` using the record's `posted_date` (as civil date) when present, else the transaction's `initiated_date`. Keep explicit values as-is.
- [x] Fix `shorthandCreateInput` to pass posted-date-else-initiated to the deriver instead of always `InitiatedDate`.
- [x] Add app-tests: full `POST /api/transactions` with omitted `amount_usd` (USD copies amount; non-USD infers from rates), explicit `amount_usd` honored verbatim, `PUT` replace infers the same way, shorthand create with `posted_date` set selects that date's rate.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (JSON-over-HTTP behavior change)
  - [x] Update progress in Kata issue 56ee
  - [x] Commit changes

### Task/Commit 4: Backfill `NULL` `amount_usd` after load runs

Re-resolve unresolved records whenever new rates land. The `transactions` service owns the backfill (it owns `journal_record` persistence); runtime invokes it right after `exchangerateloading.Service.Load` succeeds, inside the same background-operation run for startup, scheduled, and manual triggers.

- [x] Add a `transactions.Service` backfill method: query active non-USD journal records with `amount_usd IS NULL` (with their posted-else-initiated dates), resolve each distinct (currency, date) via the deriver, and batch-update records that resolved. Unresolvable records stay `NULL`.
- [x] Add the supporting store queries/updates on the transactions repository (list null-`amount_usd` records with lookup dates; batch set `amount_usd` by record ID).
- [x] Invoke backfill from the runtime exchange-rate operation run after a successful `Load`, for the regular and startup loader paths; backfill errors are reported through the operation run like load errors.
- [x] Add app-tests: create non-USD transactions before any rates exist (`amount_usd` null via REST), trigger a manual load with the fake provider, poll the operation run to completion, assert `amount_usd` is now populated for interior dates and still null for dates outside the loaded range; a subsequent load extending the range fills the remainder.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (background operation behavior)
  - [x] Update progress in Kata issue 56ee
  - [x] Commit changes

### Task/Commit 5: Docs and Kata bookkeeping

Close out documentation contracts and the Kata ledger. No application-code changes expected.

- [x] Update `internal/services/exchangerates/PACKAGE.md` implicit contracts: inference rule (exact/interpolated interior, else null), null-only provenance signal, inferred values never recomputed.
- [x] Update `internal/services/transactions/PACKAGE.md` (backfill ownership and trigger) and `internal/runtime/PACKAGE.md` if the operation-run contract wording needs it.
- [x] Update `PROJECT_STATE.md`: non-USD `amount_usd` inference and backfill capability.
- [x] Kata: close vv79 as folded into 56ee; check whether 2aya's children (3bs4, c3d0) cover the missing crypto provider and file an issue if not. (Done during planning: vv79 closed superseded-by 56ee; 3bs4/c3d0 do not cover crypto; filed wxtq "Add crypto exchange-rate provider (CoinGecko)" under 2aya.)
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "exchange-rate amount_usd inference and backfill (Kata 56ee): rates service is sole exchange_rate writer; interior linear interpolation on USD->currency rates, amount/rate inverse; null amount_usd is the only unresolved signal, no provenance column; inferred values never recomputed; backfill scans all null amount_usd records after each load run; posted-date-else-initiated lookup date everywhere"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata issue 56ee
