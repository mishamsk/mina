# mina.local/mina/internal/services/members

## Purpose

- Owns household member domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: member name validation, tombstoned use-case rules, and active-name conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Member behavior is covered through runtime-constructed boundary tests.
