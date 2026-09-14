# frontend/src/features/command-palette

## Purpose

- Owns the global command palette's navigation, actions, ranked entity discovery, and bounded transaction search.

## Implicit Contracts

- Account leaf and group commands resolve register or filtered Transactions targets from the activating event; held accelerator state only changes presentation. Active subtitles keep each key-and-action clause intact when wrapping, and option descriptions expose both actions, while the polite live clause stays stable across equivalent rows to avoid duplicate arrow-navigation announcements.

- The keyboard-help action captures the pre-palette focus target before palette close restoration clears it, so closing help returns to the original invoker.

- Navigation targets matching the current pathname and search close the palette without navigating or leaving Edit mode, and restore opener focus.

- Keyboard hints use the shared Kbd primitive and do not affect command matching; template commands do not advertise the generic entry shortcut.

- Transaction search includes Active, Expected, and Cancelled results; remains read-only; uses server-derived display titles with current account FQNs in tooltip and accessible context; falls back to unenriched results when lookup loading fails; follows the transaction browser's initiated-date-descending default order; and opens results without losing the remembered transaction-page URL.
- Non-transaction queries compose Account, Category, Tag, Member, and Transaction Template `navigation` searches with a live viewport-derived bound; the palette preserves each backend sequence, truncates the four navigable entity groups in surface order without rescoring, and resolves ranked template leaf IDs through an exact current read before application.
- Account, Category, and Tag leaves and implicit groups navigate through canonical routes; query generation prevents stale responses from replacing current results, and delayed template reads cannot supersede a later palette cycle, activation, navigation, or transaction-entry launch or surface an obsolete failure, while static commands and actions retain local command matching.
- The palette search input opts out of browser value-history suggestions so only Mina-owned command and search results are offered.

## Boundaries

- Owns: palette interaction, result presentation, and command dispatch.
- Does not own: entity ranking or eligibility, route state, transaction persistence, REST contracts, or shared ledger presentation semantics.
