# github.com/mishamsk/mina/internal/store

## Purpose

- Owns database connection helpers, migrations, query code, repository implementations, and transaction boundaries.

## Implicit Contracts

- Migrations are upgrade-only and recorded in `schema_version` in the selected accounting location.
- Store constructors receive the accounting location and repository SQL qualifies accounting objects through that location.
- DuckDB indexes are created with quoted one-part names on fully qualified tables because DuckDB rejects catalog-qualified index names in `CREATE INDEX`.
- Store code owns DB-facing row types and conversion between app service types and database column values.
- Query generation is not selected for Stage 1 recovery because the required DuckDB SQL features are not yet proven against a repo-owned generator. Manual query code must keep user values parameter-bound and dynamic identifiers selected from store-owned allowlists.
- Database-specific constraint and foreign-key errors are mapped before returning from repository implementations.
- Active-reference checks are repository-owned instead of DuckDB foreign keys for mutable/tombstoned parent rows.
- Active uniqueness is enforced by DuckDB expression indexes that index only non-tombstoned rows; repositories also pre-check active uniqueness to return stable conflict messages.
- Account, category, and tag hierarchy fields are read from DuckDB generated virtual columns.

## Boundaries

- Owns: SQL execution helpers, durable schema versioning, migrations, transactions, row types, and app-to-DB type conversion.
- Does not own: process configuration, HTTP behavior, REST DTOs, or domain validation.

## Testing Notes

- Store tests should use migrated temporary database files.
