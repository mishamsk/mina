# github.com/mishamsk/mina/internal/services/exchangerates

## Purpose

- Owns exchange-rate domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: currency validation, rate decimal validation, effective-date validation, filter validation, tombstoned use-case rules, and active-rate conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Exchange-rate behavior is covered through runtime-constructed boundary tests.
