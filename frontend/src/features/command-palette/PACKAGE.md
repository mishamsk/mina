# frontend/src/features/command-palette

## Purpose

- Owns the global command palette's navigation, actions, ranked entity discovery, and bounded transaction search.

## Implicit Contracts

- Transaction search includes Active, Expected, and Cancelled results; remains read-only; uses server-derived display titles with current account FQNs in tooltip and accessible context; falls back to unenriched results when lookup loading fails; follows the transaction browser's initiated-date-descending default order; and opens results without losing the remembered transaction-page URL.
- Non-transaction queries compose Account, Category, Tag, Member, and Transaction Template `navigation` searches with a live viewport-derived bound; the palette preserves each backend sequence, truncates the four navigable entity groups in surface order without rescoring, and resolves ranked template leaf IDs through an exact current read before application.
- Account, Category, and Tag leaves and implicit groups navigate through canonical routes; query generation prevents stale responses from replacing current results, and delayed template reads cannot supersede a later palette cycle, activation, navigation, or transaction-entry launch or surface an obsolete failure, while static commands and actions retain local command matching.
- The palette search input opts out of browser value-history suggestions so only Mina-owned command and search results are offered.

## Boundaries

- Owns: palette interaction, result presentation, and command dispatch.
- Does not own: entity ranking or eligibility, route state, transaction persistence, REST contracts, or shared ledger presentation semantics.
