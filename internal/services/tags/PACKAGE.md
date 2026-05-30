# github.com/mishamsk/mina/internal/services/tags

## Purpose

- Owns tag domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: tag FQN validation, hidden/tombstoned use-case rules, and active-name conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Tag behavior is covered through runtime-constructed boundary tests.
