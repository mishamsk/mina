# Plan: Make household flow reporting configurable and evergreen

## Goal

Turn the fixed household, Category, and Tag flow visualization into one
backend-owned configurable report, while separating report semantics from page
layout documentation. Users can choose the breakdown, time grain and range,
series count, contributor filters, and trend; every exposed level retains the
same accounting meaning, totals, and interaction model.

## Constraints

- Keep `docs/household-flow-reporting.md` as the sole semantic ground truth and
  keep all affected package, API, project-state, and ground-truth docs as
  concise present-tense descriptions of the final system. Do not preserve
  review history, migration notes, old names, or duplicate report semantics in
  layout docs.
- Keep household-flow attribution and exclusions unchanged: Category scopes use
  matching categorized records, Tag scopes match whole transactions, hidden
  active descendants remain included, and transfer, adjustment, and exchange
  movement remains outside flow metrics.
- Use `internal/services/dataaggregates` as the application boundary for
  backend-generated aggregate datasets, with household flow reporting as its
  first capability. Do not add materialized report state, browser-side
  accounting aggregation, or a generic reporting framework.
- The existing scope-level top-line cards remain whole-scope summaries.
  Contributor filtering changes the chart's stacks, bucket totals, conversion
  disclosure, and selected trend only; it does not change the transaction
  preview, Transactions link, or top-line cards.
- Rolling average uses the three complete buckets before each plotted bucket.
  Rolling sum is range-to-date: each point sums from the first visible bucket
  through that bucket, so its final point is the total for the entire selected
  range. Month view defaults to rolling average; year view defaults to rolling
  sum.
- `values.Decimal`/`DECIMAL(18,8)` is the system-wide application and database
  precision limit, including aggregates and percentages. Domain and persistence
  code must not widen values or represent decimals as strings to accommodate
  overflow. Decimal text is allowed only at transport or other explicit text
  parsing/rendering boundaries; out-of-range computation fails instead of being
  rounded, clamped, or widened.
- Preserve the existing high-contrast trend styling and explicit paint order
  above the bars. An arbitrary requested breakdown count must not reintroduce a
  fixed six-series data assumption or make color the only means of identifying
  a series.
- Preserve the fixed entity transaction preview and exact leaf/group
  Transactions links. Household reporting still has no preview.

## Success Criteria

- [x] `docs/household-flow-reporting.md` is the sole semantic ground truth for
  household flow reporting across Household, Category, and Tag scopes. It
  includes a `Members` subsection stating that Member flow reporting is not yet
  specified and therefore is not implemented; all backlinks use the new name.
- [x] Category and Tag leaf/group page composition and responsive layout are
  owned only by `docs/webui-design.md`; the reporting doc contains attribution,
  configuration, metric, period, filtering, and accounting semantics without
  page-layout coupling.
- [x] Every household-flow operation accepts the same typed report
  configuration. Breakdown is selectable between Accounts and Categories,
  with the documented per-scope table defining defaults and Categories invalid
  for Category leaves. Omitted parameters preserve those defaults.
- [x] Month grain returns 6–24 calendar buckets and defaults to 12. Year grain
  returns any requested integer count from 3 upward or the complete scoped
  history and defaults to 6; current partial buckets and zero-activity buckets
  remain explicit and period ordering is oldest first.
- [x] The named-series count defaults to 5 and accepts every integer at least 5
  with no product maximum. Contributors are ranked over the selected visible
  period, the requested count remains stable while filtering, and all remaining
  contributors roll into `Other`.
- [x] Breakdown items, including `Other`, are server-applied report filters.
  Filtering preserves stable series identities and recomputes stacks,
  per-bucket totals, unconverted counts, rolling average, and range-to-date
  rolling sum from the retained contributors; all/none behavior is honest, and
  changing the dimension, grain, range, or named-series count resets stale
  selections.
- [x] Every chart exposes one trend selector. Rolling average is the default for
  month grain and uses the three preceding complete buckets. Rolling sum is the
  default for year grain and cumulatively covers the entire selected range; it
  never uses a fixed three-bucket window. The backend supplies the selected line
  without browser-side report math.
- [x] Every Household, Category, and Tag chart tooltip leads with
  backend-supplied totals for the active filters: one Net total for pure scopes,
  or Total inflow and Total outflow for mixed scopes, followed by the visible
  per-series breakdown.
- [x] Flow-report service/store values use `values.Decimal` and DuckDB
  `DECIMAL(18,8)` throughout. OpenAPI decimal bounds match that precision,
  report-only widening accommodations are gone, and
  overflow returns an error without lossy fallback.
- [x] `docs/architecture.md` and `docs/data-model.md` state the system-wide
  decimal limit, and
  `docs/agents/review/reviewer-prompts/simplification.md` explicitly flags
  internal string-backed decimals and attempts to exceed `DECIMAL(18,8)`.
- [x] Shared UI controls work on Overview and every Category/Tag leaf/group
  page, keep prior report data visible during refetch, expose why Categories is
  disabled on Category leaves, and retain responsive, accessible,
  theme-compatible chart behavior for empty, sparse, filtered, and expanded
  reports.
- [x] The service and composition dependency are named `dataaggregates`, with
  no retired entity-overview service package. The package contract
  uses the renamed semantic doc, describes ownership of backend-generated
  aggregate datasets without speculative abstractions, and has no Testing Notes
  section. Other relevant package contracts and `PROJECT_STATE.md` describe the
  final configurable report without implementation history.
- [x] App-boundary REST tests cover parameter defaults and invalid combinations,
  both grains and range boundaries, complete history, both breakdowns, ranking
  and `Other`, filter-driven total/trend recalculation, universal tooltip-total
  data, decimal precision, and overflow failure without duplicating store or
  service internals.
- [x] `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e` pass.
- [x] From a clean worktree, run
  `just review-loop --plan "docs/plans/2026-08-09-configurable-household-flow-reporting.md"`
  once, resolve its findings, and rerun affected validation. Do not run
  review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the
  worktree clean.

## Tasks

### Task 1: Establish evergreen report, layout, and precision contracts

Rename and refocus the semantic document around household flow reporting at
different scopes. Keep the default core metric and breakdown table, add the
Members boundary, and replace its fixed month/rank/visibility/line rules with
the configurable final behavior above. Move only Category/Tag page composition,
responsive visualization placement, and fixed-preview layout into
`docs/webui-design.md`; keep the Overview placement there as well.

- Update every backlink, including active package docs and completed plan links,
  so the retired semantic-document name has no stale reference.
- Add the `DECIMAL(18,8)` hard limit to `docs/architecture.md` and align
  `docs/data-model.md` and the simplification reviewer prompt. Make the
  transport-only decimal-string exception explicit so reviewers do not demand
  imprecise JSON numbers.
- Define `internal/services/dataaggregates` as the owner of backend-generated
  aggregate datasets and household flow as its current capability; remove
  entity-overview service terminology without promising or designing future
  report types.
- Remove stale fixed-report statements rather than layering exceptions onto
  them. Do not change `VISION.md` or use documentation as a future-work ledger.
- [x] The owning docs specify every default, range, invalid combination, trend
  window, filter effect, universal tooltip total, and Members boundary needed
  to implement the remaining tasks without consulting this review feedback.
- [x] Commit as `docs(reports): define configurable household flow reporting`.

### Task 2: Generalize the backend-owned report contract

Extend all five existing report operations in `api/openapi.yaml`—Household,
Category leaf/group, and Tag leaf/group—with one shared typed configuration and
validation model. Evolve the fixed monthly response into a grain-neutral period
dataset that echoes the effective configuration and carries stable contributor
identity, stacks, group totals, conversion disclosure, and the selected trend.

- Move the existing service capability to `internal/services/dataaggregates`
  and rename its exported service, dependency wiring, and package contract to
  match. Resolve scope defaults and invalid combinations there; Category leaves
  reject a Categories breakdown, while other scopes allow either dimension.
  Keep query parameter mapping and error translation thin in `internal/httpapi`.
- Generalize `internal/store/entity_overviews.go` calendar spines, visible
  windows, ranking, contributor mapping, three-prior-period average math, and
  range-to-date cumulative sums for month and year grain. Rank before applying
  contributor exclusions so toggles cannot pull a new contributor into the
  named cohort; map `Other` consistently and parameter-bind every
  selected/excluded identity.
- Keep chart filters separate from scope attribution and top-line/preview
  queries. Return zeros for a fully filtered chart while retaining the complete
  requested period spine.
- Replace report string decimals and every widened report cast with
  `values.Decimal` and `DECIMAL(18,8)`, reuse the store's canonical DuckDB
  conversion, narrow affected OpenAPI bounds, and audit other aggregate
  contracts for inconsistent widened bounds. Treat arithmetic overflow as a
  report error.
- Regenerate Go, TypeScript, CLI, and MCP surfaces through the repository-owned
  `just` recipes, preserve existing exposure decisions in
  `api/client-surfaces.yaml`, document exported cross-package APIs, and update
  every touched package contract with the `write-package-docs` skill.
- Expand `internal/apptest/runtime/entity_overview_test.go` through the generated
  REST client. Cover the configuration and arithmetic matrix at the app
  boundary; do not add unit, store, service, or SQL-coupled tests.
- [x] `just pre-commit`, `just test`, and `just test-integration` pass.
- [x] Commit as `feat(reports): add configurable flow periods and trends`.

### Task 3: Expose shared report controls and filtered totals

Update the shared `frontend/src/features/entity-overviews` presentation and the
Overview resource to send the selected configuration to the backend and render
the returned period dataset directly. Add shared controls for breakdown
dimension, month/year grain, lookback, named-series count, and trend metric;
the breakdown checkboxes and all/none actions now update server-applied filters
instead of only hiding Recharts series.

- Use server-echoed defaults to initialize controls. Reset contributor filters
  when a selection changes the ranked universe, retain them when only toggling
  contributors, cancel or ignore stale responses, and keep the last successful
  dataset visible with recoverable error feedback during refetch.
- Disable Categories in the breakdown dropdown on Category leaves with an
  accessible explanation. Offer 6–24 month choices, year counts from 3 upward
  plus Entire history, a minimum-5 named-series control without a fixed maximum,
  and both trend choices with grain-specific defaults.
- Render grain-aware labels and one server-selected trend line above every bar.
  Remove fixed `months`, twelve-bucket, top-six, and six-color indexing
  assumptions; keep labels, checkboxes, tooltips, and signs sufficient when
  visual colors repeat.
- Lead every pure and mixed tooltip with the returned filtered totals before the
  visible stacks. Preserve Category-breakdown navigation, fixed previews, exact
  Transactions links, responsive order, local-first behavior, and current
  contrast/layering.
- Update affected frontend package contracts with the `write-package-docs`
  skill and update `PROJECT_STATE.md`. Adjust
  `frontend/tests/e2e/overview-page.spec.ts` and split Category/Tag report browser
  coverage if needed to keep every spec below 25 tests; leave arithmetic
  assertions in app tests.
- [x] Browser coverage proves defaults, option changes and request wiring,
  disabled leaf-category choice, filtered totals/trend refresh, both trend
  defaults, arbitrary series counts, Entire history, universal tooltip totals,
  preserved data on failure, and unchanged preview/navigation behavior.
- [x] `just pre-commit`, `just test`, `just test-integration`, and
  `just test-frontend-e2e` pass.
- [x] Commit as `feat(frontend): add flow report controls`.
