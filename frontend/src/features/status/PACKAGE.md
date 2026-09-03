# frontend/src/features/status

## Purpose

- Owns the Status route's background-operation browser, manual starts, read-only run details, and portable API audit-history browser.

## Implicit Contracts

- `operation`, `runsPage`, `runsPageSize`, and `run` are URL-owned state. Changing operation or pagination clears `run`, resets the page when needed, and preserves unrelated query parameters.
- Starting an operation refreshes its operation list, status, and runs, then selects the returned run on the first page.
- A manual start that finishes after Background operations unmounts does not update route state.
- Every generated background-operation ID requires an operation-specific module for status, start, and typed detail; the browser and detail frame stay shared, with no generic detail fallback.
- The complete module registry presents exchange-rate loading, database backup, API audit-log compaction, and recurring catch-up through the same operation browser while preserving each schedule's UTC or server-local basis.
- Run rows remain keyboard-activatable and expose the URL-selected run as expanded.
- `auditMethod`, `auditOperation`, `auditSurface`, `auditPage`, `auditPageSize`, and `auditEntry` are URL-owned state. Filter or pagination changes clear the selected entry, and audit rows stay newest-first and backend-paginated.
- The operation-filter draft follows URL history changes while retaining unapplied typing until navigation or submission.
- Same-page audit refetch failures retain the last successful rows and total count; failed filter or page changes expose no mismatched snapshot, and skeleton rows are reserved for the initial load.
- Completed non-`GET` browser requests refresh the mounted audit browser so mutations from global UI surfaces become visible in place.
- Audit pages beyond the server-reported range replace-navigate to the last available page and clear an unavailable selection.
- A URL-selected audit entry absent from the loaded page renders an unavailable state instead of silently removing detail.
- The active Status browser contributes its filters and pagination to the shared compact Controls surface; compact audit filters stack within that overlay, compact cards drop padding vacated by relocated controls, the Background operations title and primary Run now action remain inline, and audit rows relinquish their sticky internal viewport while roomy geometry stays bounded.

## Boundaries

- Owns: operation-specific API composition, run presentation, and audit list/filter/detail presentation below the Status route.
- Does not own: the Status route's health cards, tab selection, or global refresh control; generated API setup; shared UI primitives; or operation and audit domain behavior.
