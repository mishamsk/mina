# Background Operations Pattern

## Standard

Background work is modeled as an observable in-process operation.

Runtime wires operations. A background runner triggers them. Services own domain behavior. Providers own external API access. Store persists operation-run status. Execution is not durable; observability is durable for the duration of app (in memory store).

## Package Structure

- `internal/background`
  - Owns operation runner, schedules, no-overlap guards, backoff, trigger handling, and operation registration.
  - Uses `github.com/robfig/cron/v3` for calendar schedules.
  - Uses `github.com/cenkalti/backoff/v5` for retry backoff.

- `internal/providers`
  - Owns external provider clients and DTO mapping.
  - Examples: `internal/providers/plaid`, `internal/providers/exchangerates`.
  - Provider packages may use network clients and provider SDKs.
  - Provider packages do not import `internal/store`, `internal/httpapi`, `cmd/mina`, or `internal/runtime`.

- `internal/services/operationruns`
  - Owns operation-run domain types, status transitions, validation, listing, and repository contracts.
  - Exposes use cases for creating runs, marking completion, recording failure, recording skips, and canceling runs.

- Existing `internal/services/*`
  - Own domain behavior invoked by operations.
  - Examples: Plaid import service, exchange-rate service, cached-view service, backup/archive service.

- `internal/store`
  - Implements operation-run persistence.
  - Implements any domain repositories required by operation use cases.
  - Owns DuckDB-specific SQL and migration details.

- `internal/runtime`
  - Wires provider clients, operation services, domain services, stores, schedules, and the background runner.
  - Starts and stops the runner as part of app lifecycle.

- `cmd/mina`
  - Delegates serve behavior to runtime.
  - Does not import services, providers, store, or background packages directly.

## Operation Model

Uses a registered operation for each background workflow (examples):

- `plaid.load`
- `exchange_rates.fetch`
- `cached_views.refresh`
- `backup.create`
- `archive.create`

Each operation has:

- `Name`: stable operation identifier.
- `Key`: no-overlap key.
- Optional `schedule`
- Optional trigger on `startup`
- `Run(ctx, input)`: operation body.
- `Schedule`: cron expression for scheduled operations.
- `Backoff`: retry policy.
- `Timeout`: max run duration.
- `Concurrency`: explicit keyed no-overlap behavior.

## Run Statuses

Persist every operation execution attempt.

Statuses:

- `running`
- `succeeded`
- `failed`
- `skipped`
- `canceled`
- `abandoned`

Startup behavior:

- Runtime starts the background runner after app composition and migrations.
- `abandoned` is reserved for a future durable operation store and is not needed for in-memory-only operation status recovery.

## Error Classification

Operations return classified errors:

- `transient`: retry with backoff.
- `permanent`: mark failed without retry.
- `canceled`: mark canceled.
- `already_running`: mark skipped.
- `already_done`: mark succeeded with summary.

Domain idempotency belongs in services. No-overlap belongs in the background runner.

## Examples

### Exchange-Rate Fetch

- `internal/background` schedules `exchange_rates.fetch`.
- `internal/services/exchangerates` fetches rates through provider, validates and creates or updates rates.

## Depguard / Deplint Updates

Update `.golangci.yml` depguard rules.

Service boundary rules:

- Continue denying scheduler, HTTP, runtime, store, SQL, Cobra, pflag, process I/O.
- Add denial for `github.com/robfig/cron/v3`.
- Add denial for `github.com/cenkalti/backoff/v5`.
- Add denial for `github.com/mishamsk/mina/internal/background`.

Runtime composition rules:

- Runtime may import `internal/background`.

Command boundary rules:

- `cmd/mina` must not import `internal/background`.

## Documentation Updates

Update `docs/architecture.md`:

- Add `internal/background` as the app-owned operation runner layer.
- State that background operations trigger services and do not own domain behavior.
- State that operation-run status is persisted for observability but only in-memory and are not persisted to disk, while execution is in-process and non-durable.
- State that runtime wires background operations, providers, services, and store implementations.

Add package docs:

- `internal/background/PACKAGE.md`

Update `PROJECT_STATE.md` only when implemented behavior becomes available.

## Implementation Todo

- [x] Move runner, schedule, trigger, retry, timeout, and no-overlap behavior into `internal/background`.
- [x] Add or align the operation-run service package with this model's status transitions and repository contracts.
- [x] Persist every run attempt through store-owned in-memory system schema rows.
- [x] Keep domain behavior in app-owned services; operation bodies call services and provider-bound interfaces.
- [x] Use `github.com/robfig/cron/v3` and `github.com/cenkalti/backoff/v5` only at the background runner boundary.
- [x] Keep runtime as the composition and lifecycle owner for background operations.
- [x] Keep `cmd/mina`, HTTP adapters, store, and services inside their documented import boundaries.
- [x] Expose operation observability through service-owned use cases and REST adapters.
- [x] Update depguard, `docs/architecture.md`, package docs, and required verification.
- [x] Implement exchange-rate loading as the reference operation.
