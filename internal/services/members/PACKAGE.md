# github.com/mishamsk/mina/internal/services/members

## Purpose

- Owns household member domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Service instances own process-local, write-through member reference caches for active-reference validation.
- Hidden members are excluded from default lists but remain retrievable by ID for historical references.
- Hidden active members are valid write references only when callers explicitly allow hidden references.
- List results own the optional deleteability capability; active-resource usage is the eligibility rule.

## Boundaries

- Owns: member name validation, tombstoned use-case rules, active-reference validation, and active-name conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Member behavior is covered through runtime-constructed boundary tests.
