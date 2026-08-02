# github.com/mishamsk/mina/internal/services/transactions

## Purpose

- Owns transaction, journal record, record search, and bulk record domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Create/replace and bulk category/account/tag use cases validate references through dictionary service APIs before writes; account-reference validation centrally enforces each single-currency account's record currency.
- Transaction-list and record-search dictionary ID filters validate active references through dictionary service APIs before reads.
- Account-scoped record search treats the path account ID as a target account and returns not found for missing or inactive accounts.
- Create/replace infers missing `amount_usd` from the transaction initiated date and preserves explicit values.
- Derived classification, category validity, and exchange exclusivity follow `docs/accounting-semantics.md`; this package owns enforcing those rules.
- The transactions service owns hypothetical account-type-change validation by reclassifying every active transaction that references the account with the proposed type.
- Spend, refund, income, and transfer shorthand use cases build ordinary same-currency transactions; Exchange resolves each single-currency side from its account, requires an explicit currency for each multi-currency side, and builds the four-record two-currency `system:exchange` form.
- Dry-run classification consumes only account, currency, amount, and optional category semantics; it resolves active references and derives roles, shapes, class, and amounts without requiring balance, except that exchange exclusivity still applies.
- The transactions service owns `amount_usd` backfill for active journal records still storing `NULL`.
- Create/replace produce active transactions and accept settlement intent only for owned/party records; recurring materialization alone creates expected transactions.
- The service normalizes settlement intent into explicit dates, preserves imported exact timestamps, and clears dates from flow/system records.
- Bulk settlement and reconciliation are separate operations; settlement targets owned/party records and computes timestamps once per request.
- `Cancel` changes a wholly pending active transaction to cancelled; `Restore` changes only its lifecycle back to active. Both preserve record dates and reconciliation.
- Runtime may trigger backfill after non-canceled exchange-rate load attempts; backfill never overwrites non-`NULL` values.
- Composition may subscribe to create/replace currency-usage changes to invalidate dependent planning caches.
- Running balances are only available on account-scoped record searches.
- Record searches inherit transaction lifecycle and expose nullable server-derived settlement; running balances include active lifecycle only.

## Boundaries

- Owns: transaction per-currency balance checks, category-rule and exchange-exclusivity validation, derived classification and display amounts, lifecycle/settlement normalization, journal record field validation, record search filter validation, reference-error mapping, tombstone delete semantics, and bulk record operation rules.
- Does not own: HTTP DTOs, transport string parsing, query-string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Transaction, journal record search, account-record search, and bulk record behavior is covered through runtime-constructed boundary tests.
