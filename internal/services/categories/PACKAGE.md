# mina.local/mina/internal/services/categories

## Purpose

- Owns category domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: category FQN validation, hidden/tombstoned use-case rules, and active-name conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Category behavior is covered through runtime-constructed boundary tests.
