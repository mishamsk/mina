# github.com/mishamsk/mina/internal/services/health

## Purpose

- Reports process availability with migrated accounting-database metadata.

## Implicit Contracts

- `Check` reads the schema version before encryption state; it reports `ok` only when both reads succeed.
- Repository errors propagate unchanged and return no partial health report.

## Boundaries

- Owns: health result shape, read ordering, and the database-status repository contract.
- Does not own: process configuration, SQL, database row types, or HTTP mapping.
