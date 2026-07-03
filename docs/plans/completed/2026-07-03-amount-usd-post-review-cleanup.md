# Plan: Post-Review Cleanup of amount_usd Inference and Tracked-Currency Rate Loading (follow-up to Kata 56ee)

Two follow-ups to the 56ee implementation, closed in the current scope. Task 1 removes redundant code (duplicate currency validation, a duplicate derivation pass in the shorthand path, a two-path division shape) with no behavior change. Task 2 restores perpetual forward exchange-rate loading: any currency seen in active journal records is "tracked" and gets daily forward rate updates regardless of `amount_usd` resolution state, while historical back-loading stays demand-driven. Tracking is inferred from data — there is no user config for which rates to load.

## Plan Context

- IMPORTANT: Do NOT run `just review-loop` at any point in this plan. These are post-review follow-ups; the review cycle for this feature is closed. This overrides the default end-of-work review-loop instruction in AGENTS.md.
- Validation ownership (per `docs/architecture.md`: service packages own domain validation, and validation must not be repeated at other layers):
  - `transactions.Service` owns validation of journal-record inputs, including currency codes (`validateTransactionInput` / `validateJournalRecord`). This covers every path into `SignedAmountUSD`: full create/replace validates before `inferMissingAmountUSD` runs, and shorthand delegates to full create validation.
  - `exchangerates.Service` validates only the inputs of its own use cases (`Create`, `UpdateRate`, `List`, `UpsertActiveUSDRates`).
  - `SignedAmountUSD` is an internal cross-service contract (`transactions.AmountUSDDeriver`): callers pass an already-validated currency. It must not re-validate.
- Since full create now infers missing `amount_usd` (`inferMissingAmountUSD` in `transactions.Service.Create`/`Replace`), the shorthand path's own deriver call in `shorthandCreateInput` is a fully redundant second derivation pass (for unresolved records the deriver is currently invoked twice with identical inputs). Shorthand should leave `AmountUSD` nil and let full create infer it; the record-level posted-date-else-initiated rule in `inferMissingAmountUSD` produces identical results because shorthand copies the same `PostedDate` onto both records.
- `values.Decimal.Mul` keeps its post-`MulExact` `Round(decimalScale)` — scale-8 operands produce natural scale-16 products, so that rounding is functional, not redundant.
- Loader behavior today (post-56ee review fixes): rates load only for currencies with unresolved (`amount_usd IS NULL`) records, so the `exchange_rate` series goes stale once everything resolves. Desired rules:
  1. Tracked = seen: `NeededCurrencies` returns all active non-USD journal-record currencies (drop its `amount_usd IS NULL` filter).
  2. Forward loading always happens: each run extends every tracked currency from its latest active rate date through the provider settled date.
  3. Back-loading is demand-driven only: the window start is pulled backward only by unresolved records lacking an exact-date rate. `EarliestMissingActiveUSDRateDates` MUST keep its `amount_usd IS NULL` filter — that filter prevents perpetual historical refetch for weekend/holiday-dated records, which can never have exact-date rates and are resolved by interpolation.
  4. First sight is not deep history: a tracked currency with no active rates and no unresolved missing dates starts at the provider settled date (window covering that settled date only), then extends forward on later runs. The earliest-record-date fallback for the window start is removed; unresolved missing dates and the settled date are the only window anchors.
- The 7-day prior-bracket lookback stays and applies when the window start is anchored to an unresolved missing date, so an at-or-before interpolation bracket gets fetched.
- `NeededCurrency.EarliestDate` becomes unused by window planning; remove it from the loader repository contract rather than keeping a dead field.
- A backdated unresolved record pulls a contiguous window from its date to the settled date (existing single-window design). That is intended: back-loading exactly as deep as data demands.
- Tests are app-tests per `docs/TESTING.md`: fixtures and assertions only through the apptest REST client (fake provider + fake clock for load runs).

## Tasks

### Task/Commit 1: Remove redundant validation, derivation, and division fallback

One self-contained cleanup commit. No REST/JSON behavior changes; existing app-tests must pass without modification (this is the acceptance signal that behavior is preserved).

- [x] Remove the deriver invocation from `shorthandCreateInput` (`internal/services/transactions/shorthand.go`): drop the `SignedAmountUSD` call, the `lookupDate` computation, and the `amountUSDDeriver == nil` guard; build records with `AmountUSD: nil` and rely on `Service.Create`'s `inferMissingAmountUSD`.
- [x] Remove the `validateCurrencyCode` call from `exchangerates.Service.SignedAmountUSD`; state the precondition in the method doc comment (currency is validated by the calling service that owns the input). Keep validation in `exchangerates` CRUD and `UpsertActiveUSDRates` untouched.
- [x] Simplify `values.Decimal.Div` to a single computation path: `Quo` + `Round(decimalScale)` + `enforceDecimalConstraints`, removing the `QuoExact`-then-fallback shape. Out-of-range results must still surface as `values` sentinel errors (`ErrDecimalIntegerDigits`/`ErrDecimalPrecision`/`ErrDecimalFractionScale`) so `SignedAmountUSD`'s unresolved mapping (`inferredAmountOutsideDecimalRange`) keeps working. The existing rounds-to-zero and out-of-range app-tests are the guard.
- [x] Do not change `Mul` (its `Round` is functional) and do not add any new validation layers anywhere.
- [x] Verification
  - [x] `just test` passes with no changes to existing test scenarios
  - [x] `just pre-commit` passes
  - [x] Commit changes

### Task/Commit 2: Tracked-currency window planning

Change the loader planning queries and window computation to implement the four tracked-currency rules from Plan Context. After this task, fully resolved currencies keep receiving daily forward updates and newly seen currencies start tracking at the settled date without historical backfill.

- [x] Remove the `amount_usd IS NULL` filter from `NeededCurrencies` in `internal/store/exchange_rates.go`; keep it in `EarliestMissingActiveUSDRateDates`. Update the method doc comments to state the tracked/demand-driven split.
- [x] Drop `EarliestDate` from `exchangerateloading.NeededCurrency` and the earliest-record-date fallback in `Service.window`; new window start resolution: earliest unresolved missing date (minus the 7-day bracket lookback) when it is earliest, else latest active rate date, else the provider settled date.
- [x] Update `internal/services/exchangerateloading/PACKAGE.md`: tracked = seen in active records; forward loading unconditional; back-loading only for unresolved record dates; no earliest-record-date backfill on first sight.
- [x] Add app-tests: a currency whose records are all resolved still receives new forward rates on a later run; a newly seen currency with a caller-supplied `amount_usd` (no unresolved records) gets rates starting at the settled date only, not from its record date; a backdated unresolved record pulls the window back and resolves via backfill.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (background loading behavior)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Do NOT run `just review-loop` — post-review follow-ups, review cycle closed
- [x] Move this plan to `docs/plans/completed/`
