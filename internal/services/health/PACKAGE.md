# github.com/mishamsk/mina/internal/services/health

## Purpose

- Reports process availability with immutable version metadata and migrated accounting-database metadata.

## Implicit Contracts

- `Check` reports `ok` only when the required schema-version and encryption reads succeed.
- `Check` reads schema version, encryption, then file size; either required-read error propagates unchanged with no partial report and prevents later reads.
- Database file size is best-effort operational metadata: in-memory state and read failures report no size without failing health.
- Development-build metadata is supplied once by runtime composition and returned unchanged by every health check.

## Boundaries

- Owns: the health result shape, read ordering, and the database-status repository contract.
- Does not own: process configuration, SQL, database row types, or HTTP mapping.
