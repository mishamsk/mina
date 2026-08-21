# Plan: Persist UTC instants without host-timezone drift (Kata b2fw)

## Goal

Store every Mina instant as a DuckDB `TIMESTAMPTZ`, bind and project those values with explicit UTC semantics, and preserve the represented instant across database defaults, application writes, upgrades, backups, REST-backed clients, and non-UTC hosts. DuckDB stores `TIMESTAMPTZ` as an unambiguous epoch instant; this removes the current lossy assignment of timezone-aware `CURRENT_TIMESTAMP` values into naive `TIMESTAMP` columns while leaving local-time presentation to existing clients.

## Constraints

- The complete in-scope column inventory is included below and is authoritative for implementation; no additional scope survey or Kata issue exploration is required.
- Treat every existing naive timestamp as the UTC wall-clock value it already contains. The upgrade changes storage types with explicit UTC interpretation but does not infer historical host zones, apply DST offsets, repair previously shifted values, or claim provenance that Mina does not have.
- Do not alter `schema_version.tstamp`: Goose owns the `schema_version` table and requires its current `TIMESTAMP` shape. Do not add custom compatibility for a timezone-aware Goose ledger, and keep Mina's existing shape recognition unchanged.
- Preserve the listed civil values as `DATE`; they are not instants. No Mina-owned timezone-naive instant family remains after this work, but Goose's internal `schema_version.tstamp` remains an intentional third-party metadata exception.
- Preserve microsecond precision, nullability, defaults, constraints, indexes, comments, identities, ordering, ETags, and accounting meaning. Backups continue to copy the migrated accounting database without a separate data rewrite path.
- Keep OpenAPI shapes and existing client behavior stable: backend JSON remains canonical UTC, while browser and other client surfaces remain responsible for local-time presentation. Do not redesign frontend date formatting or convert civil dates into instants.
- Existing migrations are immutable. Before adding migration 17, produce the immutable version-16 fixture from clean `main` using `internal/apptest/testdata/migrations/README.md`.

## Column Inventory

Change these 54 accounting-state columns from `TIMESTAMP` to `TIMESTAMP WITH TIME ZONE`:

- `account`: `created_at`, `updated_at`, `tombstoned_at`
- `api_audit_entry`: `occurred_at`
- `budget`: `created_at`, `updated_at`, `tombstoned_at`
- `category`: `created_at`, `updated_at`, `tombstoned_at`
- `credit_limit_history`: `created_at`, `tombstoned_at`
- `exchange_rate`: `effective_date`, `created_at`, `tombstoned_at`
- `imported_record_metadata`: `provider_authorized_at`, `provider_posted_at`, `created_at`, `updated_at`, `tombstoned_at`
- `journal_record`: `pending_date`, `posted_date`, `created_at`, `updated_at`, `tombstoned_at`
- `member`: `created_at`, `updated_at`, `tombstoned_at`
- `record_link`: `created_at`, `updated_at`, `tombstoned_at`
- `recurring_definition`: `paused_at`, `created_at`, `updated_at`, `tombstoned_at`
- `recurring_definition_record`: `created_at`, `updated_at`, `tombstoned_at`
- `recurring_occurrence`: `materialized_at`, `reviewed_at`, `created_at`, `updated_at`
- `tag`: `created_at`, `updated_at`, `tombstoned_at`
- `transaction`: `created_at`, `updated_at`, `tombstoned_at`
- `transaction_template`: `created_at`, `updated_at`, `tombstoned_at`
- `transaction_template_record`: `created_at`, `updated_at`, `tombstoned_at`

Change these two disposable runtime-state columns to `TIMESTAMP WITH TIME ZONE` in `internal/store/operations.go`:

- `operation_runs`: `started_at`, `completed_at`

Keep these columns unchanged:

- Goose metadata: `schema_version.tstamp` remains `TIMESTAMP`.
- Accounting civil dates: `budget.month`, `credit_limit_history.effective_date`, `transaction.initiated_date`, `recurring_definition.anchor_date`, and `recurring_occurrence.scheduled_date` remain `DATE`.
- Runtime civil date: `dense_exchange_rates.effective_date` remains `DATE`.

## Success Criteria

- [x] Fresh and upgraded accounting schemas use `TIMESTAMP WITH TIME ZONE` for all 54 listed Mina-owned accounting instants, the disposable `operation_runs` table uses the same type for its two listed instants, every listed civil value remains `DATE`, and `schema_version.tstamp` remains Goose's plain `TIMESTAMP`.
- [x] The version-16 fixture upgrade interprets existing naive values as UTC without changing their wall-clock fields, preserves representative default-generated and application-supplied timestamps plus civil dates through REST, and completes full database validation.
- [x] Go timestamp arguments, nullable arguments, set-based SQL value casts, ETag comparisons, occurrence transitions, importer metadata, and operation-run writes use timezone-aware instant types; scans and transport mappings continue to return UTC.
- [x] Every timestamp-to-civil-date projection used by exchange-rate loading, interpolation, valuation, and backfill derives the UTC calendar date explicitly, so query results do not change with the DuckDB session timezone.
- [x] Under at least one non-UTC DuckDB/process timezone, regression coverage proves both `CURRENT_TIMESTAMP`-generated values and offset-bearing application inputs round-trip as the correct UTC instants. The shared REST transport exposes the same instant through REST, generated CLI, and MCP behavior, and the existing browser-local lifecycle test continues to render that instant in the browser timezone.
- [x] Shallow database validation reports a plain `TIMESTAMP` substituted for any listed Mina-owned target column as type drift, retains `schema_version.tstamp` as the valid Goose shape, and leaves other validation mutation fixtures with their intended isolated findings.
- [x] The migration hash, generated accounting-schema artifact, `PROJECT_STATE.md`, and package documentation maintained with the `write-package-docs` skill agree on timezone-aware Mina instant storage and UTC civil-date projection without duplicating this inventory.
- [x] `just accounting-schema-check`, `just pre-commit`, `just test`, `just test-integration`, and `just test-frontend-e2e` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-21-b2fw-utc-persisted-timestamps.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Close Kata issue `b2fw` with the commits and validation evidence.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Make UTC instants a durable storage invariant

Before adding the migration, produce `internal/apptest/testdata/migrations/v00016.duckdb.gz` from clean `main` using the repository's migration-fixture workflow. Add `internal/store/migrations/00017_use_timestamptz_for_instants.sql` to convert exactly the 54 accounting columns listed above, interpreting every old value as a UTC wall clock while preserving all existing schema details. Do not query, alter, rebuild, or add compatibility handling for `schema_version`; its generated artifact entry must remain plain `TIMESTAMP`.

Align the store boundary in the same change. Change the shared instant binder in `internal/store/value_conversions.go` from `duckdb.TYPE_TIMESTAMP` to `duckdb.TYPE_TIMESTAMP_TZ`; replace explicit instant casts in `internal/store/imported_metadata.go`, `internal/store/recurring.go`, and `internal/store/transactions.go` with timezone-aware casts; and change `operation_runs.started_at` and `operation_runs.completed_at` in `internal/store/operations.go` to timezone-aware types. Audit remaining `TIMESTAMP` declarations and casts only to prove that the sole accounting-schema remainder is `schema_version.tstamp` and that no listed Mina-owned instant was missed.

Make every instant-to-date expression in `internal/store/exchange_rates.go`, `internal/store/dense_exchange_rates.go`, and `internal/store/transactions.go` project the UTC calendar date before casting to `DATE`. Regenerate `internal/services/accountingschema/schema.sql`, review database-validation reference behavior, update the focused type-drift fixture, and repin `internal/store.PinnedMigrationContentHash`. Use `write-package-docs` for every touched package, and update `PROJECT_STATE.md` only with the resulting observable host-independent timestamp behavior.

- [x] A version-16 migration app-test in `internal/apptest/runtime/migration_test.go` proves representative timestamp families and civil dates survive with identical meaning, and the migrated database passes full validation through `apptest.NewFromMigrationFixture`.
- [x] Fresh-schema app coverage proves offset-bearing inputs, comparisons, filters, ordering, ETags, recurring timestamps, and UTC exchange-rate date selection remain correct without relying on an implicit session timezone.
- [x] Commit as `fix(store): persist instants as timezone-aware UTC`.

### Task 2: Pin non-UTC behavior at public surfaces

Add the smallest repository-owned non-UTC regression that exercises real DuckDB session/process timezone behavior. Keep app-test assertions at the generated REST boundary and use process integration where launched-process wall-clock evidence is needed for database-generated defaults; do not add a production API or let app-tests inspect SQL. Cover one database-generated timestamp and one explicit offset-bearing timestamp strongly enough that the former four-hour shift reproduces before the fix, then verify the same canonical instant through the existing REST-backed CLI and MCP paths. Reuse the existing Playwright lifecycle-timezone scenario for browser-local presentation rather than duplicating frontend coverage.

- [x] The regression fails against the old naive schema on `America/New_York` and passes with the timezone-aware schema without pinning Mina's DuckDB session to UTC.
- [x] Validation coverage deliberately substitutes plain `TIMESTAMP` for one listed Mina-owned instant and reports the exact type mismatch while accepting Goose's unchanged `schema_version` table.
- [x] Commit as `test(time): cover UTC round trips outside UTC`.
