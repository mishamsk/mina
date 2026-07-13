# frontend/src/features/status

## Purpose

- Owns Status-page background-operation selection, run browsing, manual starts, and read-only run details.

## Implicit Contracts

- `operation`, `runsPage`, `runsPageSize`, and `run` are the URL-backed selection, pagination, and detail state for operation runs.
- The operation registry owns operation-specific status/manual-start and detail renderers; the selector and runs table remain generic.

## Boundaries

- Owns: Status-specific API composition and operation-run presentation.
- Does not own: generated API setup, shared UI primitives, or operation domain behavior.

## Testing Notes

- Browser coverage lives in `frontend/tests/e2e/status-page.spec.ts`.
