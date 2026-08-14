# frontend/src/features/overview

## Purpose

- Owns the Overview dashboard resource and presentation.

## Implicit Contracts

- `refreshOverview` is mutation refresh fan-out: it does nothing until Overview has loaded or is loading, so background mutations do not bootstrap dashboard data.
- Keep the last snapshot visible while a replacement request is pending or fails; only the latest request may replace it.
- Load the default household flow dataset with the initial snapshot; only the latest configured reload updates the cached dataset so mutation refreshes retain the server-echoed selection, preserve prior chart data, and surface recoverable chart-only errors.
- Initial skeletons mirror loaded content: household flow reserves the complete top-line, inline-controlled visualization, and contributor-status footprint, while each balance placeholder uses the ordinary single-standing row shape.
- Follow the [balance display rules](../../../../../docs/webui-design.md#balances), then group rendered accounts by type and FQN root. Headers count only rendered account rows. Featured status changes account order only; group subtotals and unconverted counts include every server-provided balance row even when no native standing remains, and subtotals use signed current-balance USD values rather than remaining credit.
- Render the shared household top-line summaries and flow visualization before balances and the pulse/recent-activity row.
- Recent activity uses the transaction browser's initiated-date-descending default order.
- Use server-derived display titles for recent activity and the shared ledger display semantics; navigate recent rows to Transactions with its `transaction` URL state. Overview does not own transaction detail state. See [web UI design](../../../../../docs/webui-design.md).

## Boundaries

- Owns: Overview snapshot loading, refresh entry point, and dashboard-specific grouping.
- Does not own: `/overview` route and header composition, persisted state, API setup, transaction detail state, or mutation workflows.
