# Plan: Simplify flow reports and add the Overview chart

## Goal

Refocus Category and Tag reports on economic flows that change the household's
tracked position, excluding transfer movement from report values. Pure Category
scopes use net bars, mixed scopes use signed inflow/outflow bars, every chart
shows only the trailing three-month net average, and Overview gains the same
backend-driven mixed-flow visualization.

## Constraints

- Describe this as checkbook-accounting `net flow` or change in tracked
  household position, not exact household net worth.
- Only `expense`, `refund`, `income`, and `clawback` records contribute to
  metrics, ranks, bars, or averages. Transfer movement contributes nothing,
  including when a transfer shape accompanies an economic shape; do not replace
  it with another transfer total or count.
- Preserve Category record attribution, whole-transaction Tag matching,
  hidden-descendant group scope, exact Transactions links, and contextual
  transaction previews. The preview remains a matching-transaction list rather
  than an aggregate and may include matched activity excluded from chart math.
- The backend owns scope configuration, group-purity derivation, signed values,
  calendar buckets, ranks, comparisons, and trailing averages. The browser only
  formats and renders the bounded response plus UI-only breakdown visibility.
- Derive Category-group purity from every active descendant, including hidden
  descendants and descendants without activity in the report window: all
  expense is pure expense, all income is pure income, and both intents is mixed.
  Category leaves follow their declared intent; Tags and the household-wide
  report are always mixed.
- Keep the existing query-time DuckDB approach and narrow report capability. Do
  not add materialized report state, browser-side aggregation, or a generic
  reporting framework.

## Success Criteria

- [x] Category leaves and pure Category groups expose net-spend or net-income
  configuration and net monthly stacks; refunds and clawbacks reduce the
  corresponding bars instead of becoming a second flow series.
- [x] Mixed Category groups, Tags, and the household report expose signed net
  flow: income/refunds are positive inflow, spend/clawbacks are negative
  outflow, and transfer movement is absent.
- [x] Every report chart renders one backend-supplied line: the arithmetic
  average of signed net values from the three preceding calendar months. There
  is no current/core-line option or overlay dropdown, and outflow-dominant
  trailing averages remain below zero.
- [x] Overview renders the shared mixed-flow chart and ranked Category
  breakdown at the top of its content from an explicit unfiltered backend
  dataset; it does not fetch accounting rows or an unused entity transaction
  preview to build the chart.
- [x] Chart hover content and the entity report's `RECENT TRANSACTIONS` heading
  meet the Arcade Cabinet light-surface/dark-ground contrast rules.
- [x] Ground-truth, API, package, and project-state docs describe the simplified
  semantics and shared Overview visualization without calling it exact net
  worth.
- [x] `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-09-flow-report-semantics-and-overview-chart.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the
  worktree clean.

## Tasks

### Task 1: Correct and extend the backend flow-report contract

Update `docs/household-flow-reporting.md` and the Overview section of
`docs/webui-design.md` first so they own the new terminology, pure/mixed rules,
net-bar meaning, transfer exclusion, fixed trailing-average line, and
household-chart placement. Keep the checkbook-accounting caveat aligned with
`docs/checkbook-accounting.md`.

- Replace `total_movement` with signed `net_flow` for mixed scopes. Eliminate
  the transfer bar group and overlay-selection metadata from the public report
  contract while retaining the server-provided monthly metric and trailing
  average needed by top-line comparisons and the fixed line.
- Extend the report service so Category groups resolve descendant intent before
  choosing their configuration. Pure groups retain immediate-child Category
  breakdowns; Category leaves retain account breakdowns; mixed Tags retain
  Category breakdowns.
- Make DuckDB aggregate reportable economic records only. Pure expense/income
  stacks net reversals using that scope's conventional positive orientation;
  mixed stacks preserve positive inflow and negative outflow, while their
  monthly metric and trailing average use the signed sum of both sides.
- Add one read-only household-flow operation to `api/openapi.yaml` and
  `api/client-surfaces.yaml`. It returns the presentation-ready twelve-month
  mixed chart dataset with ranked Category series and no entity scope or
  transaction-preview payload; reuse the entity report's dataset contract
  rather than creating parallel chart semantics.
- Regenerate Go and frontend clients through `just openapi` and
  `just frontend-openapi`, wire the operation through
  `internal/services/dataaggregates`, `internal/store`, `internal/httpapi`, and
  runtime composition, and update their package contracts.
- Expand `internal/apptest/runtime/entity_overview_test.go` at the REST boundary
  to prove expense refunds and income clawbacks net correctly, pure-group
  derivation includes hidden/inactive-in-window descendants, mixed scopes keep
  the correct sign, transfer-only and economic-plus-transfer activity add no
  movement value, the negative trailing-average regression is fixed, and the
  unfiltered household dataset uses the same mixed semantics.
- [x] `just pre-commit`, `just test`, and `just test-integration` pass.
- [x] Commit as `feat(reports): simplify flow overview semantics`.

### Task 2: Reuse the flow visualization on Overview and fix contrast

Refactor `frontend/src/features/entity-overviews` so its chart and breakdown
render from the shared report dataset independently of entity-page top-line and
transaction-preview composition. Consume that presentation component from
`frontend/src/features/overview` with the new household response.

- Render pure scopes as net stacks and mixed scopes as inflow/outflow stacks
  according to backend configuration. Always render the trailing-three-month
  average line and remove route-local overlay state, the selector, and core-line
  chart configuration; breakdown show/hide controls remain UI-only.
- Load the household chart with the existing Overview snapshot, keep prior data
  visible during refresh, and place the chart/breakdown row before balances and
  the existing month pulse/recent activity. A chart-load failure must be
  recoverable without discarding already-loaded Overview sections.
- Give the shared Recharts hover content an Arcade Cabinet-compatible light
  data surface with readable ink text, and explicitly render the entity
  transaction-preview heading with dark-ground foreground text.
- Update the affected frontend package contracts and `PROJECT_STATE.md`.
  Adjust `frontend/tests/e2e/reference-drilldowns.spec.ts` and the Overview e2e
  coverage with small browser smokes for pure/mixed rendering, the fixed line
  with no dropdown, shared Overview placement, readable hover content, the
  transaction heading, responsive ordering, and preserved preview/detail and
  Transactions-link behavior. Leave arithmetic coverage in app tests.
- [x] `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e` pass.
- [x] Commit as `feat(frontend): add the household flow chart`.
