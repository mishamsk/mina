# frontend/src/features/categories

## Purpose

- Owns Categories resource lifecycle, category-specific views and editor, and category-mutation refresh coordination.

## Implicit Contracts

- The route and `reference` own URL state; this package sends normalized search, hidden visibility, and economic intent to the category list API and renders its canonical membership without browser matching.
- An empty intent-filtered response uses the filtered-empty explanation even when the ledger contains categories under another intent.
- Category resource snapshots are keyed by normalized search, hidden visibility, and economic intent; loads follow every filtered page, derive ancestors only from returned leaves, and keep the last loaded tree visible while a different key loads.
- Keep the last loaded tree visible when refresh fails; returning to its intent cancels another intent's pending retries, supersedes its request or error, and prevents older requests from overwriting the selected load.
- Every category mutation invalidates Categories before refreshing it and refreshes ledger lookups and Overview; picker candidates are request-scoped and need no client cache invalidation. Hierarchy-wide hide or restructure mutations must also invalidate transaction-page snapshots.
- Editing changes hidden state and the optional display-label override: blank clears to the backend-derived fallback; FQN moves or renames use the hierarchy workflow, and economic intent is fixed when the category is created.
- Create mode adopts a route-provided economic intent as its initial selection; an unfiltered route leaves intent unselected.
- Use only the API `deletable` signal to enable deletion; the backend owns dependency rules.
- The side panel focuses on open and delegates close focus recovery to its route; nested dismissible controls consume Escape before the panel, and delete confirmation returns focus to the panel delete control.

## Boundaries

- Owns: category resource loading, category-specific UI, and mutation refresh fan-out.
- Does not own: route registration or URL state, generic reference or hierarchy UI, generated REST setup, accounting validation, or transaction entry workflows.
