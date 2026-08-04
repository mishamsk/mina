# github.com/mishamsk/mina/internal/services/transactiontemplates

## Purpose

- Owns transaction-template domain types, validation, use cases, and repository contracts.

## Implicit Contracts

- Templates are hierarchical, date-free, reusable manual-entry defaults.
- Template records are partial defaults and are not required to balance or form complete journal records.
- Account, category, member, currency, amount, tags, and memo are independently optional record defaults.
- Replace preserves template identity and `fqn`; rename and move operations go through restructure.
- Referenced account, category, member, and tag IDs are validated through dictionary service APIs; hidden accounts, categories, and tags remain valid.
- Successful writes and reads derive a non-persisted list of compatible shorthand types from resolved template records. Complete amounts use the transaction classifier; missing or partial amounts are ignored together for structural Spend, Refund, and Income compatibility. Transfer requires complete directional amounts, Exchange remains Advanced-only, and a valid template with no match remains readable.
- Shorthand-wide optional member and memo defaults may be supplied on only some template records when every supplied value agrees; tags must remain uniform because template records always carry an explicit tag set.

## Boundaries

- Owns: template FQN validation, partial-record validation, optional currency/decimal rules, active reference validation, shorthand compatibility, reference-error mapping, and tombstone delete semantics.
- Does not own: HTTP DTOs, transport string parsing, SQL queries, database row types, transaction date/source rules, recurring schedules, or process configuration.

## Testing Notes

- Transaction-template behavior is covered through runtime-constructed boundary tests.
