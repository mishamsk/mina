# github.com/mishamsk/mina/internal/store

## Purpose

- Owns database connection helpers, Goose migration wiring, query code, repository implementations, and transaction boundaries.

## Implicit Contracts

- Migrations are upgrade-only Goose SQL files recorded in `schema_version` in the selected accounting location.
- `AppDB` owns the DuckDB process handle, selected accounting location, active transaction, and close policy.
- Shared process-local runtime state lives in ephemeral `memory._mina_internal` tables, outside the portable accounting schema.
- Operation runs use numeric IDs from a `_mina_internal` sequence and a store-owned DuckDB status enum.
- AppDB open helpers perform DuckDB-specific process DB open/reuse and file attach lifecycle.
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
- Repositories bind and scan DuckDB `DATE`, `TIMESTAMP`, and `DECIMAL(18,8)` columns through app service value types.
- Exchange-rate loading queries infer needed currencies and latest active USD-pair dates from active accounting rows only.
- SQL casts on typed date/decimal columns are limited to store-owned expression keys such as active uniqueness indexes.
- Query generation is not selected because the required DuckDB SQL features are not yet proven against a repo-owned generator. Manual query code must keep user values parameter-bound and dynamic identifiers selected from store-owned allowlists.
- Database-specific constraint and foreign-key errors are mapped before returning from repository implementations.
- Transaction repositories store normalized journal records and own active selected-record checks for bulk operations.
- Transaction-template repositories store normalized partial record defaults.
- Active uniqueness is enforced by DuckDB expression indexes that index only non-tombstoned rows; repositories also pre-check active uniqueness to return stable conflict messages.
- Account, category, tag, and transaction-template hierarchy fields are read from DuckDB generated virtual columns.

## Boundaries

- Owns: SQL execution helpers, migration wiring, transactions, backup database copy mechanics, ephemeral runtime-operation tables, row types, and app-to-DB type conversion.
- Does not own: process configuration, HTTP behavior, REST DTOs, or domain validation.

## Testing Notes

- Store behavior is verified through `app-tests` at the REST boundary; `app-test` functions do not inspect DuckDB tables directly.
