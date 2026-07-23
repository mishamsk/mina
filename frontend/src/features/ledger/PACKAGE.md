# frontend/src/features/ledger

## Purpose

- Owns shared ledger feature UI used by transaction browsing, transaction detail, and entry.

## Implicit Contracts

- Transaction class, display titles, primary amounts, and record amounts come from REST responses.
- Transaction-row and detail-panel transaction-level inline editing follow the uniformity rule owned by `docs/webui-design.md`.
- The shared transaction-browser controller permits one active inline editor across the list, expanded records, and detail panel; a conflicting browser interaction discards the draft without performing its action, outside click discards, and Escape discards then restores focus to the originating cell.
- Category, tags, member, and amount inline editors keep selections as drafts and mutate accounting state only through their checkmark Save controls; Cancel and Escape discard identically.
- Shared browser bulk-edit interaction follows the owning [Bulk operations specification](../../../../docs/webui-design.md#bulk-operations).
- Transaction-row lifted member display ignores unattributed records.
- Transaction detail panel renders a transaction snapshot passed by the owning page; expected occurrences stay read-only, and successful edits use the same refresh fan-out as the browser.
- Transaction detail panel owns the tombstone confirmation UI and delegates delete execution to the owning page.
- `useTransactionBrowserPage` composes shared browser snapshots, page-granular date jumps with a transient row anchor, transaction detail, row tombstones, pagination, and notices; pages supply their URL filter semantics.
- `TransactionBrowserToolbar` owns filter-bar visibility; pages retain URL-filter ownership and supply chip clearing that preserves standing search, class, and expected-occurrence controls.
- Transaction browsing requests expected recurring transactions by default and triggers one occurrence catch-up read per browser mount.
- Expected recurring rows replace normal transaction actions with confirm and named-dismiss occurrence actions; successful lifecycle actions use the standard transaction-mutation refresh fan-out.
- `C::` currencies render as crypto-scale values with up to 8 decimals; other currencies render as fiat-scale 2-decimal values.
- Lookup-backed inline pickers use bounded REST lists, exclude hidden entities upstream, and do not offer an include-hidden control; broader picker surfaces own their include-hidden controls.
- Expanded-record and detail-panel record editors own only their per-cell transient state; successful saves delegate to the browser page for API-owned validation and the standard transaction-mutation refresh fan-out.
- Category, tags, and posting status use their narrow record bulk APIs; member, memo, dates, and simple row amounts use atomic transaction replacement built from the displayed transaction shape.
- Structural record fields remain non-inline; transaction pages with an entry panel expose a direct escalation action to the full journal editor.
- Entry supports the spend, income, refund, and transfer shorthand endpoints.
- Saved-transaction Edit/Split saves are full replacements owned by the entry panel; page routes select the blocking post-save refresh mode and own notices.
- Saved-transaction Duplicate reuses entry-panel prefill mapping but stays on the create path.
- Successful transaction mutations trigger shared invalidation for account, category, tag, and member page snapshots so REST-provided `deletable` flags refetch without a reload.
- Successful inline transaction and record saves update the displayed page, invalidate sibling page snapshots, release the editor, and refresh that displayed page, balances, and overview in the background; category saves fetch the complete server-derived transaction before publishing the row update.
- A background page response replaces only its unchanged source snapshot and is discarded when a newer source exists; failure preserves the displayed snapshot, marks it stale, and lets the mounted resource retry without a table loading state.
- Entry-panel saves retain the blocking page refresh so stale displayed rows cannot start a conflicting full-replacement edit while the saved transaction refetches.
- Successful bulk mutations use the same transaction, balance, overview, register, detail, and reference-page refresh fan-out as other transaction edits.
- Transaction-entry drafts are per tab and store UI form values only.
- The active entry tab is a persisted UI preference.
- Transfer fee rows are not expressible through the transfer shorthand endpoint.

## Boundaries

- Owns: ledger display atoms, transaction browser, transaction detail panel rendering, record tables, tombstone confirmation UI, bounded lookup pickers, entry-panel UI mapping, and shared transaction-mutation refresh and page-cache behavior.
- Does not own: REST endpoint generation, accounting validation, durable accounting persistence, route URL state, missing-detail fetches, or route-specific transaction mutation calls and notices.
- Page routes own URL filter semantics, URL-addressed detail state, page-specific detail actions, and entry-panel save refresh mode and notices.

## Testing Notes

- Frontend e2e tests cover transaction expansion, inline and bulk editing, detail deep links, pagination, multi-type entry, per-tab drafts, sticky entry fields, and picker keyboard submission.
