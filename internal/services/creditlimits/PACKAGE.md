# github.com/mishamsk/mina/internal/services/creditlimits

## Purpose

- Owns credit-limit history domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: typed credit-limit validation, account-reference use-case rules, tombstoned use-case rules, and active-history conflict mapping.
- Does not own: HTTP DTOs, transport string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Credit-limit history behavior is covered through runtime-constructed boundary tests.
