# github.com/mishamsk/mina/internal/services/accounts

## Purpose

- Owns account domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Service instances own process-local, write-through account reference caches for active-reference validation.
- Hidden active accounts are valid references only when callers explicitly allow hidden references.
- Featured account state is presentation metadata and does not affect accounting semantics or reference validation.

## Boundaries

- Owns: account hierarchy validation and derivation, account-type validation, currency validation, external identifier validation, hidden/featured/tombstoned use-case rules, active-reference validation, and active-FQN conflict mapping.
- Does not own: HTTP DTOs, SQL queries, database row types, or process configuration.

## Testing Notes

- Account behavior is covered through runtime-constructed boundary tests.
