# github.com/mishamsk/mina/internal/services/transactions

## Purpose

- Owns transaction, journal record, record search, and bulk record domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Create/replace and bulk category/account/tag/member use cases validate references through dictionary service APIs before writes; account-reference validation centrally enforces each single-currency account's record currency.
- Transaction-list and record-search dictionary ID filters validate active references through dictionary service APIs before reads.
- Account-scoped record search treats the path account ID as a target account and returns not found for missing or inactive accounts.
- Create/replace infers missing `amount_usd` from the transaction initiated date and preserves explicit values.
- Derived classification, category validity, and exchange exclusivity follow `docs/accounting-semantics.md`; this package owns enforcing those rules.
- Persisted display amounts derive nullable USD values from the same contributing records and sign transformations as native amounts; one missing stored `amount_usd` or an out-of-range USD aggregation makes only that derived USD amount unavailable, while dry-run and recurring-definition display amounts remain null.
- Transaction classification derives effective account display labels in memory from repository-joined FQNs and nullable overrides for directional, adjustment, and dominant-counterparty titles without changing semantic classification.
- The transactions service owns hypothetical account-type-change validation by reclassifying every active transaction that references the account with the proposed type.
- Spend, refund, income, and transfer shorthand use cases build ordinary same-currency transactions; Exchange resolves each single-currency side from its account, requires an explicit currency for each multi-currency side, and builds the four-record two-currency `system:exchange` form.
- Dry-run classification consumes only account, currency, amount, and optional category semantics; it resolves active references and derives roles, shapes, class, and amounts without requiring balance, except that exchange exclusivity still applies.
- Exported semantic record and classification contracts let adjacent services reuse transaction classification without owning transaction persistence behavior.
- The transactions service owns `amount_usd` backfill policy for active journal records still storing `NULL`; its repository applies the current dense-rate snapshot in one atomic set update using posted date before initiated date.
- Create/replace produce active transactions and accept settlement intent only for owned/party records; recurring materialization alone creates expected transactions.
- The service normalizes settlement intent into explicit dates, defaults create dates from the initiated date and later-change dates from the operation clock, preserves supplied exact timestamps, and clears dates from flow/system records.
- Bulk settlement and reconciliation are separate operations; settlement targets owned/party records, accepts optional exact dates, and computes any default timestamp once per request.
- `Cancel` changes a wholly pending active transaction to cancelled; `Restore` changes only its lifecycle back to active. Both preserve record dates and reconciliation.
- Runtime triggers backfill after non-canceled exchange-rate load attempts; backfill copies signed USD amounts, converts cache-supported non-USD amounts at fixed scale, and never overwrites non-`NULL` values.
- Composition may subscribe to create/replace currency-usage changes to invalidate dependent planning caches.
- Running balances are only available on account-scoped record searches.
- Record searches inherit transaction lifecycle and expose nullable server-derived settlement; running balances include active lifecycle only.

## Boundaries

- Owns: transaction per-currency balance checks, category-rule and exchange-exclusivity validation, derived classification and display amounts, lifecycle/settlement normalization, journal record field validation, record search filter validation, reference-error mapping, tombstone delete semantics, and bulk record operation rules.
- Does not own: HTTP DTOs, transport string parsing, query-string parsing, SQL queries, database row types, or process configuration.

## Testing Notes

- Transaction, journal record search, account-record search, and bulk record behavior is covered through runtime-constructed boundary tests.
