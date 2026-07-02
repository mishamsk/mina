# github.com/mishamsk/mina/internal/services/members

## Purpose

- Owns household member domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Service instances own process-local, write-through member reference caches for active-reference validation.

## Boundaries

- Owns: member name validation, tombstoned use-case rules, active-reference validation, and active-name conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Member behavior is covered through runtime-constructed boundary tests.
