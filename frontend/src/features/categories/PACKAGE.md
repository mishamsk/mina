# frontend/src/features/categories

## Purpose

- Owns Categories reference page resource loading, mutation refresh coordination, and category-specific presentation.

## Implicit Contracts

- Categories page loads the full category tree joined with derived group state and filters client-side.
- Category mutations refresh Categories, ledger lookups, Overview, and category picker caches.
- Bulk category mutations also invalidate transaction page snapshots.

## Boundaries

- Owns: Categories page resource snapshots, Categories screen UI, and category mutation refresh fan-out.
- Does not own: REST endpoint generation, accounting validation, route registration, or transaction entry workflows.

## Testing Notes

- Frontend e2e tests cover Categories page rendering and URL-backed toolbar state.
