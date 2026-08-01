# github.com/mishamsk/mina/internal/services/health

## Purpose

- Owns process health use cases and repository/clock contracts.

## Implicit Contracts

- Health reports the migrated schema version and encryption-at-rest state of the accounting database selected at runtime.

## Boundaries

- Owns: health use-case shape, database-status repository contract, and current server time reporting.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Health behavior is covered through runtime-constructed boundary tests.
