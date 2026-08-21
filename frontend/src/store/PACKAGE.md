# frontend/src/store

## Purpose

- Owns Zustand UI state, transient resource snapshots, and browser-state bootstrap.

## Implicit Contracts

- Bootstrap installs protected-request invalidation before loading authentication, then settles UI persistence before the app shell replaces its splash state; failure becomes bootstrap state rather than preventing the shell from mounting.
- Authentication generation rejects late status and logout completions so an older request cannot restore a superseded session state.
- Preference writes update memory first; an IndexedDB failure leaves that value active and records the persistence error.
- A background transaction-page refresh replaces its snapshot only when it still matches the snapshot captured at refresh start; other loaded pages remain stale until their owner refetches them.
- Recurring-definition invalidation replaces loaded page identities and marks them stale without discarding their transaction snapshots; inline snapshot updates preserve that staleness until the owning resource refreshes after catch-up.
- Transaction-page cache identity includes server sort field and direction so differently ordered pages never share snapshots.
- Category-page snapshot identity and request state include normalized economic intent; restoring its loaded key clears another key's transient request state.
- Account transaction fetches write only while their entry remains loading; mutation responses seed the cache independently so invalidation rejects older fetches.
- Transaction-entry route results apply only to their exact requested entry. An entry launch waits for Edit-mode amount saves to succeed, and cancellation or any failed save discards the deferred launch; its optional opener is transient focus-restoration state, and a shape-changing inline conflict may carry its transient amount and matching record IDs into an Advanced edit launch.
- Route-independent template and recurring-definition editor launches retain their opener and source defaults only in transient memory; an open recurring editor rejects replacement launches, and closing it clears its one-use payload.
- Overview snapshots keep the backend household flow dataset and its recoverable section error beside balance, pulse, and recent-activity data.
- Shareable Status state stays in the route URL and has no Zustand persistence lifecycle.

## Boundaries

- Owns browser-local state and the state-side of transient resource caching. Feature resource controllers own API loading and mutation invalidation fan-out; accounting data remains backend-owned. See [frontend architecture](../../../docs/frontend-architecture.md).
- The app shell owns `entry` URL/history synchronization and route fetching; this package represents the requested entry and guards its result.
- IndexedDB services own database opening, schema/versioning, and storage access; this package chooses only the UI state to hydrate or persist.
