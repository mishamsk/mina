# frontend/src/features/entity-overviews

## Purpose

- Owns the shared household and Category/Tag flow-report presentation plus entity-page composition.

## Implicit Contracts

- Generated REST datasets own every report value, rank, period, series, filtered total, comparison, sign, and selected trend point; the browser only chooses configuration, formats values, and maps the bounded response into chart props.
- Contributor selection is server-applied report configuration. The inline chart deck resets stale selections and disables the previous universe's checklist while a ranked window changes, retains the last successful dataset during refetch and transaction-save refreshes, ignores stale responses, and returns to the last successful configuration after a failed request while preserving that request for Retry.
- The range slider loads global accounting-history bounds separately from the scoped report and falls back to the visible report window with an inline retry when that read fails.
- The selected trend renders on an explicit layer above the stacks; the hover summary leads with that metric and totals, then uses the same magnitude ordering as the stacks. Contributor labels, checkboxes, signs, and tooltips remain sufficient when series colors repeat.
- The fixed preview configures the shared transaction browser/detail presentation without paging, filters, sorting, Edit mode, row actions, or internal scrolling.
- Preview entity-chip actions open Transactions with the fixed report scope retained alongside the activated filter.
- Group transaction links use exact FQN-prefix filters; Category breakdown links use backend-supplied exact-leaf IDs or group FQNs.
- Report semantics are owned by [`docs/household-flow-reporting.md`](../../../../docs/household-flow-reporting.md); page composition is owned by [`docs/webui-design.md`](../../../../docs/webui-design.md).

## Boundaries

- Owns: report control state, report loading, shared flow-chart layout, route-scoped transaction links, and entity preview composition.
- Does not own: accounting aggregation, report configuration, hierarchy inference beyond link target resolution, or transaction mutations.
