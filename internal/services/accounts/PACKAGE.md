# mina.local/mina/internal/services/accounts

## Purpose

- Owns account domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: account hierarchy validation and derivation, currency validation, external identifier validation, hidden/tombstoned use-case rules, and active-FQN conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Account behavior is covered through runtime-constructed boundary tests.
