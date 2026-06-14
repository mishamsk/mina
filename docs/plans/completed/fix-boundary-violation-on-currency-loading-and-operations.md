# Address Exchange-Rate Refactor Feedback

## Plan Context

Address review feedback from the exchange-rate provider/cache and background operation refactor. Keep public REST paths, response fields, and generated OpenAPI wire types unchanged unless explicitly listed.

## Tasks

### Commit 1: Clean Up Docs and Boundary Comments

- [x] Add inline comments in `.golangci.yml` beside provider `database/sql` and DuckDB depguard denies:
  - Providers may later get provider-owned non-Mina SQL access if needed.
  - Providers must still never own Mina persistence or import `internal/store`.
- [x] Update `docs/architecture.md` provider wording to `concrete local system or external data providers`.
- [x] Move `docs/plans/opeartions-model.md` to `docs/plans/completed/`.
- [x] Move `docs/plans/provider-model.md` to `docs/plans/completed/`.
- [x] Verification:
  - [x] `just pre-commit` passes.

### Commit 2: Tighten Operation Boundaries and Naming

- [x] Rename runtime operation lifecycle wording from “processes/jobs” to “operations” where it refers to background operations.
- [x] Rename `StartProcesses` to `StartOperations`; update call sites, app-test helpers, docs, and comments.
- [x] Remove REST URLs from `internal/services/operationruns`; operation summaries expose only service-owned identity.
- [x] Build operation status/run URLs only in `internal/httpapi`.
- [x] Rename persistence-only operation-run APIs:
  - [x] `StartRun` -> `RecordRunStart`
  - [x] `SucceedRun` -> `RecordRunSuccess`
  - [x] `FailRun` -> `RecordRunFailure`
  - [x] `SkipRun` -> `RecordRunSkip`
  - [x] `CancelRun` -> `RecordRunCancel`
- [x] Rename `operationruns.RunRepository` to `operationruns.Repository` to match service package repository naming.
- [x] Rename the manual service use case to trigger/start operation language without changing REST paths or OpenAPI operation IDs.
- [x] Document that background triggers return an already recorded `OperationRun`.
- [x] Move operation-run repository implementation from `internal/runtime` into `internal/store`:
  - [x] Add a store constructor returning `operationruns.Repository`.
  - [x] Move operation-run row mapping, store error mapping, and app-id generation into store.
  - [x] Make operation-run DB internals unexported, including operation store type, row type, and low-level constructor.
  - [x] Keep runtime limited to wiring the store constructor result into `operationruns.NewService`.
- [x] Delete `internal/runtime/operations.go`.
- [x] Add a depguard rule that denies `internal/store` imports from `internal/runtime` except `internal/runtime/app.go` and `internal/runtime/config.go`:
  - [x] Add an inline comment explaining that runtime may touch store only in manual composition/database lifecycle and config-to-store request translation files.
  - [x] Comment that future runtime files needing store access must be added explicitly with a narrow reason, instead of broadening all runtime access.
- [x] Verification:
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.

### Commit 3: Move Exchange-Rate Loading Provider Contracts

- [x] Move `RateProvider`, `ProviderRate`, and provider error sentinels from `internal/services/exchangerates` to `internal/services/exchangerateloading`.
- [x] Update Frankfurter providers, runtime dependency seams, apptest fake providers, and loader error handling to use loader-owned provider contracts.
- [x] Revert `internal/services/exchangerates/PACKAGE.md` so it no longer claims provider-facing contracts.
- [x] Update `internal/services/exchangerateloading/PACKAGE.md` to own provider-facing loading contracts and error normalization.
- [x] Search for stale provider contract types in `internal/services/exchangerates`.
- [x] Verification:
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just pre-commit` passes.

### Commit 4: Remove Cache Config and Evergreen Test Artifacts

- [x] Remove Frankfurter cache root, cache path, and cache history depth from source-loaded config, runtime config, config source metadata, CLI propagation, docs, and apptest options.
- [x] Resolve Mina's app cache directory as `mina` under `XDG_CACHE_HOME` when set, otherwise under `os.UserCacheDir()`, then place the Frankfurter cache at `frankfurter-usd-rates.ndjson`.
- [x] Hard-code startup cache history to the existing 10-year provider constant; no config or env var controls cache history depth.
- [x] Update runtime cache population to use the fixed default cache path and fixed history window.
- [x] Remove the three negative help-output checks from `cmd/mina/testdata/script/mina_config.txt`.
- [x] Remove RUB-specific startup/file-cache tests and RUB fixture rows.
- [x] Update normal app tests to pass a temp cache dir through runtime config and place fixture data at the default Mina cache path.
- [x] Update integration startup loading to set `XDG_CACHE_HOME=$WORK/cache`, preinstall the fixture at `$WORK/cache/mina/frankfurter-usd-rates.ndjson`, and remove cache settings from TOML.
- [x] Keep exactly one live Frankfurter targeted-provider REST smoke with automatic loading disabled.
- [x] Verification:
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.

## Final Verification

- [x] Search confirms no active RUB-specific tests or RUB cutoff references.
- [x] Search confirms no active `frankfurter_cache_root`, `frankfurter_cache_path`, or `frankfurter_cache_history_years` config support remains.
- [x] Search confirms no `StatusURL` field or service-owned REST URL literals remain in `operationruns`.
- [x] Search confirms no runtime operation-store row adapter remains outside `internal/store`.
- [x] Search confirms only `internal/runtime/app.go` and `internal/runtime/config.go` import `internal/store`.
- [x] Search confirms operation-run store row types and low-level store constructors are unexported.
- [x] `just init` passes on a clean checkout with required local tools available.
- [x] `just fmt` passes.
- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just pre-commit` passes.
- [x] `just review-loop "address exchange-rate provider cache and operation boundary feedback"`.

## Assumptions

- REST API wire behavior stays unchanged.
- Runtime cache directory is Mina's app cache directory; Frankfurter uses `frankfurter-usd-rates.ndjson` under that directory.
- Frankfurter startup cache history is fixed at 10 years.
