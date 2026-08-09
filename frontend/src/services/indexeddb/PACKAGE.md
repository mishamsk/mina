# frontend/src/services/indexeddb

## Purpose

- Owns browser-local UI-state persistence through IndexedDB.

## Implicit Contracts

- Persist only UI state; never REST-derived accounting data or credentials/session material. See [frontend architecture](../../../../docs/frontend-architecture.md#browser-storage).
- Transaction-entry draft writes preserve the `baseline` and `persistBaseline` envelope fields so defaults and sticky values are not mistaken for user input.
- Transaction-entry draft reads may return either an envelope or a bare draft; consumers must handle both.
- Deleting a transaction-entry draft clears only that browser-persisted draft.

## Boundaries

- Owns: IndexedDB connection lifecycle, object-store versioning, and reads/writes.
- Does not own: UI-state shape and hydration policy, REST data, or accounting persistence.
