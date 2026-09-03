# github.com/mishamsk/mina/internal/services/operationruns

## Purpose

- Owns background-operation run observability and lifecycle recording.

## Implicit Contracts

- The closed operation registry controls discovery and accepted run-list filters; registering work with a runner alone does not make it observable here.
- Runs are app-local disposable runtime state. The repository assigns numeric IDs at creation, so they are not portable accounting identifiers.
- Manual starts require runtime to connect the service to the background runner; without that connection, the service rejects the request rather than executing work itself.
- Status summaries exclude active runs from the latest-result fields, run count, and completed-run revision; an active run affects only the `running`/`idle` state.
- Status schedules retain their execution basis: configurable operation schedules are UTC, while recurring catch-up reports its fixed server-local schedule.
- A concrete operation's run lookup returns not found for a run belonging to another operation.
- The closed registry contains exchange-rate loading, database backup, API audit-log compaction, and recurring catch-up, each with concrete status and typed run projections.

## Boundaries

- Owns: operation IDs, run lifecycle projections and transitions, validation, and repository/runner-trigger contracts.
- Does not own: operation execution, scheduling, overlap guards, retries, persistence implementation, HTTP mapping, or runtime composition.
