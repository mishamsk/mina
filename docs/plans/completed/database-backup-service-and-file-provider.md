# Database Backup Service and File Provider

## Plan Context

- Goal: add a background database-backup operation and one local file backup provider.
- Operation id: `database-backup`.
- REST paths:
  - `GET /background-operations/database-backup/status`
  - `POST /background-operations/database-backup/runs`
  - `GET /background-operations/database-backup/runs/{operation_run_id}`
- Config section: `[backups.file]`.
- Default behavior: no file backup destination and no automatic schedule, so startup and recurring backup do nothing by default.
- Manual trigger requires a configured file destination; otherwise return a stable invalid-request error before creating a run.
- Automatic backup runs only when a valid non-empty schedule is configured.
- Use DuckDB database copy, not table-by-table copying:
  - Store attaches a temporary target DuckDB database.
  - Store runs exactly one `COPY FROM DATABASE <source> TO <target>` statement for the data copy.
  - Store detaches the target database.
  - Do not wrap the copy in an explicit app transaction.
- Source ownership stays in `internal/store`:
  - Store owns Mina's opened DuckDB connection, source database alias, target attach/detach, and `COPY FROM DATABASE`.
  - Do not expose `AttachDatabase` or `*store.AccountingDB` to providers.
- Destination ownership stays in `internal/providers/backups/file`:
  - The file provider owns directory creation, temp/final names, atomic rename, cleanup, and retention.
  - The file provider calls a service-owned `Source` interface with a temp target path.
  - Future providers may own destination SQL or network clients, but still must not query Mina store directly.
- `internal/services/backups` owns the provider/source interfaces and backup use case.
- `internal/runtime` wires the concrete store source, file provider, backup service, and background operation.
- Initial database-copy support rejects in-memory accounting backups because copying `memory` would include process-local `_mina_internal` operation tables.
- The first API surface exposes operation status and errors only; backup artifact paths remain filesystem artifacts owned by the provider.

## Tasks

### Commit 1: Add Backup Config and API Contract

- [x] Add app config fields for file backups.
  - [x] Add `Config.Backups.File`.
  - [x] Add `[backups.file]` TOML loading.
  - [x] Add `directory` for the local backup directory.
  - [x] Add `retention_count` where `0` means keep all successful backups.
  - [x] Add `schedule_utc` where empty means no automatic schedule.
  - [x] Add explicit env vars on leaf fields.
  - [x] Add config source metadata keys.
- [x] Add runtime validation.
  - [x] Validate `schedule_utc` only when it is non-empty.
  - [x] Validate `retention_count >= 0`.
  - [x] Do not require `directory` unless a manual run or scheduled run is requested.
- [x] Add apptest options for backup config.
  - [x] Backup file directory.
  - [x] Backup retention count.
  - [x] Backup schedule UTC.
- [x] Extend the OpenAPI background-operation contract.
  - [x] Add `database-backup` to operation-id enums.
  - [x] Add backup status, start-run, and get-run paths.
  - [x] Keep concrete operation endpoints; do not add a generic operation-run endpoint.
  - [x] Include enabled state, schedule, running/idle state, last run fields, run count, and completed-run revision in backup status.
- [x] Regenerate OpenAPI server and client code.
- [x] Add minimal handlers and service methods only as needed to keep the new contract compiling.
- [x] Verification
  - [x] `just openapi-check` passes.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes because config and JSON-over-HTTP behavior change.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.

### Commit 2: Add Backup Service, Source Boundary, and File Provider

- [x] Add `internal/services/backups`.
  - [x] Define `Source` with `CopyDatabaseToDuckDBFile(ctx, path) error`.
  - [x] Define `Provider` with `Backup(ctx, source, requestedAt) error`.
  - [x] Add `Service.Run(ctx) error`.
  - [x] Keep the package free of SQL, store, providers, runtime, background, HTTP, OpenAPI, Cobra, and process I/O.
- [x] Add a store-backed backup source.
  - [x] Add `store.NewBackupSource(accounting *AccountingDB) backups.Source`.
  - [x] Attach the provider-selected temp target file under a store-owned target database alias.
  - [x] Run one `COPY FROM DATABASE` statement from the selected accounting database to the target database.
  - [x] Detach the target database on success and after copy failures.
  - [x] Map store errors without leaking DuckDB implementation details above store.
  - [x] Reject in-memory accounting backup attempts with a stable service-level error.
- [x] Add `internal/providers/backups/file`.
  - [x] Accept explicit constructor options from runtime, not app config structs.
  - [x] Create the configured backup directory.
  - [x] Generate collision-resistant UTC filenames such as `mina-backup-YYYYMMDDTHHMMSSNNNNNNNNNZ.duckdb`.
  - [x] Use a temp file name in the same directory.
  - [x] Call `source.CopyDatabaseToDuckDBFile(ctx, tempPath)`.
  - [x] Rename temp to final only after source copy succeeds.
  - [x] Remove temp files after failures.
  - [x] Prune old successful backup files only when `retention_count > 0`.
  - [x] Leave unrelated files in the backup directory untouched.
- [x] Add package docs for new service and provider packages.
- [x] Verification
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.

### Commit 3: Wire Runtime Background Backup Operation

- [x] Extend operation-run service support.
  - [x] Add `DatabaseBackupOperationID`.
  - [x] Include database backup in `List`.
  - [x] Add backup status lookup.
  - [x] Add manual backup trigger.
  - [x] Add backup run lookup.
- [x] Wire backup service dependencies in runtime composition.
  - [x] Create the store-backed source from the opened accounting DB.
  - [x] Create the file provider only from `[backups.file]` runtime values.
  - [x] Create the backup service from the source, provider, and clock.
  - [x] Keep `runtime` as the only production package that sees concrete store and concrete provider together.
- [x] Register the background operation.
  - [x] Manual trigger is available when file backup is configured.
  - [x] No startup run.
  - [x] No recurring run when `schedule_utc` is empty.
  - [x] Register a recurring schedule only when `schedule_utc` is non-empty.
  - [x] Use the operation key to prevent overlapping backups.
  - [x] Use no retries initially.
  - [x] Classify context cancellation/deadline as canceled and other backup failures as permanent failures.
- [x] Implement HTTP handlers for backup status, trigger, and run lookup.
- [x] Add normal REST-bound app tests in `internal/apptest/runtime`.
  - [x] Status is disabled with empty default config and shows no completed runs.
  - [x] Manual trigger with no configured file destination returns invalid-request and creates no run.
  - [x] Manual trigger with a file-backed app creates one DuckDB backup file.
  - [x] Backup run transitions through existing operation-run status fields.
  - [x] Concurrent manual triggers produce one running run and one skipped run.
  - [x] In-memory accounting backup fails with a stable operation error.
  - [x] Empty `schedule_utc` does not create automatic runs when operations are enabled.
  - [x] Non-empty `schedule_utc` creates recurring runs under a fake clock.
- [x] Add apptest helpers only when repeated status polling would hide scenario intent.
- [x] Verification
  - [x] `just openapi-check` passes.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes because process startup and JSON-over-HTTP behavior change.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.

### Commit 4: Cover File Provider Rotation and Config Boundaries

- [x] Add normal REST-bound backup behavior coverage.
  - [x] Successful backups are finalized with the expected filename prefix and `.duckdb` extension.
  - [x] Failed backups leave no finalized backup file.
  - [x] Retention count prunes only provider-created successful backup files.
  - [x] Retention count leaves unrelated files untouched.
  - [x] Restored backup file can be opened by Mina through `--db` equivalent runtime config.
- [x] Add integration config coverage through testscript.
  - [x] Config file accepts `[backups.file]` settings.
  - [x] Env vars override backup file leaf fields.
  - [x] Invalid schedule is rejected only when non-empty.
  - [x] Negative retention count is rejected.
- [x] Confirm generated files remain current.
- [x] Search for boundary violations.
  - [x] No provider imports `internal/store`.
  - [x] No service imports `internal/providers`, `internal/store`, SQL, DuckDB, runtime, background, HTTP, OpenAPI, Cobra, or process I/O.
  - [x] No HTTP adapter imports concrete providers or store.
  - [x] No background package imports concrete providers or store.
- [x] Verification
  - [x] `just openapi-check` passes.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes because config, process startup, and JSON-over-HTTP behavior change.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.

### Commit 5: Update Docs and State

- [x] Update package docs for changed implicit contracts.
  - [x] `internal/services/PACKAGE.md`.
  - [x] `internal/store/PACKAGE.md`.
  - [x] `internal/providers/PACKAGE.md` if provider wording needs backup-specific clarification.
  - [x] `internal/runtime/PACKAGE.md`.
  - [x] `internal/background/PACKAGE.md` only if operation lifecycle contracts change.
- [x] Update `PROJECT_STATE.md` because backup is new product/runtime capability progress.
- [x] Keep docs evergreen and short.
- [x] Do not update `docs/architecture.md` unless separately instructed.
- [x] Verification
  - [x] `just openapi-check` passes.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available.
- [x] `just openapi-check` passes.
- [x] `just fmt` passes.
- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just pre-commit` passes.
- [x] Commit final changes.
- [x] Run `just review-loop "add database backup service and file provider; store owns DuckDB source copy; file provider owns destination lifecycle; default has no automatic schedule"`.
