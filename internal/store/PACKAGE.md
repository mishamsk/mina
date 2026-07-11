# github.com/mishamsk/mina/internal/store

## Purpose

- Owns database connection helpers, Goose migration wiring, query code, repository implementations, and transaction boundaries.

## Implicit Contracts

- Migrations are upgrade-only Goose SQL files recorded in `schema_version` in the selected accounting location.
- Adding or editing an embedded migration requires re-pinning `PinnedMigrationContentHash`.
- New FK-shaped columns must be registered in the validation reference registry or explicitly waived.
- Database validation builds its pristine reference catalog in a scratch in-memory accounting schema.
- `AppDB` owns the DuckDB process handle, selected accounting location, active transaction, and close policy.
- Shared process-local runtime state lives in ephemeral `memory._mina_internal` tables, outside the portable accounting schema.
- Operation runs use numeric IDs from a `_mina_internal` sequence and a store-owned DuckDB status enum.
- AppDB open helpers perform DuckDB-specific process DB open/reuse and one-time file attach lifecycle.
- Backup sources perform DuckDB attach/copy/detach mechanics and reject in-memory accounting sources.
- Closing an owned `AppDB` closes its DuckDB process handle; closing a borrowed process DB detaches any attached accounting file and leaves the caller's process handle open.
- Accounting locations cache rendered database and schema identifiers resolved with DuckDB keyword metadata at open time.
- Schema-existence checks report the selected accounting schema before migration creates missing schemas.
- Repository constructors receive `AppDB` and qualify accounting objects through `AppDB` helpers.
- Repository methods execute SQL only through `AppDB.query()` or `AppDB.withTx()`.
- `AppDB.query()` routes direct repository queries to the active transaction when one exists.
- `AppDB.withTx()` starts a transaction or reuses the active one on transaction-scoped `AppDB` handles.
- Direct `AppDB.db` access is limited to open, attach, detach, migration setup, transaction creation, backup database copy, and close paths.
- DuckDB indexes are created with quoted one-part names on fully qualified tables because DuckDB rejects database-qualified index names in `CREATE INDEX`.
- Store code owns DB-facing row types and conversion between app service types and database column values.
- Store code reads account-type and category economic-intent metadata for service-owned semantic decisions.
- Transaction repositories return semantic metadata for service-owned classification and bulk semantic validation.
- Repositories bind and scan DuckDB `DATE`, `TIMESTAMP`, and decimal columns through app service value types.
- Exchange-rate loading queries infer needed currencies and latest active USD-pair dates from active accounting rows only.
- SQL casts on typed date/decimal columns are limited to store-owned expression keys such as active uniqueness indexes.
- Query generation is not selected because the required DuckDB SQL features are not yet proven against a repo-owned generator. Manual query code must keep user values parameter-bound and dynamic identifiers selected from store-owned allowlists.
- Database-specific constraint and foreign-key errors are mapped before returning from repository implementations.
- Transaction repositories store normalized journal records and own active selected-record checks for bulk operations.
- Transaction-template repositories store normalized partial record defaults.
- Record-link repositories store pairwise journal-record settlement metadata; services own semantic validation and cascade-tombstone decisions.
- Recurring repositories store normalized definition record shapes and permanent occurrence rows.
- Recurring materialization writes occurrence rows, generated transactions, and generated journal records in one store transaction.
- Recurring pause/resume operations update definition schedule state in store transactions.
- Recurring defer and date-rule resume write occurrence audit rows with definition schedule state in one store transaction.
- Dictionary usage queries report active dependency facts only; services decide whether those facts block deletes.
- Category FQN restructure rewrites active `budget.category_fqn` paths in the same store transaction as the category rewrite.
- Transaction list and record search exclude expected records by default; explicit `posting_status=expected` filters include them.
- Account balance aggregation reads active transactions and journal records only, includes pending records in current balances, excludes cancelled and expected records, and casts aggregate sums to `DECIMAL(18,8)` in SQL.
- Account-record running balances are computed over full active account history, exclude cancelled and expected record amounts, and cast aggregate sums to `DECIMAL(18,8)` in SQL.
- Active uniqueness is enforced by DuckDB expression indexes that index only non-tombstoned rows; account/category/tag/template creates map index violations after service path checks, while member and exchange-rate writes pre-check uniqueness for stable conflict messages.
- FQN restructure writes rely on service check-then-write validation and map DuckDB uniqueness conflicts.
- Path-addressed account/category/tag hidden updates rely on service check-then-write validation and issue one bulk `is_hidden` update against active leaves.
- Account, category, tag, transaction-template, and recurring-definition hierarchy fields are read from DuckDB generated virtual columns.

## Boundaries

- Owns: SQL execution helpers, migration wiring, transactions, backup database copy mechanics, ephemeral runtime-operation tables, row types, and app-to-DB type conversion.
- Does not own: process configuration, HTTP behavior, REST DTOs, or domain validation.

## Testing Notes

- Store behavior is verified through `app-tests` at the REST boundary; `app-test` functions do not inspect DuckDB tables directly.
