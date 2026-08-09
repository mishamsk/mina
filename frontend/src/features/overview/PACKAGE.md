# frontend/src/features/overview

## Purpose

- Owns the Overview dashboard resource and presentation.

## Implicit Contracts

- `refreshOverview` is mutation refresh fan-out: it does nothing until Overview has loaded or is loading, so background mutations do not bootstrap dashboard data.
- Keep the last snapshot visible while a replacement request is pending or fails; only the latest request may replace it.
- Group balance rows by account type and FQN root. Featured status changes row order only; group subtotals remain signed current-balance USD aggregates even when a leaf leads with remaining credit.
- Use the shared ledger display semantics and navigate recent rows to Transactions with its `transaction` URL state; Overview does not own transaction detail state. See [web UI design](../../../../../docs/webui-design.md).

## Boundaries

- Owns: Overview snapshot loading, refresh entry point, and dashboard-specific grouping.
- Does not own: `/overview` route and header composition, persisted state, API setup, transaction detail state, or mutation workflows.
