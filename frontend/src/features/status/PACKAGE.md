# frontend/src/features/status

## Purpose

- Owns the Status route's background-operation browser, manual starts, and read-only run details.

## Implicit Contracts

- `operation`, `runsPage`, `runsPageSize`, and `run` are URL-owned state. Changing operation or pagination clears `run`, resets the page when needed, and preserves unrelated query parameters.
- Starting an operation refreshes its operation list, status, and runs, then selects the returned run on the first page.
- Every generated background-operation ID requires an operation-specific module for status, start, and typed detail; the browser and detail frame stay shared, with no generic detail fallback.
- Run rows remain keyboard-activatable and expose the URL-selected run as expanded.

## Boundaries

- Owns: operation-specific API composition and run presentation below the Status route.
- Does not own: the Status route's health cards, global refresh control, or persisted Details preference; generated API setup; shared UI primitives; or operation domain behavior.
