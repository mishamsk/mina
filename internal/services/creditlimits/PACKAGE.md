# github.com/mishamsk/mina/internal/services/creditlimits

## Purpose

- Owns credit-limit history domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Account references are validated through the account service API before credit-limit history writes and account-scoped lists.
- Current credit-limit lookups exclude tombstones, choose the latest effective date on or before the as-of date with highest-history-ID tie-breaking, and omit accounts with no applicable limit.

## Boundaries

- Owns: typed credit-limit validation, account-reference error mapping, tombstoned use-case rules, and active-history conflict mapping.
- Does not own: HTTP DTOs, transport string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Credit-limit history behavior is covered through runtime-constructed boundary tests.
