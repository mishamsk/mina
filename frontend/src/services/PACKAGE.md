# frontend/src/services

## Purpose

- Owns browser side-effect adapters.

## Implicit Contracts

- Browser persistence must not store accounting data copied from REST responses.
- IndexedDB persistence is limited to UI preferences, UI-only caches, and draft UI state.

## Boundaries

- Owns: adapters for browser APIs such as IndexedDB.
- Does not own: generated REST calls, Zustand stores, or domain validation.

## Testing Notes

- No package-specific testing notes.
