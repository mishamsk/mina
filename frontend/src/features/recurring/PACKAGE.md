# frontend/src/features/recurring

## Purpose

- Owns recurring-definition management, definition lifecycle actions, and the balanced recurring-definition editor.

## Implicit Contracts

- The page lists active definitions in FQN order and refreshes its snapshot after every definition mutation.
- Confirm-next additionally invalidates transaction, account, overview, and featured-balance snapshots because it posts a generated transaction.
- The editor submits complete balanced record shapes only; it uses shared ledger lookups and intent-valid account choices but owns recurring schedule and pause-state controls.

## Boundaries

- Owns: definition table/editor UI, definition action state, and definition snapshot refresh coordination.
- Does not own: REST endpoint generation, recurring schedule semantics, transaction classification, or ledger lookup persistence.

## Testing Notes

- Frontend e2e tests cover seeded definition rendering, create/replace, lifecycle actions, balanced-save gating, row-mapped API errors, cancellation, and confirm-next.
- Transaction-page e2e coverage verifies EXPECTED recurring lines remain available inline.
