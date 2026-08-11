# github.com/mishamsk/mina/internal/services/dataaggregates

## Purpose

- Owns backend-generated aggregate datasets; household flow reporting is its current capability.

## Implicit Contracts

- DuckDB returns presentation-ready periods, stable ranked contributors, filtered totals, conversion disclosure, and selected trends; this service does not aggregate accounting rows.
- Household flow semantics and scope behavior are owned by [`docs/household-flow-reporting.md`](../../../docs/household-flow-reporting.md).
- Entity transaction previews delegate to the transaction service's classified list behavior and remain outside chart filtering.

## Boundaries

- Owns: household-flow scope validation, effective report configuration, local civil-date and anchor alignment, global accounting-history range coordination, and entity preview scope.
- Does not own: SQL, HTTP DTOs, chart rendering, transaction classification, or materialized report state.
