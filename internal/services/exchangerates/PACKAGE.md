# github.com/mishamsk/mina/internal/services/exchangerates

## Purpose

- Owns exchange-rate domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Signed amount-USD derivation copies signed USD record amounts and leaves non-USD unset until rate-selection semantics are implemented.

## Boundaries

- Owns: currency validation, typed rate validation, typed filter validation, signed amount-USD derivation, tombstoned use-case rules, and active-rate conflict mapping.
- Does not own: HTTP DTOs, transport string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Exchange-rate behavior is covered through runtime-constructed boundary tests.
