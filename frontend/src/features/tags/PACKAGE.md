# frontend/src/features/tags

## Purpose

- Owns Tags reference page resource loading, mutation refresh coordination, and tag-specific presentation.

## Implicit Contracts

- Tags page loads the full tag tree joined with derived group state and filters client-side.
- Tag mutations refresh Tags, ledger lookups, and Overview.
- Bulk tag path mutations also invalidate transaction page snapshots.

## Boundaries

- Owns: Tags page resource snapshots, Tags screen UI, and tag mutation refresh fan-out.
- Does not own: REST endpoint generation, accounting validation, route registration, or transaction entry workflows.

## Testing Notes

- Frontend e2e tests cover Tags page rendering and URL-backed toolbar state.
