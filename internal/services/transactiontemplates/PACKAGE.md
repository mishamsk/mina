# github.com/mishamsk/mina/internal/services/transactiontemplates

## Purpose

- Owns transaction-template domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Templates are hierarchical, date-free, reusable manual-entry defaults.
- Template records are partial defaults and are not required to balance or form complete journal records.
- Category is the only required record default; account, member, currency, amount, tags, memo, posting status, and reconciliation status are independently optional.
- Referenced account, category, member, and tag IDs must point to active rows; hidden accounts, categories, and tags remain valid.

## Boundaries

- Owns: template FQN validation, partial-record validation, optional status/currency/decimal rules, active reference validation, reference-error mapping, and tombstone delete semantics.
- Does not own: HTTP DTOs, transport string parsing, SQL queries, database row types, transaction date/source rules, recurring schedules, or process configuration.

## Testing Notes

- Transaction-template behavior is covered through runtime-constructed boundary tests.
