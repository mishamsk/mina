# frontend/src/features/status

## Purpose

- Owns Status-page background-operation selection, run browsing, manual starts, and read-only run details.

## Implicit Contracts

- `operation`, `runsPage`, `runsPageSize`, and `run` are the URL-backed selection, pagination, and detail state for operation runs.
- The `Record<BackgroundOperationId, OperationModule>` registry uses the generated operation-ID union and owns each concrete status, manual-start, typed-detail calls, and detail renderer; the selector, envelope runs table, and detail frame remain shared.

## Boundaries

- Owns: Status-specific API composition and operation-run presentation.
- Does not own: generated API setup, shared UI primitives, or operation domain behavior.

## Testing Notes

- Browser coverage lives in `frontend/tests/e2e/status-page.spec.ts`.
