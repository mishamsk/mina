# frontend/src/services/indexeddb

## Purpose

- Owns IndexedDB opening, versioning, migrations, reads, and writes.

## Implicit Contracts

- IndexedDB stores UI preferences, UI-only caches, and draft UI state only.
- Accounting data copied from REST responses must never be stored here.

## Boundaries

- Owns: browser IndexedDB side effects and object-store versioning.
- Does not own: Zustand state shape decisions, REST responses, or accounting persistence.

## Testing Notes

- Frontend e2e tests cover persistence through browser reloads.
