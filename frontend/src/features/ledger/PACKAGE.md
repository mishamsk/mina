# frontend/src/features/ledger

## Purpose

- Owns shared transaction browsing, detail, and entry workflow UI.

## Implicit Contracts

- REST transaction responses own classes, shapes, roles, display titles, and amounts; shared views must not derive totals, and unavailable USD renders as `N/A`.
- Transaction pages are disposable in-memory snapshots keyed by normalized request parameters. Keep a displayed snapshot during a failed refresh, discard responses superseded by a newer page generation, and do not let detail or entry-only URL changes orphan an equivalent request.
- Routes own filter and pagination URL semantics. This feature owns only the composable `transaction` detail parameter, preserving unrelated parameters and fetching a selected transaction absent from the current page snapshot.
- Detail is read-only; reopening its row closes it and restores focus, while an intentional newer focus target wins over deferred panel autofocus. Embeddings must retain the list restore target and transaction-row/pagination hooks used when a changed row disappears.
- Category/Tag report previews reuse browser rows and read-only detail without paging, Edit mode, row mutation actions, sticky scrolling, or browser controls.
- Edit-mode selection is page-local. Apply narrow record mutations only to eligible record roles; structural changes and full transaction replacement remain in the entry editor. Row-amount editing replaces the complete active transaction atomically and keeps invalid or failed input inline.
- Successful transaction mutations use the shared refresh helpers: invalidate affected reference and register snapshots, refresh the current transaction view, featured balances, and overview, and keep other transaction pages stale for later reload.
- Entry drafts persist only UI form values per tab. Initialization defaults neither create a draft nor overwrite entered values or take focus after interaction.
- Picker-created entities remain local overlays until shared lookups refresh; client checks only shape, while REST remains the validation authority.
- Currency filters offer active account currencies plus typed codes, retain repeated canonical URL values, and leave definitive code validation to REST.

## Boundaries

- Owns: ledger display components, transaction snapshots and refresh coordination, detail loading, edit-mode behavior, entry UI mapping, and lookup picker behavior.
- Does not own: generated API setup, accounting validation or persistence, route filter semantics, or the app-shell-owned `entry` URL lifecycle and entry-save orchestration.
