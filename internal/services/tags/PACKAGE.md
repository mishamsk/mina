# github.com/mishamsk/mina/internal/services/tags

## Purpose

- Owns tag domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Service instances own process-local, write-through tag reference caches for active-reference validation.
- Hidden active tags are valid references only when callers explicitly allow hidden references.

## Boundaries

- Owns: tag FQN validation, hidden/tombstoned use-case rules, active-reference validation, and active-name conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Tag behavior is covered through runtime-constructed boundary tests.
