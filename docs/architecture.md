# Mina Architecture

- Keep this file short. It is a map and a home for hard design rules.
- Keep it evergreen. Do not describe old designs, migrations, or history.
- Put schema details in `docs/phase-1-data-model.md`.

## What Mina Is

Mina is a local-first personal finance system for one household.

The active scope is Phase 1 Stage 1:

- Go application.
- One `cmd/mina` binary.
- REST API only.
- No TUI or web UI implementation.
- Portable accounting state in one local DuckDB database file.

## Core Terms

- Database file: portable accounting state. It must be usable without local config.
- Local config: operational settings such as default database path, host, and port.
- Service package: app-owned domain types, validation, use cases, and repository interfaces.
- Store: DuckDB open/migrate/query code and repository implementations.
- HTTP API: REST/OpenAPI adapter, HTTP request/response mapping, and status mapping.
- Runtime: in-process composition of config, database handles, stores, services, HTTP adapters, and listeners.
- Boundary scenario test: test that drives public behavior through an app or CLI/API boundary.

## Where To Look

- Product scope: `docs/business-requirements.md`.
- Phase 1 data model: `docs/phase-1-data-model.md`.
- Current implementation inventory: `PROJECT_STATE.md`.
- Running work checklist template: `docs/running_todo_template.md`.

## Package Boundaries

Imports and runtime knowledge flow inward toward app-owned service packages. Composition may import every layer.

- `cmd/mina`: one binary and Cobra command tree. Cobra owns CLI parsing and command help. Do not add a new hand-rolled flag parser.
- `internal/runtime`: config, open/create/migrate policy, and manual composition root.
- `internal/httpapi`: REST/OpenAPI adapter, generated REST contract code if colocated, HTTP DTO mapping, route registration, request parsing, and HTTP status/error mapping.
- App-owned service packages: domain types, validation, use cases, and repository interfaces for Stage 1 capabilities.
- `internal/store`: DuckDB driver access, migrations, transactions, query code, and repository implementations.
- Future adapters such as `internal/tui` and `internal/background`: added only when their stages require them.

Rules:

- Service packages must not import HTTP, OpenAPI, TUI, scheduler, SQL, generated DB, Cobra, process I/O, or runtime composition packages.
- Service packages own domain validation and use-case decisions.
- `internal/httpapi` calls services and maps transport DTOs. It does not open databases, parse CLI flags, own SQL, or make domain decisions.
- `internal/store` owns DB-facing row types, generated query code if used, migrations, transactions, DuckDB-specific error mapping, and app-to-DB type conversion.
- `internal/store` does not know HTTP, OpenAPI, Cobra, or runtime composition.
- `internal/runtime` wires concrete implementations manually. Avoid hidden global state for database handles, config, clocks, listeners, or services.
- Shared contracts belong at the lowest layer that can own them.

## Persistent State

- Accounting state lives in one DuckDB database file.
- DuckDB is the required persistent database engine.
- DuckDB SQL is the schema and query dialect.
- `docs/phase-1-data-model.md` is the source of truth for persistent tables, column types, generated columns, enum values, sequence use, arrays, timestamps, dates, and decimal precision.
- Local config is operational state only.
- Config must not be required to interpret the accounting database.
- The selected database path comes from explicit CLI input or local config.
- Operational caches, if added, must be rebuildable and reside outside the portable accounting state unless explicitly documented.
- Exports are explicit user actions.

## REST API

- The REST API is the product boundary for Phase 1 Stage 1.
- Every Stage 1 capability must be available through the API.
- API errors are stable, machine-readable JSON.
- Dynamic filters, sort keys, and field names must come from typed allowlists.
- User-provided values in SQL must use parameter binding.
- Hidden accounts, categories, and tags are excluded by default and included only by explicit query.

## Database

- Migrations are versioned and upgrade-only.
- The database stores its schema version.
- Database open/create/migrate policy belongs to `internal/runtime`.
- DuckDB open, migration, query, and transaction code belongs to `internal/store`.
- Query helpers operate on provided database handles.
- Database transactions wrap multi-row domain changes.
- Double-entry transactions must be persisted atomically.

## Hard Rules

- No UI work in Phase 1 Stage 1.
- No hand-rolled CLI parser; use Cobra and pflag through `cmd/mina`.
- No hidden global state for database handles, config, clocks, listeners, or services.
- No direct SQL in HTTP adapters, runtime composition, or service packages.
- No HTTP concerns in store or service packages.
- No domain validation hidden in transport mapping.
- No string-built SQL with user input.
- No reporting features in Phase 1 Stage 1 unless scope changes.
- Keep abstractions narrow. Add interfaces only at real boundaries.
- Keep docs short. Do not duplicate the data model or endpoint catalog here.

## Testing

Mina tests behavior at boundaries. Do not build a unit-test suite around private helpers.

- Most tests are boundary scenario tests.
- About 90% of tests should run in memory.
- In-memory tests construct typed API requests through a test client and send them into the app pipeline.
- In-memory tests should use a fresh temporary database or isolated in-memory database.
- Scenario shape: perform an action, then read through another public path and assert persisted behavior.
- Example: add a transaction, then list transactions and verify it is returned.
- Do not mock controllers, services, or stores for normal behavior tests.
- Keep a small number of true process tests.
- True process tests cover CLI behavior and real JSON REST behavior.
- True process tests are not required on every commit.
- Run true process tests before release work and after risky CLI/server/JSON changes.
