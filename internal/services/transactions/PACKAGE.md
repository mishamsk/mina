# github.com/mishamsk/mina/internal/services/transactions

## Purpose

- Owns transaction, journal record, record search, and bulk record domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Create/replace and bulk category/account/tag use cases validate references through dictionary service APIs before writes.
- Transaction-list and record-search dictionary ID filters validate active references through dictionary service APIs before reads.
- Account-scoped record search treats the path account ID as a target account and returns not found for missing or inactive accounts.
- Create/replace infers missing `amount_usd` with posted-date-else-initiated lookup dates and preserves explicit values.
- Transaction semantic classification uses account/category reference data owned by dictionary service APIs.
- The transactions service owns hypothetical account-type-change validation by reclassifying every active transaction that references the account with the proposed type.
- Shorthand create use cases build ordinary same-currency two-record transactions before delegating to full create validation and persistence.
- The transactions service owns `amount_usd` backfill for active journal records still storing `NULL`.
- Active records within a transaction must be all cancelled or all non-cancelled, and all expected or none expected; create/replace reject mixed expected/non-expected outcomes, while create, replace, and bulk posting-status updates reject mixed cancelled/non-cancelled outcomes.
- The `Cancel` use case sets all active records to cancelled, is idempotent, preserves record dates and reconciliation status, and returns not found for missing or tombstoned transactions.
- Runtime may trigger backfill after non-canceled exchange-rate load attempts; backfill never overwrites non-`NULL` values.
- Composition may subscribe to create/replace currency-usage changes to invalidate dependent planning caches.
- Running balances are only available on account-scoped record searches.
- Record searches include expected records only when explicitly filtered to expected or requested with `include_expected`; running balances still exclude expected amounts.

## Boundaries

- Owns: transaction per-currency balance checks, semantic shape validation, transaction classification, display amount derivation, journal record field validation, source/status rules, record search filter validation, reference-error mapping, tombstone delete semantics, and bulk record operation rules.
- Does not own: HTTP DTOs, transport string parsing, query-string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Transaction, journal record search, account-record search, and bulk record behavior is covered through runtime-constructed boundary tests.
