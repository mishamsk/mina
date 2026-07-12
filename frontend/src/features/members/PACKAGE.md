# frontend/src/features/members

## Purpose

- Owns Members reference page resource loading, mutation refresh coordination, and member-specific presentation.

## Implicit Contracts

- Members page loads the bounded household member list through the API, with URL-backed include-hidden state, and filters client-side by name.
- Member mutations refresh Members and ledger lookups.
- Member renames also invalidate transaction page snapshots.
- Member-row deletes own their named confirmation in the page list; side-panel deletes retain their panel-owned confirmation.
- Delete affordances use only the API `deletable` signal; dependent-resource rules remain backend-owned.

## Boundaries

- Owns: Members page resource snapshots, Members screen UI, and member mutation refresh fan-out.
- Does not own: REST endpoint generation, accounting validation, route registration, or transaction entry workflows.

## Testing Notes

- Frontend e2e tests cover Members page rendering and URL-backed search state.
