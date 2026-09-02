# frontend/src/features/tags

## Purpose

- Owns tag-management presentation, its shared tag-tree snapshot, and mutation refresh coordination.

## Implicit Contracts

- Tag snapshots are keyed by normalized search and hidden visibility; each load follows every server-filtered page in canonical FQN order and derives ancestors only from returned leaves, while group reads supply canonical hidden metadata without creating orphan rows.
- Keep the last loaded tree visible while another key loads or when refresh fails; only the latest load may replace it.
- Every successful tag mutation refreshes the tag tree, ledger lookups, and Overview; path restructuring also invalidates transaction-page snapshots.
- FQN is editable only at creation; move or rename uses the shared hierarchy workflow so a whole subtree moves together.
- The editor initializes from the stored display-label override and sends blank as null so the backend restores the FQN-derived fallback.
- Use the API `deletable` signal for delete affordances; dependency rules remain backend-owned.
- List-delete dismissal returns focus to its opener, while successful list deletion moves focus to the visible search field or compact Controls trigger; the side-panel confirmation restores its delete control.

## Boundaries

- Owns tag-management UI and resource lifecycle, not route URLs, search state, panel launch state, or tag drill-down filtering; those belong to `pages` and the shared reference feature.
- Does not own generated REST setup, accounting validation, hierarchy operations, or transaction-entry workflows.
