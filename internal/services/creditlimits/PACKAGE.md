# github.com/mishamsk/mina/internal/services/creditlimits

## Purpose

- Owns credit-limit history domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Account references are validated through the account service API before credit-limit history writes, account-scoped lists, and current-limit batch lookups.
- Credit-limit history can be created only for a single-currency account and inherits that account's currency without storing a separate currency.
- Current credit-limit lookups use the service clock's local civil date, exclude tombstones, choose the latest row effective on or before that date with highest-history-ID tie-breaking, and omit accounts with no applicable limit.
- Remaining credit is derived once here as the current credit limit plus Mina's signed balance; decimal calculation errors propagate and over-limit results remain negative.

## Boundaries

- Owns: typed credit-limit validation, account-reference error mapping, tombstoned use-case rules, and active-history conflict mapping.
- Does not own: HTTP DTOs, transport string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Credit-limit history behavior is covered through runtime-constructed boundary tests.
