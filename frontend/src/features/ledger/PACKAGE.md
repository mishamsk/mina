# frontend/src/features/ledger

## Purpose

- Owns shared transaction browsing, detail, and entry workflow UI.

## Implicit Contracts

- REST transaction responses own classes, shapes, roles, display titles, and amounts; shared views must not derive totals, and unavailable USD renders as `N/A`.
- Transaction pages are disposable in-memory snapshots keyed by normalized request parameters. Keep a displayed snapshot during a failed refresh, discard responses superseded by a newer page generation, and do not let detail or entry-only URL changes orphan an equivalent request.
- Routes own filter, sort, and pagination URL semantics. This feature owns only the composable `transaction` detail parameter, preserving unrelated parameters and fetching a selected transaction absent from the current page snapshot; list-state writes retain one overlay history entry so Back dismisses detail onto the updated list state, and a terminal lookup failure releases detail loading so the shared panel can render its reference-light fallback.
- Transaction-page snapshots include the selected sort field and direction in their identity; date jumping is available only for initiated-date descending order, and its buttons retain identity while loading so completion restores focus to the activated control. Closing the sort popover restores focus to its trigger unless an outside interaction targeted another control.
- Detail is read-only and follows the [transaction detail disclosure rules](../../../../docs/webui-design.md#transactions). Reopening its transaction row closes it and restores focus, while register embeddings may keep the same transaction open as focus moves between its records. URL-first detail selections focus the panel; register row selections keep row focus while walking across transactions. An intentional newer focus target wins over deferred panel autofocus, and embeddings must retain the list restore target and transaction-row/pagination hooks used when a changed row disappears.
- Register lifecycle refreshes may retain the complete replacement transaction while invalidating dependent register pages so detail stays complete without a redundant fetch.
- Category/Tag report previews reuse browser rows and read-only detail without paging, Edit mode, row mutation actions, sticky scrolling, or browser controls.
- Edit-mode selection is page-local. Apply narrow record mutations only to eligible record roles; structural changes and full transaction replacement remain in the entry editor. Row-amount editing replaces the complete active transaction atomically and keeps invalid or failed input inline.
- Successful transaction mutations use the shared refresh helpers: invalidate affected reference and register snapshots, refresh the current transaction view, featured balances, and overview, and keep other transaction pages stale for later reload.
- Entry drafts persist only UI form values per tab. Initialization defaults neither create a draft nor overwrite entered values or take focus after interaction.
- Picker-created entities remain local overlays until shared lookups refresh; client checks only shape, while REST remains the validation authority.
- Currency filters offer active account currencies plus typed codes, retain repeated canonical URL values, and leave definitive code validation to REST.

## Boundaries

- Owns: ledger display components, transaction snapshots and refresh coordination, detail loading, edit-mode behavior, entry UI mapping, and lookup picker behavior.
- Does not own: generated API setup, accounting validation or persistence, route filter semantics, or the app-shell-owned `entry` URL lifecycle and entry-save orchestration.
