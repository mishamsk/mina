# frontend/src/features/command-palette

## Purpose

- Owns the global command palette's navigation, actions, and bounded transaction search.

## Implicit Contracts

- Transaction search includes Active, Expected, and Cancelled results; uses server-derived display titles with current account FQNs in tooltip and accessible context; falls back to unenriched results when lookup loading fails; follows the transaction browser's initiated-date-descending default order; and opens results without losing the remembered transaction-page URL.

## Boundaries

- Owns: palette interaction, result presentation, and command dispatch.
- Does not own: route state, transaction persistence, REST contracts, or shared ledger presentation semantics.
