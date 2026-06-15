# github.com/mishamsk/mina/internal/services/transactions

## Purpose

- Owns transaction, journal record, record search, and bulk record domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Create/replace and bulk category/account use cases prevalidate semantic classification from active account/category dictionaries before writes.

## Boundaries

- Owns: transaction per-currency balance checks, semantic shape validation, transaction classification, display amount derivation, journal record field validation, source/status rules, record search filter validation, reference-error mapping, tombstone delete semantics, and bulk record operation rules.
- Does not own: HTTP DTOs, transport string parsing, query-string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Transaction, journal record search, account-record search, and bulk record behavior is covered through runtime-constructed boundary tests.
