# github.com/mishamsk/mina/internal/services/transactions

## Purpose

- Owns transaction, journal record, record search, and bulk record domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Create/replace and bulk category/account/tag use cases validate references through dictionary service APIs before writes.
- Create/replace infers missing `amount_usd` with posted-date-else-initiated lookup dates and preserves explicit values.
- Transaction semantic classification uses account/category reference data owned by dictionary service APIs.
- Shorthand create use cases build ordinary same-currency two-record transactions before delegating to full create validation and persistence.
- The transactions service owns `amount_usd` backfill for active journal records still storing `NULL`.
- Runtime may trigger backfill after non-canceled exchange-rate load attempts; backfill never overwrites non-`NULL` values.
- Composition may subscribe to create/replace currency-usage changes to invalidate dependent planning caches.

## Boundaries

- Owns: transaction per-currency balance checks, semantic shape validation, transaction classification, display amount derivation, journal record field validation, source/status rules, record search filter validation, reference-error mapping, tombstone delete semantics, and bulk record operation rules.
- Does not own: HTTP DTOs, transport string parsing, query-string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Transaction, journal record search, account-record search, and bulk record behavior is covered through runtime-constructed boundary tests.
