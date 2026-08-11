# Plan: Build backend-driven entity drill-down overviews

## Goal

Replace Category and Tag leaf drill-down transaction browsers with one shared,
backend-driven overview that also works for implicit groups. Each report must
present its configured core metric, comparison strip, stacked monthly activity,
interactive breakdown, and fixed transaction preview without deriving report
data in the browser.

## Constraints

- Follow `docs/household-flow-reporting.md`; Category and Tag leaves and groups
  are in scope. Member analytics remain unresolved, and Accounts are separate.
- Report meaning belongs to a narrow backend capability. DuckDB computes every
  aggregate, calendar bucket, rank, comparison, and overlay series; the frontend
  receives a complete bounded dataset and stays presentational.
- Use query-time DuckDB reporting over current accounting state. Do not add
  materialized report state or a generic reporting framework without evidence
  that this report needs it.
- Use Recharts only through the shadcn/ui Chart wrapper. There is no chart-engine
  toggle and no Nivo dependency.
- Start from current production components and contracts. Do not recover or copy
  prototype branches; only their accepted information hierarchy survives in the
  ground-truth docs.
- Keep the full Transactions jump exact for implicit-group scope, including
  hidden active descendants.
- Do not run review-loop.

## Success Criteria

- [ ] Category and Tag leaf and implicit-group REST operations return the shared
  presentation-ready report shape, with server-resolved scope identity,
  configured core metric and breakdown, top-line values, twelve monthly
  buckets, both overlay series, stable top-five-plus-`Other` stacks, conversion
  completeness, and a fixed newest-transaction preview.
- [ ] REST scenarios prove category record attribution, whole-transaction tag
  attribution and deduplication, hidden descendant inclusion, leaf/group
  breakdowns, reversal signs, transfer movement, zero months, current/complete
  period boundaries, three-month averages, month/year comparisons, top-five
  ranking, `Other`, unavailable zero-baseline changes, and unconverted amounts.
- [ ] Category and Tag trees route both leaves and groups to the shared overview;
  the page renders top-line metrics, a breakdown-controlled Recharts graph, and
  a full-width fixed transaction preview while the route page scrolls normally.
- [ ] Breakdown visibility and overlay selection are UI-only state: they change
  rendering without recomputing report values or changing top-line totals.
- [ ] The Transactions action preserves exact leaf or descendant-group scope,
  and transaction rows retain shared detail behavior without preview paging,
  filtering, sorting, Edit mode, or internal scrolling.
- [ ] `PROJECT_STATE.md` and relevant backend/frontend package docs describe the
  implemented capability and its computation/ownership boundaries.
- [ ] `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e` pass.
- [ ] Move this plan to `docs/plans/completed/`, commit the move, and leave the
  worktree clean.

## Tasks

### Task 1: Deliver the backend entity-overview report

Introduce a narrow `internal/services/dataaggregates` read capability rather
than expanding a dictionary service or creating a general report framework.
Its service owns scope validation, date-window and metric meaning, while its
repository contract is implemented by DuckDB queries in `internal/store`.

- Add four explicit read operations to `api/openapi.yaml` for Category leaf,
  Category group, Tag leaf, and Tag group overviews. Reuse one response schema
  whose metadata tells clients the core metric, breakdown dimension, bar groups,
  and stable series identities instead of making clients infer configuration
  from entity type.
- Return decimal values and conversion-completeness metadata consistently with
  existing aggregate contracts. Include the server-computed current-month total,
  trailing-three-complete-month average, last-complete-month MoM/YoY comparisons,
  twelve visible monthly buckets, core and trailing-average overlay points,
  top-five/`Other` series, and fixed preview transactions.
- Resolve the report's local civil date from the runtime clock. Use a DuckDB date
  spine and bounded aggregation/window queries so zero months, lookback data, and
  comparison periods are computed without loading accounting rows into Go.
- Preserve category record-only attribution and tag whole-transaction
  attribution/deduplication. Rank breakdown series over the visible period,
  include hidden active descendants in group scopes, and keep adjustments and
  exchanges identifiable but outside core/bar values.
- Reuse the transaction service's classification/list behavior for preview rows
  rather than duplicating transaction-line derivation. Reuse backend-owned
  effective account labels for account breakdowns.
- Extend transaction listing/filter contracts with exact Category/Tag FQN-prefix
  scope for group deep links; prefix filters include hidden active descendants
  and preserve existing ID-filter behavior for leaves.
- Wire the service/repository/handlers through runtime composition, update
  package contracts, regenerate Go and frontend clients with `just openapi` and
  `just frontend-openapi`, and make the required CLI/MCP exposure decisions.
- [ ] App-boundary REST coverage proves the full shared report contract and exact
  group transaction filtering without store/service-level tests.
- [ ] Run `just pre-commit`, `just test`, and `just test-integration`.
- [ ] Commit as `feat(reports): add entity overview datasets`.

### Task 2: Replace drill-down browsers with the shared report view

Build one Category/Tag overview feature that renders the server response without
accounting aggregation or report-shape inference in TypeScript.

- Add Recharts and the shadcn/ui Chart wrapper under
  `frontend/src/components/ui/chart.tsx`; use the wrapper for semantic tokens,
  accessible chart framing, and shared tooltips, with no visible chart legend.
- Render the full-width top-line strip above a responsive visualization row. Put
  the server-ranked breakdown at 20–30% width beside the chart, move it below the
  graph on small screens, and let its item/all/none controls hide only the
  corresponding server-provided stacks.
- Render grouped stacked bars and the selected server-provided core or
  three-month-average overlay according to response metadata. Keep hover
  tooltips and mixed-currency/unconverted disclosure; do not calculate sums,
  averages, changes, ranks, `Other`, or chart points in the frontend.
- Extract or configure the existing shared transaction-table presentation for a
  fixed read-only preview with transaction detail and the exact Transactions
  action, without copying row semantics or inheriting browser controls/layout.
- Add canonical Category and Tag group routes using FQN-prefix identity, make
  reference-tree group rows navigate to them, and replace the existing leaf
  drill-down browser composition with the same overview feature.
- Update the reference/chart component package contracts and `PROJECT_STATE.md`.
  Keep frontend e2e coverage to a small embedded-browser smoke for a leaf, a
  group, series/overlay controls, responsive stacking, transaction detail, and
  the exact Transactions jump; leave report arithmetic to app tests.
- [ ] The generated-client response is rendered directly apart from value/date
  formatting and UI-only visibility/overlay state.
- [ ] Run `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e`.
- [ ] Commit as `feat(frontend): add entity drill-down overviews`.
