# frontend/src/features/recurring

## Purpose

- Owns the recurring occurrence review page resource loading, mutation refresh coordination, and occurrence-specific presentation.

## Implicit Contracts

- The review page loads only EXPECTED occurrences in scheduled-date ascending order.
- Occurrence mutations refresh the review queue and invalidate ledger snapshots because confirm posts generated EXPECTED records and dismiss marks the occurrence dismissed while tombstoning the generated transaction.
- Definition management stays outside this package.

## Boundaries

- Owns: recurring review UI, occurrence action state, and mutation refresh fan-out.
- Does not own: REST endpoint generation, recurring schedule semantics, transaction classification, or definition create/edit workflows.

## Testing Notes

- Frontend e2e tests cover route rendering, sidebar navigation, occurrence actions, empty state, and confirm error feedback.
- Transaction-page e2e coverage verifies EXPECTED recurring lines remain hidden by default and appear through the explicit Expected posting-status filter.
