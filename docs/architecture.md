# Mina Architecture

- Keep this file short. It is a map and a home for hard design rules.
- Keep it evergreen. Do not describe old designs, migrations, or history.
- Put schema details in `docs/phase-1-data-model.md`.

## What Mina Is

Mina is a local-first personal finance system for one household.

The active scope is Phase 1 Stage 1:

- Go application.
- Single local process.
- REST API only.
- No UI.
- Portable accounting state in one local DuckDB database file.

## Core Terms

- Database file: portable accounting state. It must be usable without local config.
- Local config: operational settings such as default database path, host, and port.
- Model: data shape and API/domain structs. Models are data-focused.
- Store: migrations, SQL, transactions, and database access helpers.
- Controller: domain use case. Owns validation and double-entry checks.
- Router: HTTP route and request/response mapping.
- App: in-process composition of routers, controllers, stores, config, and database handles.
- Boundary scenario test: test that drives public behavior through an app or CLI/API boundary.

## Where To Look

- Product scope: `docs/business-requirements.md`.
- Phase 1 data model: `docs/phase-1-data-model.md`.
- Current implementation inventory: `PROJECT_STATE.md`.
- Running work checklist template: `docs/running_todo_template.md`.

## Layering

Imports and runtime knowledge flow downward. Composition may import every layer.
Lower layers must not import higher layers.

1. Models and shared contracts.
2. Store: database connection use, migrations, query helpers, and transactions.
3. Controllers: domain use cases, validation, and orchestration.
4. Routers: REST endpoints, DTO mapping, HTTP status mapping, and request parsing.
5. CLI and app composition: config, database open/create, server startup, logging, and process I/O.

Rules:

- Routers call controllers. Routers do not contain domain decisions.
- Controllers call stores. Controllers do not build HTTP responses.
- Stores own SQL. Stores do not know HTTP, CLI flags, or process config.
- Models do not open files, run SQL, parse flags, or start servers.
- Shared contracts belong at the lowest layer that can own them.

## Persistent State

- Accounting state lives in an attached DuckDB database file.
- Local config is operational state only.
- Config must not be required to interpret the accounting database.
- The selected database path comes from explicit CLI input or local config.
- Operational caches, if added, must be rebuildable and reside in app main in-memory DuckDB database to which persistent accounting databases is attached. 
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
- Database open/create/migrate policy belongs to app composition.
- Query helpers operate on provided database handles.
- Database transactions wrap multi-row domain changes.
- Double-entry transactions must be persisted atomically.

## Hard Rules

- No UI work in Phase 1 Stage 1.
- No hidden global state for database handles, config, clocks, or listeners.
- No direct SQL in routers.
- No HTTP concerns in stores or models.
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
- Do not mock controllers or stores for normal behavior tests.
- Keep a small number of true process tests.
- True process tests cover CLI behavior and real JSON REST behavior.
- True process tests are not required on every commit.
- Run true process tests before release work and after risky CLI/server/JSON changes.
