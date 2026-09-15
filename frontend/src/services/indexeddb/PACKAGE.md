# frontend/src/services/indexeddb

## Purpose

- Owns browser-local UI-state persistence through IndexedDB.

## Implicit Contracts

- Persist only UI state; never REST-derived accounting data or credentials/session material. See [frontend architecture](../../../../docs/frontend-architecture.md#browser-storage).
- Transaction-entry draft writes store only `{ draft }`; the draft owns its active tab. Reads accept legacy envelopes and bare drafts without a schema-version change.
- Deleting a transaction-entry draft clears only that browser-persisted draft.
- Status tabs, filters, pagination, and selected details are URL state and are not stored in IndexedDB.

## Boundaries

- Owns: IndexedDB connection lifecycle, object-store versioning, and reads/writes.
- Does not own: UI-state shape and hydration policy, REST data, or accounting persistence.
