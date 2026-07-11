# Plan: Exchange-rate cache fixes — malformed Frankfurter cache self-heal + recurring currency invalidation (Kata gb60, fyq2)

Two small, same-area backend fixes to exchange-rate loading:

1. `gb60`: On dev startup (`just dev --demo`) the background exchange-rate-loading operation fails with `exchange-rate provider response malformed: Frankfurter cache rows are not ordered by date` when the local Frankfurter NDJSON cache has an unordered tail. The failure comes from `planCachePopulation` (`internal/providers/exchangerates/frankfurter/frankfurter.go:284`) propagating the `inspectCacheTail` malformed error (`frankfurter.go:669`) instead of self-healing. A malformed existing cache should be invalidated and refetched in full, not fail the run.
2. `fyq2`: The exchange-rate loader caches currencies needed by active journal records (`neededCurrencies` in `internal/services/exchangerateloading/exchangerateloading.go:76`, invalidated via `InvalidateCurrencyCache` at `exchangerateloading.go:151`). Runtime wires the `currencyUsageChanged` invalidation callback only into `transactions.NewService` (`internal/runtime/app.go:316-319`, `app.go:377`). Recurring materialization and confirm paths create/post generated journal records without that signal, so a warm cache can hide a new non-USD recurring currency from later loads and `amount_usd` backfill until an unrelated invalidation.

## Plan Context

- Kata issues: `gb60` (malformed cache self-heal) and `fyq2` (recurring currency-cache invalidation). One sub-branch, one commit per issue.
- gb60 direction (decided): full-replace fallback, not row sorting. When `inspectCacheTail` reports `loading.ErrMalformedProviderResponse` inside `planCachePopulation`, plan a full refetch exactly like the empty-tail path (`seedCacheTemp` with `retainBytes` 0, `fetchFrom: opts.From`, `replaceExisting: true`) so the fetched rows replace the malformed file. Keep all other malformed-row errors (streamed API rows, per-row validation) failing as they do today. Note `PopulateCache`'s existing guard: with `replaceExisting && !result.hasRows` nothing is installed — an offline run with a malformed cache may still fail the load afterwards; that is acceptable (transient), the run self-heals once a fetch succeeds.
- gb60 read paths (`FileProvider.SettledThroughDate`/`Rates`) stay strict: after a successful populate the file is well-formed, and startup loading always runs `ensureFrankfurterCache` (`internal/runtime/app.go:570`, `app.go:631`) before planning windows.
- fyq2 direction (decided): mirror the transactions pattern (`internal/services/transactions/transactions.go:318,330,340,432-436`) — add a `currencyUsageChanged func()` parameter to `recurring.NewService` (`internal/services/recurring/recurring.go:257`), store it, add a nil-safe notify helper, and fire it after successful writes that create or post generated journal records: materialization that created at least one occurrence (`materializeDueOccurrences`, `recurring.go:596-629`), `ConfirmNext` (`recurring.go:394`), `ConfirmOccurrence` (`recurring.go:357`), and `Defer` only if its materialize step created records. Do not fire on no-op materialization. Wire the existing `currencyUsageChanged` closure in `internal/runtime/app.go` (`recurring.NewService` call at `app.go:380-389`).
- Keep boundaries: exchange-rate loading owns planning; `exchangerates.Service` owns writes; recurring stays free of exchange/loading imports (the callback is an opaque `func()`).
- Tests are app-tests per `docs/TESTING.md` (read it before writing tests): REST-client-driven, in `internal/apptest/runtime/` (existing patterns in `exchange_rate_loading_test.go`, `recurring_definition_test.go`). No unit tests; no store/service poking from tests. The frankfurter cache path/HTTP client are already harness-controllable (see existing loading tests and `internal/apptest` provider helpers).
- Package docs to update in the same commits where contracts change: `internal/providers/exchangerates/frankfurter/PACKAGE.md` currently states "HTTP status failures and malformed streamed rows leave the existing cache untouched" and "Cache rows are ordered ascending by date" — gb60 changes the malformed-existing-cache behavior (full-refetch replace) and that must be reflected. For fyq2, add the currency-usage-change signal to `internal/services/recurring/PACKAGE.md` implicit contracts if not obvious from the API docs.
- Do not change ground-truth docs (`docs/architecture.md`, `docs/webui-design.md`, semantics docs, `VISION.md`, `SCOPE.md`).
- No PROJECT_STATE.md update: these are bug fixes, not new user-visible capability.

## Tasks

### Task/Commit 1: gb60 — self-heal malformed Frankfurter cache via full-refetch replace

Make one bounded cache-population attempt recover from an unordered/malformed existing cache instead of failing the exchange-rate load. After this commit, a dev environment with a poisoned cache file heals itself on the next load.

- [x] In `planCachePopulation`, detect `loading.ErrMalformedProviderResponse` from `inspectCacheTail` and fall back to a full-replace plan (`fetchFrom: opts.From`, `replaceExisting: true`, temp seeded with zero retained bytes) instead of returning the error. Other error classes (unavailable, context) still propagate.
- [x] Regression app-test: seed a syntactically valid but date-unordered Frankfurter cache file into the harness cache location, run the exchange-rate load, and assert the load succeeds and rates for a needed currency become available (cache was replaced by refetch). Follow the existing loading-test harness patterns.
- [x] Update `internal/providers/exchangerates/frankfurter/PACKAGE.md` implicit contracts to state that a malformed existing cache is replaced by a full refetch during population (adjust the two stale contract lines; keep the doc short).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `gb60` (`kata comment gb60 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: fyq2 — recurring writes invalidate the needed-currency cache

Give recurring the same currency-usage-changed signal transactions already has, so newly generated non-USD records are visible to the next exchange-rate load and backfill.

- [x] Add a `currencyUsageChanged func()` dependency to `recurring.NewService` mirroring the transactions service pattern (field, constructor param, nil-safe notify helper).
- [x] Fire the notification after successful journal-record-creating writes: materialization that created occurrences, `ConfirmNext`, `ConfirmOccurrence`, and `Defer` when its catch-up materialization created records. No notification on no-op paths.
- [x] Pass the existing `currencyUsageChanged` closure to `recurring.NewService` in `internal/runtime/app.go`.
- [x] Regression app-test per the issue acceptance: warm the needed-currency cache (trigger a load), create a non-USD recurring definition and materialize or confirm-next an occurrence, then assert the next load plans/loads that currency (e.g. its rate becomes available / backfill works) without any unrelated invalidation.
- [x] Update `internal/services/recurring/PACKAGE.md` implicit contracts if the new signal is a non-obvious contract.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `fyq2` (`kata comment fyq2 --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Exchange-rate cache fixes (kata gb60, fyq2): planCachePopulation self-heals a malformed existing Frankfurter cache via full-refetch replace instead of failing the load; recurring.NewService gains a currencyUsageChanged callback fired after journal-record-creating writes and wired in runtime; app-test regressions for both; frankfurter/recurring PACKAGE.md contracts updated; service/runtime boundaries preserved"`
- [x] Move this plan to `docs/plans/completed/`
