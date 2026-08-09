# frontend/src/features/members

## Purpose

- Owns member-reference list and editor behavior, its resource lifecycle, and mutation refresh coordination.

## Implicit Contracts

- Show a list snapshot only when its `includeHidden` value matches the current URL state; retain that matching snapshot with a refresh error instead of replacing it with an error screen.
- Every successful member mutation refreshes the member list and ledger lookups; a rename also invalidates transaction snapshots so cached member labels cannot persist.
- Creating a hidden member is a create followed by a hidden-state update; if the second request fails, refresh the list before reporting the partial failure.
- Delete affordances trust only the API `deletable` signal; dependency rules remain backend-owned.
- The editor moves focus into its panel, defers Escape to an open confirmation dialog, and cannot close while saving; callers restore focus to the panel opener after close.

## Boundaries

- Owns the members list, editor, and feature-level resource refreshes.
- Pages own route registration, URL mutation, and panel opener recovery; Reference owns the shared toolbar and drill-down UI; Ledger owns lookup and transaction caches.
- Does not own REST endpoint setup, accounting validation, or transaction entry workflows.
