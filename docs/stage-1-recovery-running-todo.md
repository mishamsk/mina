# Stage 1 Recovery: DuckDB, Cobra, and Go Layout

## Plan Context

Stage 1 remains REST API only. The target implementation is one `cmd/mina` binary with Cobra commands, `internal/runtime` as the composition root, `internal/httpapi` as the REST adapter, app-owned service packages, and `internal/store` as the DuckDB adapter. The DuckDB schema must follow `docs/phase-1-data-model.md`; API behavior must continue to follow `docs/business-requirements.md`.

## Tasks

### Commit 1: Correct the architecture map
- [x] Update `docs/architecture.md` as a standalone architecture commit before code refactors.
- [x] Specify DuckDB as the required persistent database engine and DuckDB SQL as the schema/query dialect.
- [x] Make `docs/phase-1-data-model.md` the source of truth for persistent tables, column types, generated columns, enum values, sequence use, arrays, timestamps, dates, and decimal precision.
- [x] Replace the horizontal `models`/`controllers`/`routers`/`app` layering description with the target Go package boundaries:
  - `cmd/mina`: one binary and CLI command tree.
  - `internal/runtime`: config and manual composition root.
  - `internal/httpapi`: REST/OpenAPI adapter and HTTP DTO mapping.
  - app-owned service packages: domain types, validation, use cases, and repository interfaces.
  - `internal/store`: DuckDB open/migrate/query code and repository implementations.
  - future `internal/tui` and `internal/background` adapters only when their stages require them.
- [x] Document that app service packages must not import HTTP, OpenAPI, TUI, scheduler, SQL, generated DB, or process I/O packages.
- [x] Document that `internal/store` owns DB-facing row types, generated query code if used, migrations, transactions, DuckDB-specific error mapping, and app-to-DB type conversion.
- [x] Document that Cobra owns CLI parsing and command help; no new hand-rolled flag parser.
- [x] Keep Stage 1 UI scope unchanged: no TUI or web UI implementation.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 2: Add target package skeleton and dependency decisions
- [x] Add or update package docs for `internal/runtime`, `internal/httpapi`, `internal/store`, and the app-owned service package pattern.
- [x] Choose the concrete service package names for Stage 1 domains: accounts, categories, tags, members, exchange rates, credit limit history, transactions, journal records, and bulk record operations.
- [x] Add direct dependencies for common boundaries instead of ad hoc code:
  - [x] `github.com/spf13/cobra` for CLI parsing.
  - [x] `github.com/duckdb/duckdb-go/v2` for the DuckDB `database/sql` driver.
  - [x] A decimal package only if needed for exact service-layer arithmetic and DuckDB `DECIMAL(18,8)` mapping.
- [x] Decide whether query generation is viable for the required DuckDB SQL. If it is viable, add store-owned query generation paths; if not, document the manual store mapping policy in `internal/store/PACKAGE.md`.
- [x] Keep `oapi-codegen` as the REST contract generator unless a specific REST generation problem is identified.
- [x] Update `docs/generated-files.md` for any moved or newly generated files.
- [x] Update `PROJECT_STATE.md` with the new dependency and package direction.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 3: Replace CLI parsing with Cobra
- [x] Rebuild `cmd/mina` around a Cobra root command.
- [x] Preserve `mina --help`, `mina help`, `mina --version`, and current exit-code behavior.
- [x] Implement `mina serve` flags through Cobra and pflag, preserving `--db`, `--host`, `--port`, `--create`, and `--migrate`.
- [x] Add `mina migrate` as a migration-only runtime mode with no HTTP listener.
- [x] Move process config structs and validation that are not command rendering concerns into `internal/runtime/config.go`.
- [x] Keep command output and error text stable where tests already cover it, unless the architecture commit intentionally changes the CLI contract.
- [x] Update CLI smoke tests for Cobra help, bad flags, version, serve startup failures, and migrate-only behavior.
- [x] Update `PROJECT_STATE.md` with the Cobra command shape.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just test-cli` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 4: Move composition and REST adapter packages
- [x] Move `internal/app` composition responsibilities to `internal/runtime`.
- [x] Move REST handlers from `internal/routers` to `internal/httpapi`.
- [x] Move generated OpenAPI code from `internal/openapi` into the REST adapter package, or into a REST-adapter-owned subpackage if that keeps generated DTOs isolated.
- [x] Move the OpenAPI source and generator config into the REST adapter path if required by the architecture decision, and update `just openapi`.
- [x] Keep `internal/apptest` as a boundary test helper that constructs the app through `internal/runtime`.
- [x] Ensure only `cmd/mina` and tests import `internal/runtime`.
- [x] Ensure `internal/httpapi` does not open databases, parse CLI flags, or contain domain decisions.
- [x] Update generated-file docs and package docs after the move.
- [x] Update `PROJECT_STATE.md` with the new runtime and REST package inventory.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just openapi` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 5: Refactor category, tag, and member into service packages
- [x] Create app-owned packages for categories, tags, and members with domain types, `Service`, and repository interfaces.
- [x] Move validation and use-case logic out of the old controller package.
- [x] Keep HTTP request/response parsing and OpenAPI DTO mapping in `internal/httpapi`.
- [x] Make `internal/store` implement the category, tag, and member repositories.
- [x] Remove HTTP, OpenAPI, SQL, and generated DB type imports from these service packages.
- [x] Preserve current REST behavior for create, get, list, patch, delete, hidden filtering, tombstone filtering, duplicate active values, and hierarchy-derived fields.
- [x] Update boundary tests to use runtime/httpapi construction and service-owned expected types where appropriate.
- [x] Update package docs and `PROJECT_STATE.md`.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 6: Refactor account, credit limit, and exchange rate services
- [x] Create app-owned packages for accounts, credit limit history, and exchange rates with domain types, `Service`, and repository interfaces.
- [x] Move validation and use-case logic out of the old controller package.
- [x] Keep account hierarchy, currency validation, external identifier validation, credit limit validation, and exchange rate validation in service packages.
- [x] Keep HTTP DTO mapping in `internal/httpapi`.
- [x] Make `internal/store` implement the new repositories.
- [x] Preserve current REST behavior for all account, credit limit history, and exchange rate endpoints.
- [x] Update boundary tests for hidden/tombstoned filtering, active uniqueness, currency/rate/decimal validation, effective-date validation, and list ordering.
- [x] Update package docs and `PROJECT_STATE.md`.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 7: Refactor transaction, journal record, search, and bulk services
- [x] Create app-owned transaction and journal record packages, or one transaction package with record-owned subtypes, matching the architecture decision.
- [x] Move transaction validation, balance checks, reference validation, full replacement, tombstone delete, record search, account-record search, and bulk record operations out of the old controller package.
- [x] Keep source, posting status, reconciliation status, date, amount, USD amount, tag, category, member, and account rules in the service layer.
- [x] Keep HTTP query parsing, HTTP status mapping, and OpenAPI DTO conversion in `internal/httpapi`.
- [x] Make `internal/store` implement transaction, record search, and bulk operation repositories.
- [x] Ensure multi-row changes remain atomic through store-owned transaction helpers.
- [x] Preserve current REST behavior for transaction create/read/list/update/delete, record search, account-record search, and all bulk operations.
- [x] Update boundary tests for balance checks, invalid references, filter allowlists, bulk all-or-nothing behavior, and read-after-write scenarios.
- [x] Remove replaced code from the old `internal/controllers` and `internal/models` packages when no longer imported.
- [x] Update package docs and `PROJECT_STATE.md`.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 8: Replace SQLite with DuckDB connection and migrations
- [x] Remove SQLite driver usage and SQLite-specific error handling.
- [x] Implement `store.Open` with the DuckDB driver and a portable file database path.
- [x] Replace SQLite schema-version detection with DuckDB-compatible catalog checks.
- [x] Rewrite migrations in DuckDB SQL and align them with `docs/phase-1-data-model.md`.
- [x] Add the global `primary_key_gen_seq` sequence and use it for primary keys.
- [x] Add DuckDB enum types for `posting_status`, `reconciliation_status`, and `source`.
- [x] Add all data-model tables: `category`, `tag`, `member`, `account`, `transaction`, `journal_record`, `exchange_rate`, `budget`, and `credit_limit_history`.
- [x] Use DuckDB column types from the data model: `BOOLEAN`, `DATE`, `TIMESTAMP`, `DECIMAL(18,8)`, generated virtual columns, and `INTEGER[]` tag arrays.
- [x] Remove SQLite-only schema constructs: `AUTOINCREMENT`, `strftime` timestamp defaults, `sqlite_master`, text-backed decimals/dates/timestamps, and the `journal_record_tag` table.
- [x] Validate DuckDB behavior for the `transaction` table name and use the least invasive quoting strategy if the engine requires it.
- [x] Validate active uniqueness semantics for tombstoned rows. If `UNIQUE(..., tombstoned_at)` does not enforce active uniqueness with `NULL`, enforce the product rule in a DuckDB-supported way and document the durable choice.
- [x] Reconcile data-model/product-contract conflicts before coding around them, especially `journal_record.category_id` nullability versus the business rule that each record has one category.
- [x] Keep schema support for `budget` even if no Stage 1 REST endpoint is added.
- [x] Update migration tests to run against temporary DuckDB databases.
- [x] Update `PROJECT_STATE.md` with DuckDB database behavior and schema version.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 9: Align store queries and DB-facing type mappings with DuckDB
- [x] Update all repository implementations to use DuckDB-compatible SQL.
- [x] Map DuckDB `DATE`, `TIMESTAMP`, `BOOLEAN`, `DECIMAL(18,8)`, enum, sequence-generated ID, and `INTEGER[]` values to app-owned service types.
- [x] Replace Go-derived hierarchy output with reads from DuckDB generated virtual columns where the schema owns those fields.
- [x] Replace join-table tag persistence with `journal_record.tag_ids INTEGER[]` reads and writes.
- [x] Keep user-provided SQL values parameter-bound and keep dynamic identifiers selected from store-owned allowlists.
- [x] Replace SQLite constraint detection with DuckDB-specific constraint and foreign-key error mapping.
- [x] Preserve active/tombstoned filtering and deterministic ordering for all list/search endpoints.
- [x] Add store and boundary tests for DuckDB decimal precision, enum casing, generated columns, tag arrays, uniqueness, foreign keys, and date/timestamp scans.
- [x] Update `PROJECT_STATE.md` with any behavior or durable state changes.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 10: Align API DTO mapping with service and DuckDB types
- [x] Audit every OpenAPI schema against app-owned service types and the DuckDB data model.
- [x] Keep the stable JSON error envelope.
- [x] Keep external decimal JSON representation stable unless the REST contract is intentionally changed.
- [x] Explicitly map REST enum casing to service and DuckDB enum casing. Do not let DB enum strings leak accidentally through HTTP responses.
- [x] Explicitly map REST date strings to service date types and DuckDB `DATE`.
- [x] Explicitly map timestamps returned by the API from DuckDB `TIMESTAMP`.
- [x] Confirm Stage 1 API support for `source`: schema supports all data-model enum values, but REST validation may remain `manual` only if the business requirements still limit Stage 1 creation to manual source.
- [x] Confirm `budget` remains schema-only or add REST contract work if the product docs require a Stage 1 budget API.
- [x] Regenerate OpenAPI artifacts when API schemas or generated package paths change.
- [x] Update API boundary tests for all DTO/type conversions.
- [x] Update `PROJECT_STATE.md` with confirmed API contracts.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just openapi` passes
  - [x] `just test-boundary` passes for touched behavior
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated
  - [x] Post-commit `/review` subagent run and fixes applied

### Commit 11: Add import-boundary enforcement and remove legacy packages
- [ ] Add an import-boundary test or lint configuration owned by `just` to protect the architecture rules.
- [ ] Enforce that service packages do not import `internal/httpapi`, generated OpenAPI code, `internal/store`, `database/sql`, Cobra, or process I/O packages.
- [ ] Enforce that `internal/store` does not import `internal/httpapi`, generated OpenAPI code, Cobra, or runtime composition.
- [ ] Enforce that only `cmd/mina`, tests, and explicit boundary helpers import `internal/runtime`.
- [ ] Delete obsolete `internal/models`, `internal/controllers`, `internal/routers`, `internal/app`, and `internal/openapi` packages after all imports are gone.
- [ ] Remove SQLite dependencies from `go.mod` and `go.sum`.
- [ ] Run `go mod tidy` through a `just` recipe if one exists, or add a `Justfile` recipe before using it.
- [ ] Update package docs, generated-file docs, and `PROJECT_STATE.md`.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just lint` passes
  - [ ] `just test-boundary` passes for touched behavior
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated
  - [ ] Post-commit `/review` subagent run and fixes applied

### Commit 12: Run full recovery verification
- [ ] Run the complete Stage 1 boundary suite against DuckDB.
- [ ] Run process-level CLI smoke tests for help, version, bad flags, database creation/opening, migration-only mode, and server startup.
- [ ] Run process-level REST smoke tests against a temporary DuckDB database.
- [ ] Verify `mina serve` starts through Cobra and `internal/runtime`.
- [ ] Verify `mina migrate` applies DuckDB migrations without starting HTTP.
- [ ] Verify no SQLite dependency, import, migration SQL, docs inventory, or test helper remains.
- [ ] Verify every implemented endpoint still returns stable JSON errors for validation, not-found, conflict, method, and missing-route cases.
- [ ] Update `PROJECT_STATE.md` with the final corrected package inventory, dependency list, database behavior, CLI behavior, and test recipes.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just openapi` passes
  - [ ] `just lint` passes
  - [ ] `just test-boundary` passes
  - [ ] `just test` passes
  - [ ] `just test-cli` passes
  - [ ] `just test-rest` passes
  - [ ] `just smoke` passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated
  - [ ] Post-commit `/review` subagent run and fixes applied

## Deferred Verification

- [ ] `just test-cli` passes when relevant
- [ ] `just test-rest` passes when relevant
- [ ] `just smoke` passes for release or risky changes
- [ ] Any DuckDB-driver platform issue is reproduced through a `just` recipe and resolved before proceeding.
- [ ] Any query-generation limitation for DuckDB is documented in the store package docs before manual query code is accepted.

## Final Verification

- [ ] `just test-boundary` passes
- [ ] `just test` passes
- [ ] `just pre-commit` passes
- [ ] Deferred verification completed or explicitly marked not relevant
- [ ] `PROJECT_STATE.md` matches the corrected runtime, package, dependency, CLI, database, and REST behavior.
