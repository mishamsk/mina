# frontend/src/features/members

## Purpose

- Owns member-reference list and editor behavior, its resource lifecycle, and mutation refresh coordination.

## Implicit Contracts

- Member snapshots are keyed by normalized search and hidden visibility; each load follows every server-filtered page in canonical name order without browser substring matching.
- Keep the last loaded member list visible while a different key loads, and retain the matching snapshot with a refresh error instead of replacing it with an error screen; late responses cannot replace a newer request.
- Every successful member mutation refreshes the member list and ledger lookups; a rename also invalidates transaction snapshots so cached member labels cannot persist.
- Creating a hidden member is a create followed by a hidden-state update; if the second request fails, refresh the list before reporting the partial failure.
- Delete affordances trust only the API `deletable` signal; dependency rules remain backend-owned.
- The full-page member list uses a name column plus a narrow trailing actions column; compact shells scroll the document and fold the action cluster into overflow when it cannot fit, and removing a focused row by hiding or deletion restores focus to the visible search field or compact Controls trigger.
- The editor moves focus into its panel, defers Escape to an open confirmation dialog, and cannot close while saving; callers restore focus to the panel opener after close.

## Boundaries

- Owns the members list, editor, and feature-level resource refreshes.
- Pages own route registration, URL mutation, and panel opener recovery; Reference owns the shared toolbar and drill-down UI; Ledger owns lookup and transaction caches.
- Does not own REST endpoint setup, accounting validation, or transaction entry workflows.
