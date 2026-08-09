# frontend/src/features/tags

## Purpose

- Owns tag-management presentation, its shared tag-tree snapshot, and mutation refresh coordination.

## Implicit Contracts

- Load the complete hidden-inclusive tag tree and group state before filtering locally, so hierarchy and the include-hidden control remain consistent.
- Keep the last loaded tree visible when a refresh fails; only the latest load may replace it.
- Every successful tag mutation refreshes the tag tree, ledger lookups, and Overview; path restructuring also invalidates transaction-page snapshots.
- FQN is editable only at creation; move or rename uses the shared hierarchy workflow so a whole subtree moves together.
- Use the API `deletable` signal for delete affordances; dependency rules remain backend-owned.
- List-delete dismissal returns focus to its opener, while successful list deletion moves focus to the search field; the side-panel confirmation restores its delete control.

## Boundaries

- Owns tag-management UI and resource lifecycle, not route URLs, search state, panel launch state, or tag drill-down filtering; those belong to `pages` and the shared reference feature.
- Does not own generated REST setup, accounting validation, hierarchy operations, or transaction-entry workflows.
