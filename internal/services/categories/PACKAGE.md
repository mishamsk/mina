# github.com/mishamsk/mina/internal/services/categories

## Purpose

- Owns category domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Service instances own process-local, write-through category reference caches for active-reference validation.
- Hidden active categories are valid references only when callers explicitly allow hidden references.

## Boundaries

- Owns: category FQN validation, economic-intent validation, hidden/tombstoned use-case rules, active-reference validation, and active-name conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Category behavior is covered through runtime-constructed boundary tests.
