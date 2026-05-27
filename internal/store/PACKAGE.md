# mina.local/mina/internal/store

## Purpose

- Owns database connection helpers, migrations, and transaction boundaries.

## Implicit Contracts

- Migrations are upgrade-only and recorded in `schema_version`.
- SQLite foreign key enforcement is enabled when opening a database handle through `Open`.

## Boundaries

- Owns: SQL execution helpers and durable schema versioning.
- Does not own: process configuration, HTTP behavior, or domain validation.

## Testing Notes

- Store tests should use migrated temporary database files.
