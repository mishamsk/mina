# Startup and Background Exchange Rate Loading

## Plan Context

- Goal: add generic runtime hooks for non-blocking startup processes and recurring background processes, then register exchange-rate loading through those hooks.
- Use a TDD flow: add user-facing config and test seams first, commit intentionally failing behavior tests, then make those tests pass in later implementation commits.
- Normal tests must never call live rate providers. They use the apptest in-process REST client, fake provider-boundary dependencies, a fake clock, configured schedules, and public status/trigger APIs.
- Integration tests may call live providers. Add one Frankfurter smoke test that disables automatic loading, triggers one explicit load through REST, then asserts the created rate through existing exchange-rate REST APIs.
- `mina serve` starts runtime processes; utility flows such as `mina migrate` must not start startup or recurring jobs.
- Startup and recurring exchange-rate loading use the same service logic. Failures are logged and must not block app creation, HTTP serving, or app shutdown.
- Exchange-rate loading infers needed currencies from active non-USD journal records. The lower-bound record date is `posted_date` when present, otherwise transaction `initiated_date`.
- Stored auto-loaded pairs use `from_currency = "USD"` and `to_currency = <currency-or-asset>`. Existing active rates are updated; missing active rates are created.
- Loading starts at the day after the latest active USD pair rate when one exists, otherwise at the earliest needed record date. It still catches each needed currency up to the latest settled provider date even when there are no recent transactions.
- Fiat source: Frankfurter v2 because it supports historical time series, `base`, `quotes`, provider filtering, no API key, and no fixed monthly/daily quota beyond abuse rate limiting. Source: https://frankfurter.dev/
- Fiat settlement timing: ECB reference rates are usually updated around 16:00 CET on working days. Schedule fiat loads after that hardcoded settlement window and let provider rows define which business dates actually exist. Source: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
- RUB cutoff: ECB last published EUR/RUB on 2022-03-01 and suspended publication after that; cap RUB fetch windows at 2022-03-01 unless another source is explicitly added. Source: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
- Crypto source: support only CoinGecko Keyless Public API for now. It requires no API key, uses public endpoints, has dynamic IP-based throttling, returns `429` when throttled, and is intended for low-volume/public use. Source: https://docs.coingecko.com/docs/keyless-public-api
- Recurring exchange-rate schedule config is a cron-style UTC string. Default to a daily UTC time after the ECB settlement window, e.g. `0 17 * * *`.
- Do not update `docs/architecture.md` unless separately instructed. Update package docs and `PROJECT_STATE.md` when the capability is actually delivered.

## Tasks

### Commit 1: Add Exchange-Rate Loading Config, API Contract, and Test Seams

- [x] Add user-facing runtime config for exchange-rate loading.
  - [x] Enable/disable automatic exchange-rate loading.
  - [x] Configure recurring load schedule as a cron-style UTC string.
  - [x] Default schedule to a daily UTC time after the ECB settlement window, e.g. `0 17 * * *`.
  - [x] Validate cron syntax and document that schedules are UTC.
  - [x] Configure any provider options needed for keyless Frankfurter and keyless CoinGecko without API-key fields.
- [x] Wire config file, env, CLI/runtime conversion, and apptest config options through the existing config ownership path.
- [x] Add runtime dependency hooks for only the true test seams.
  - [x] Clock dependency for current time/date decisions.
  - [x] Exchange-rate provider dependency or factory for network-bound provider calls.
- [x] Extend `internal/apptest` only for fake clock and fake provider injection.
  - [x] Process enablement and schedule selection must use normal runtime config, not special test-only knobs.
  - [x] Do not expose stores or service internals to tests.
- [x] Add current server time to the health API response so tests can prove fake-clock wiring through a public endpoint.
- [x] Add concrete OpenAPI contracts for operation observability and manual loading.
  - [x] `GET /background-operations` lists registered operations and returns URLs for concrete status endpoints.
  - [x] Add concrete exchange-rate loading endpoints under `background-operations`, such as `GET /background-operations/exchange-rate-loading/status`, `POST /background-operations/exchange-rate-loading/runs`, and `GET /background-operations/exchange-rate-loading/runs/{operation_run_id}`.
  - [x] Use shared response fields across operations, but do not add a generic read endpoint for every operation.
  - [x] Include enabled state and schedule on the exchange-rate loading status response.
  - [x] Return an operation invocation/status reference from the trigger endpoint.
- [x] Add minimal stub handlers only as needed to keep the new contract compiling before behavior is implemented.
- [x] Update OpenAPI/generated clients for health and operation contract changes.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes because config and JSON-over-HTTP behavior changes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 2: Add Intentionally Failing Operation and Loader Tests

- [x] Add normal REST-bound tests that assert the expected end-state behavior before implementation.
  - [x] Health returns the fake clock's current server time.
  - [x] `GET /background-operations` lists registered operations and returns URLs for concrete status endpoints.
  - [x] `GET /background-operations/exchange-rate-loading/status` includes enabled state, schedule, running/idle state, last started/completed timestamps, last success, last error, run count, and a completed-run revision suitable for polling.
  - [x] Explicit exchange-rate load trigger starts one asynchronous load and returns a concrete invocation/status reference.
  - [x] `GET /background-operations/exchange-rate-loading/runs/{operation_run_id}` serves a concrete invocation after a run settles.
  - [x] Automatic startup load can be observed to completion.
  - [x] Recurring load follows the configured cron schedule when the fake clock advances.
  - [x] Disabled automatic loading does not run startup or recurring loads.
  - [x] Manual trigger works when automatic loading is disabled.
  - [x] Failed provider calls are visible through operation status and do not break regular exchange-rate CRUD APIs.
- [x] Add normal REST-bound exchange-rate loading tests with fake provider and fake clock.
  - [x] Existing rates are updated.
  - [x] New rates are created.
  - [x] `posted_date` wins over `initiated_date`.
  - [x] Records with `posted_date = null` use `initiated_date`.
  - [x] Latest-rate-plus-one-day start avoids unnecessary reloads.
  - [x] RUB cutoff prevents post-2022-03-01 fetch windows.
- [x] Mark this as a deliberate red TDD commit.
  - [x] The new tests are expected to fail until later commits implement the operation API, process runner, and loader behavior.
  - [x] Do not run or require `just pre-commit` for this commit because the branch is intentionally red.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` is run and the new named tests fail for the expected missing implementation only

### Commit 3: Add Operation Status Storage and Public APIs

- [x] Add `_mina_internal` as the runtime/system schema in the in-memory DuckDB process database for ephemeral process-operation state.
  - [x] Create an operation completion table in `_mina_internal`, outside the portable accounting schema.
  - [x] Store one row each time a process invocation completes.
  - [x] Keep the table ephemeral; it must disappear when the app's in-memory process database dies.
  - [x] Keep SQL creation/query code in `internal/store`.
- [x] Add operation state tracking for in-flight and completed invocations.
  - [x] Track running/idle state in memory.
  - [x] Persist completed invocation records to the ephemeral system table.
  - [x] Expose a completed-run revision or count for polling.
- [x] Implement the operation and exchange-rate loading handlers declared in Commit 1.
- [x] Add apptest helpers for polling concrete operation completion by public REST APIs.
- [x] Make the status/API tests from Commit 2 pass while loader behavior tests may remain red.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` is run; operation API tests pass and loader/process execution tests may still fail as expected
  - [x] `just test-integration` passes because JSON-over-HTTP behavior changes
  - [x] Required docs updated

### Commit 4: Add Runtime Process Registry and Runner

- [x] Add runtime-owned process interfaces for named startup jobs and named recurring jobs.
  - [x] Keep the registry mutation interface narrow, e.g. register startup and recurring jobs only.
  - [x] Support recurring schedules from cron-style UTC config and schedules that compute next run from a clock.
- [x] Add a process manager owned by `runtime.App`.
  - [x] Start jobs asynchronously after app composition only when process execution is enabled.
  - [x] Run startup jobs once without blocking `runtime.New`.
  - [x] Run recurring jobs serially per job and prevent overlapping executions.
  - [x] Log job errors and panics without crashing the app.
  - [x] Cancel jobs and wait for goroutines before closing the accounting DB in `App.Close`.
  - [x] Publish status transitions through the operation status APIs from Commit 3.
- [x] Wire runtime modes.
  - [x] `serve` enables processes by default and passes an error log writer.
  - [x] `migrate` leaves processes disabled.
  - [x] Apptest can enable processes through normal runtime config.
- [x] Make the generic process tests from Commit 2 pass.
  - [x] Startup jobs run in the background and become observable through the status API.
  - [x] Recurring jobs run according to configured cron schedule with fake-clock advancement.
  - [x] `App.Close` waits for in-flight jobs before closing persistence.
  - [x] Job failures are recorded in status and do not break HTTP requests.
- [x] Keep the generic process package free of exchange-rate-specific behavior.
- [x] Update `internal/runtime/PACKAGE.md` for lifecycle and shutdown contracts.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` is run; generic process tests pass and exchange-rate loader tests may still fail as expected
  - [x] `just test-integration` passes because process startup behavior changes
  - [x] Required docs updated

### Commit 5: Add Exchange-Rate Loading Planning and Store Support

- [x] Add an app-owned exchange-rate loading service package.
  - [x] Own provider interfaces and loading use-case decisions.
  - [x] Do not import runtime, HTTP, SQL, scheduler, Cobra, or generated types.
  - [x] Accept a clock so settled-through-date decisions are testable.
- [x] Add store-owned repository support for loader planning.
  - [x] Query active non-USD journal-record currencies.
  - [x] Compute earliest needed record date using `DATE(posted_date)` when present, otherwise transaction `initiated_date`.
  - [x] Query latest active `USD -> currency` exchange-rate effective date per currency.
  - [x] Upsert active exchange-rate rows so existing active values are updated.
- [x] Implement load-window planning.
  - [x] Skip USD.
  - [x] Start at earliest needed date when no active rate exists.
  - [x] Start at latest active rate date plus one day when an active rate exists.
  - [x] Cap provider windows by per-currency hard cutoffs such as RUB 2022-03-01.
  - [x] Skip empty windows.
- [x] Represent daily provider dates consistently with current exchange-rate API behavior.
- [x] Keep tombstoned exchange-rate history intact; upserts target only active rows.
- [x] Make the exchange-rate loading tests from Commit 2 pass.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` is run; exchange-rate loading tests pass and exchange-rate process registration tests may still fail as expected

### Commit 6: Register Exchange-Rate Startup, Recurring, and Manual Trigger Jobs

- [x] Add exchange-rate process registration during runtime app composition.
  - [x] Registration function accepts runtime config, concrete dependencies, and the process registry.
  - [x] The same loader job is registered as startup, recurring, and manually triggered execution.
  - [x] Registration stays separate from app construction mechanics.
- [x] Use exchange-rate loading config from Commit 1.
  - [x] Enable/disable automatic loading.
  - [x] Use cron-style UTC background schedule.
  - [x] Keep provider-settlement policy hardcoded unless a real operator need appears.
- [x] Schedule fiat recurring runs after the ECB/Frankfurter settlement window.
  - [x] Run startup load immediately in the background.
  - [x] Recurring runs compute the next source-settled date from the clock.
  - [x] Network or provider failures log and do not affect HTTP readiness.
- [x] Implement explicit REST-triggered exchange-rate loading using the same operation and status tracking.
- [x] Ensure `mina migrate` does not register or start jobs.
- [x] Make the exchange-rate process tests from Commit 2 pass.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes because serve/process startup behavior changes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 7: Add Concrete Rate Providers

- [x] Add concrete provider implementations at an explicit side-effect boundary outside service packages.
- [x] Implement Frankfurter fiat provider.
  - [x] Fetch time-series ranges with `base=USD` and narrowed `quotes`.
  - [x] Prefer official provider filtering where available and document fallback behavior.
  - [x] Parse only provider-returned dates; tolerate weekends and TARGET holidays with no rows.
  - [x] Apply request timeouts and small retry/backoff behavior only if it stays simple.
- [x] Implement CoinGecko Keyless crypto provider.
  - [x] Use the public `https://api.coingecko.com/api/v3` root without auth headers.
  - [x] Strip `C::` before provider routing and map Mina crypto codes to CoinGecko coin IDs through an explicit allowlist.
  - [x] Fetch daily historical USD prices through keyless public endpoints.
  - [x] Convert provider `asset -> USD` prices into stored `USD -> C::<asset>` rates.
  - [x] Respect dynamic IP-based throttling by limiting request volume, handling `429`, and using exponential backoff.
  - [x] Log unsupported symbols or throttling failures and continue loading other currencies when possible.
- [x] Route inferred currencies to fiat or crypto providers using explicit supported-code/provider rules.
- [x] Write provider tests with HTTP fakes at the network boundary; keep normal app tests on fake providers.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes

### Commit 8: Add Live Frankfurter Integration Smoke

- [x] Add config-file/env support and CLI wiring for disabling automatic exchange-rate loading during `serve`.
- [x] Add a testscript integration test that starts `mina serve` with automatic exchange-rate loading disabled.
- [x] Through the real network REST API, create minimal fixtures that require one historical fiat rate.
- [x] Call the explicit exchange-rate load trigger endpoint.
- [x] Poll the concrete exchange-rate loading status endpoint until the manual load completes or fails.
- [x] Assert through `GET /exchange-rates` that the expected `USD -> <fiat>` rate for the selected one-day range exists.
- [x] Keep the smoke range tiny and deterministic; avoid relying on weekends, TARGET holidays, or mutable current dates.
- [x] Mark or structure the test so it belongs to integration coverage, not normal tests.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes

### Commit 9: Tighten Docs, State, and Operational Edges

- [x] Update `internal/runtime/PACKAGE.md` with final process ownership, registration, status, trigger, ephemeral operation storage, and non-blocking failure contracts.
- [x] Add package docs for the exchange-rate loading service and provider boundary.
- [x] Update `PROJECT_STATE.md` because automatic exchange-rate loading, manual loading, and runtime process support are product/runtime capability progress.
- [x] Update config docs/help for new local config keys and environment variables.
- [x] Search for duplicated provider routing, obsolete direct loader-only exchange-rate create/update paths, and accidental live-network use in normal tests.
- [x] Confirm generated files remain current.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

## Deferred Verification

- [x] No normal tests depend on live network providers.

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available
- [x] `just openapi-check` passes
- [x] `just tidy` leaves `go.mod` and `go.sum` clean if dependencies change
- [x] `just fmt` passes
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just review-loop "add runtime startup and recurring exchange-rate loading"`
