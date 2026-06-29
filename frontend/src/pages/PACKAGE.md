# frontend/src/pages

## Purpose

- Owns top-level route screens.

## Implicit Contracts

- Pages stay thin and compose lower-level UI, feature, store, service, and API modules.

## Boundaries

- Owns: route screens and route-local state.
- Does not own: generated API setup, shared store modules, or reusable side-effect adapters.

## Testing Notes

- No package-specific testing notes.
