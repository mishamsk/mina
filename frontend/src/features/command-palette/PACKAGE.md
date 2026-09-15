# frontend/src/features/command-palette

## Purpose

- Owns the global command palette's navigation, actions, ranked entity discovery, and bounded transaction search.

## Implicit Contracts

- Account leaf and group commands resolve register or filtered Transactions targets from the activating event. Their active-row ribbon keeps both action clauses constant across modifier changes, describes only the combobox, and disappears for commands without an alternate action or transaction search.
- Row interaction, content, and ribbon behavior follow [Command Palette](../../../../docs/webui-design.md#command-palette). Command rows keep a 40px height with a 4px gap; transaction rows reserve 96px.

- The keyboard-help action captures the pre-palette focus target before palette close restoration clears it, so closing help returns to the original invoker. The open palette suppresses `?`; its command hints stay in the palette without contributing a help group.

- Navigation targets matching the current pathname and search close the palette without navigating or leaving Edit mode, and restore opener focus.

- Keyboard hints use the shared Kbd primitive and do not affect command matching; template commands do not advertise the generic entry shortcut.

- Transaction search includes Active, Expected, and Cancelled results; remains read-only; uses server-derived display titles with current account FQNs in tooltip and accessible context; falls back to unenriched results when lookup loading fails; follows the transaction browser's initiated-date-descending default order; and opens results without losing the remembered transaction-page URL.
- Non-transaction queries compose Account, Category, Tag, Member, and Transaction Template `navigation` searches with a live viewport-derived bound; the palette preserves each backend sequence, truncates the four navigable entity groups in surface order without rescoring, and resolves ranked template leaf IDs through an exact current read before application.
- Frame sizing always reserves 6rem within the 84svh stack budget for the wrapped ribbon; ribbon visibility must not change the results viewport or its search limit.
- Account, Category, and Tag leaves and implicit groups navigate through canonical routes; query generation prevents stale responses from replacing current results, and delayed template reads cannot supersede a later palette cycle, activation, navigation, or transaction-entry launch or surface an obsolete failure, while static commands and actions retain local command matching.
- The palette search input opts out of browser value-history suggestions so only Mina-owned command and search results are offered.

## Boundaries

- Owns: palette interaction, result presentation, and command dispatch.
- Does not own: entity ranking or eligibility, route state, transaction persistence, REST contracts, or shared ledger presentation semantics.
