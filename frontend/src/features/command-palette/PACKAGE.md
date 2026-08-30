# frontend/src/features/command-palette

## Purpose

- Owns the global command palette's navigation, actions, ranked entity discovery, and bounded transaction search.

## Implicit Contracts

- Transaction search includes Active, Expected, and Cancelled results; uses server-derived display titles with current account FQNs in tooltip and accessible context; falls back to unenriched results when lookup loading fails; follows the transaction browser's initiated-date-descending default order; and opens results without losing the remembered transaction-page URL.
- Non-transaction queries compose the four entity-owned `navigation` searches with hidden discovery enabled and a shared limit derived from the live results viewport; the palette preserves each backend sequence, groups rows as Accounts, Categories, Tags, and Members, and truncates the combined rows in that surface order without rescoring.
- Entity leaves and implicit groups navigate through their canonical detail and group routes; query generation prevents stale responses from replacing current results, while static commands, templates, and actions retain local command matching.

## Boundaries

- Owns: palette interaction, result presentation, and command dispatch.
- Does not own: entity ranking or eligibility, route state, transaction persistence, REST contracts, or shared ledger presentation semantics.
