# frontend/src/features/categories

## Purpose

- Owns Categories resource lifecycle, category-specific views and editor, and category-mutation refresh coordination.

## Implicit Contracts

- The route and `reference` own URL state; this package receives `search` and `includeHidden` to filter a complete, hidden-inclusive category and group snapshot.
- Keep the last loaded tree visible when refresh fails, and do not let an older request overwrite a newer load.
- Every category mutation invalidates category pickers and refreshes Categories, ledger lookups, and Overview. Hierarchy-wide hide or restructure mutations must also invalidate transaction-page snapshots.
- Editing changes only hidden state: FQN moves or renames use the hierarchy workflow, and economic intent is fixed when the category is created.
- Use only the API `deletable` signal to enable deletion; the backend owns dependency rules.
- The side panel focuses on open and delegates close focus recovery to its route; its nested delete confirmation returns focus to the panel delete control.

## Boundaries

- Owns: category resource loading, category-specific UI, and mutation refresh fan-out.
- Does not own: route registration or URL state, generic reference or hierarchy UI, generated REST setup, accounting validation, or transaction entry workflows.
