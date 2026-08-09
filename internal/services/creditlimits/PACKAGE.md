# github.com/mishamsk/mina/internal/services/creditlimits

## Purpose

- Owns credit-limit history rules and current-limit derivation.

## Implicit Contracts

- Creation is serialized with account deletion; a successful active row becomes an active account dependency, preventing a dangling history row or account-tombstone race.
- An active entry requires a single-currency account and has no stored currency. It prevents that account's currency changing; tombstoned values must not be reinterpreted after a later currency change.
- Current-limit lookups use the service clock's local civil date, exclude tombstones, select the latest effective row (highest ID breaks ties), and omit accounts without an applicable limit.
- Remaining credit is defined here as current credit limit plus Mina's signed balance. Do not clamp it or convert it to an absolute value; it may be negative.

## Boundaries

- Owns: credit-limit validation, account-reference error mapping, and active-history conflict mapping.
- Relies on: accounts for reference and currency state, and the repository for persistence and current-row selection.
- Does not own: transport or SQL.
