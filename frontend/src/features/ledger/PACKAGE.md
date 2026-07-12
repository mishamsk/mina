# frontend/src/features/ledger

## Purpose

- Owns shared ledger feature UI used by transaction browsing, transaction detail, and entry.

## Implicit Contracts

- Transaction class, display titles, primary amounts, and record amounts come from REST responses.
- Transaction-row lifted record values follow the uniformity rule in `docs/webui-design.md`; member display ignores unattributed records.
- Transaction detail panel renders a transaction snapshot passed by the owning page.
- Transaction detail panel owns the tombstone confirmation UI and delegates delete execution to the owning page.
- `useTransactionBrowserPage` composes shared browser snapshots, page-granular date jumps with a transient row anchor, transaction detail, row tombstones, pagination, and notices; pages supply their URL filter semantics.
- `TransactionBrowserToolbar` owns filter-bar visibility; pages retain URL-filter ownership and supply chip clearing that preserves standing search, class, and expected-occurrence controls.
- Transaction browsing requests expected recurring transactions by default and triggers one occurrence catch-up read per browser mount.
- Expected recurring rows replace normal transaction actions with confirm and named-dismiss occurrence actions; successful lifecycle actions use the standard transaction-mutation refresh fan-out.
- `C::` currencies render as crypto-scale values with up to 8 decimals; other currencies render as fiat-scale 2-decimal values.
- Lookup-backed pickers use bounded REST lists and exclude hidden entities upstream.
- Expanded-record editors own only their per-cell transient state; successful saves delegate to the browser page for API-owned validation and the standard transaction-mutation refresh fan-out.
- Category, tags, and posting status use their narrow record bulk APIs for a single record; member, memo, and dates use atomic transaction replacement built from the displayed transaction shape.
- Structural record fields remain non-inline; transaction pages with an entry panel expose a direct escalation action to the full journal editor.
- Entry supports the spend, income, refund, and transfer shorthand endpoints.
- Saved-transaction Edit/Split saves are full replacements owned by the entry panel; page routes own the post-save refresh fan-out and notices.
- Saved-transaction Duplicate reuses entry-panel prefill mapping but stays on the create path.
- Successful transaction mutations trigger shared invalidation for account, category, tag, and member page snapshots so REST-provided `deletable` flags refetch without a reload.
- Transaction-entry drafts are per tab and store UI form values only.
- The active entry tab is a persisted UI preference.
- Transfer fee rows are not expressible through the transfer shorthand endpoint.

## Boundaries

- Owns: ledger display atoms, transaction browser, transaction detail panel rendering, record tables, tombstone confirmation UI, bounded lookup pickers, and entry-panel UI mapping.
- Does not own: REST endpoint generation, accounting validation, durable accounting persistence, route URL state, missing-detail fetches, transaction delete calls, or page snapshot refreshes beyond shared transaction-mutation invalidation.
- Page routes own URL filter semantics, URL-addressed detail state, page-specific detail actions, and REST mutation refresh rules beyond shared transaction-mutation invalidation and row tombstones.

## Testing Notes

- Frontend e2e tests cover transaction expansion, detail deep links, pagination, multi-type entry, per-tab drafts, sticky entry fields, and picker keyboard submission.
