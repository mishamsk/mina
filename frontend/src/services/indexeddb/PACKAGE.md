# frontend/src/services/indexeddb

## Purpose

- Owns IndexedDB opening, versioning, migrations, reads, and writes.

## Implicit Contracts

- IndexedDB stores UI preferences, UI-only caches, and draft UI state only.
- Transaction-entry writes store an envelope with the draft, its initialization baseline, and whether that baseline must persist so default and sticky values do not count as user input.
- Transaction-entry reads return either an envelope or a legacy bare draft; callers handle both representations.
- Accounting data copied from REST responses must never be stored here.

## Boundaries

- Owns: browser IndexedDB side effects and object-store versioning.
- Does not own: Zustand state shape decisions, REST responses, or accounting persistence.

## Testing Notes

- Frontend e2e tests cover persistence through browser reloads.
