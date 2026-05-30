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

## Package Boundaries

Imports and runtime knowledge flow inward toward app-owned service packages. Composition may import every layer.

- `cmd/mina`: one binary and Cobra command tree. Cobra owns CLI parsing and command help. Do not add a new hand-rolled flag parser.
- `internal/runtime`: config, open/create/migrate policy, and manual composition root.
- `internal/httpapi`: REST/OpenAPI adapter, generated REST contract code if colocated, generated route registration, generated request binding, OpenAPI request validation for transport shape, HTTP DTO mapping, and HTTP status/error mapping.
- App-owned service packages: domain types, validation, use cases, and repository interfaces for Stage 1 capabilities.
- `internal/store`: DuckDB driver access, migrations, transactions, query code, and repository implementations.
- Future adapters such as `internal/tui` and `internal/background`: added only when their stages require them.

Rules:

- Service packages must not import HTTP, OpenAPI, TUI, scheduler, SQL, generated DB, Cobra, process I/O, or runtime composition packages.
- Service packages own domain validation and use-case decisions.
- `internal/httpapi` calls services and maps generated OpenAPI request/response DTOs. Strict-server implementations map generated OpenAPI request objects to service inputs, call services, and map service outputs, errors, and statuses to generated OpenAPI response objects.
- `internal/httpapi` does not open databases, parse CLI flags, own SQL, make domain decisions, or duplicate service-owned domain validation.
- `internal/store` owns DB-facing row types, generated query code if used, migrations, transactions, DuckDB-specific error mapping, and app-to-DB type conversion.
- `internal/store` does not know HTTP, OpenAPI, Cobra, or runtime composition.
- `internal/runtime` wires concrete implementations manually. Avoid hidden global state for database handles, config, clocks, listeners, or services.
- Shared contracts belong at the lowest layer that can own them.

## Persistent State

- The app opens an in-memory DuckDB database first.
- When a database file is provided, the app attaches it as the portable accounting-state database.
- Accounting state lives in one DuckDB schema selected by runtime/store state.
- The accounting schema defaults to `main` and may be configured to a different schema.
- When no accounting-state database file is provided, demos and tests may store accounting state in a schema of the in-memory database.
- Store state owns the fully qualified accounting schema name, whether attached or in-memory.
- DuckDB is the required database engine.
- DuckDB SQL is the schema and query dialect.
- `docs/phase-1-data-model.md` is the source of truth for accounting-state tables, column types, generated columns, enum values, sequence use, arrays, timestamps, dates, and decimal precision.
- Local config is operational state only.
- Config must not be required to interpret the accounting database.
- The selected database path and schema come from explicit CLI input or local config.
- Rebuildable in-memory/cache schemas may be added outside accounting state when documented by their owning runtime/store code.
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

Mina has exactly two app test classes: normal in-process app tests and testscript-driven end-to-end integration tests. Do not build a unit-test suite around private helpers.

- Normal in-process app tests live in `internal/apptest/runtime`.
- Normal tests bypass CLI and network listeners.
- Normal tests exercise app logic through an in-memory client, in-memory DuckDB, and per-test schemas.
- `internal/apptest` owns reusable harness code for normal in-process app tests.
- Normal tests should use reusable harness building blocks so test bodies read as user scenarios instead of setup boilerplate.
- Basic persistence checks may create through the in-memory client and assert attached database state directly.
- Other scenario tests should use the in-memory client for fixture setup and assertions.
- Good tests are independent of implementation details such as SQL construction, router internals, repository methods, and private service helpers.
- Do not mock controllers, services, or stores for normal behavior tests.
- End-to-end integration tests live under the `cmd/mina` testscript integration suite.
- End-to-end integration tests run only through testscript.
- End-to-end integration tests are not run by default.
- End-to-end integration tests own real-network REST tests, CLI tests, and later TUI tests.
- Run end-to-end integration tests before release work and after risky CLI, server, JSON-over-HTTP, or later TUI changes.
