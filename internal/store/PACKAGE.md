# github.com/mishamsk/mina/internal/store

## Purpose

- Owns database connection helpers, Goose migration wiring, query code, repository implementations, and transaction boundaries.

## Implicit Contracts

- Migrations are upgrade-only Goose SQL files recorded in `schema_version` in the selected accounting location.
- The accounting DB owns the selected accounting location and close policy.
- Shared process-local runtime state lives in ephemeral `memory._mina_internal` tables, outside the portable accounting schema.
- Operation runs use numeric IDs from a `_mina_internal` sequence and a store-owned DuckDB status enum.
- Accounting open helpers perform DuckDB-specific process DB open/reuse and file attach lifecycle.
- Closing an owned accounting DB closes its DuckDB process handle; closing a borrowed process DB detaches any attached accounting file and leaves the caller's process handle open.
- Accounting locations cache rendered database and schema identifiers resolved with DuckDB keyword metadata at open time.
- Schema-existence checks report the selected accounting schema before migration creates missing schemas.
- Repository constructors receive the accounting DB and qualify accounting objects through its location.
- Repository methods execute SQL only through `AccountingDB.query()` or `AccountingDB.withTx()`.
- `AccountingDB.query()` routes direct repository queries to the active transaction when one exists.
- `AccountingDB.withTx()` starts a transaction or reuses the active one on transaction-scoped handles.
- Direct `AccountingDB.db` access is limited to open, attach, detach, migration setup, transaction creation, and close paths.
- DuckDB indexes are created with quoted one-part names on fully qualified tables because DuckDB rejects database-qualified index names in `CREATE INDEX`.
- Store code owns DB-facing row types and conversion between app service types and database column values.
- Repositories bind and scan DuckDB `DATE`, `TIMESTAMP`, and `DECIMAL(18,8)` columns through app service value types.
- Exchange-rate loading queries infer needed currencies and latest active USD-pair dates from active accounting rows only.
- SQL casts on typed date/decimal columns are limited to store-owned expression keys such as active uniqueness indexes.
- Query generation is not selected for Stage 1 recovery because the required DuckDB SQL features are not yet proven against a repo-owned generator. Manual query code must keep user values parameter-bound and dynamic identifiers selected from store-owned allowlists.
- Database-specific constraint and foreign-key errors are mapped before returning from repository implementations.
- Active-reference checks are repository-owned instead of DuckDB foreign keys for mutable/tombstoned parent rows.
- Active uniqueness is enforced by DuckDB expression indexes that index only non-tombstoned rows; repositories also pre-check active uniqueness to return stable conflict messages.
- Account, category, and tag hierarchy fields are read from DuckDB generated virtual columns.

## Boundaries

- Owns: SQL execution helpers, migration wiring, transactions, ephemeral runtime-operation tables, row types, and app-to-DB type conversion.
- Does not own: process configuration, HTTP behavior, REST DTOs, or domain validation.

## Testing Notes

- Normal app tests may inspect DuckDB state through `internal/apptest` persistence helpers.
