# frontend/src/features/overview

## Purpose

- Owns Overview resource loading, derived view data, and dashboard sections.

## Implicit Contracts

- `refreshOverview` refetches only after an Overview snapshot exists or is already loading.
- Overview balance groups sort featured accounts first within each FQN root.

## Boundaries

- Owns: Overview resource snapshot loading, route-ready dashboard composition, and Overview-specific presentation.
- Does not own: Route headers, app shell navigation, or ledger mutation workflows.

## Testing Notes

- No package-specific testing notes.
