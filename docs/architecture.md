# Mina Architecture

## What Mina Is

Mina is a local-first personal finance system for one household.

- Go 1.26+ application.
- One `cmd/mina` binary.
- REST API with web UI served from the binary and later a TUI.
- Portable accounting state stored in a DuckDB database (file or in-memory).
- Frontend architecture is owned by `docs/frontend-architecture.md`.

## Hard Rules

- Keep abstractions narrow. Add interfaces only at real boundaries.
- No hidden global state.
- No unit tests. When planning, writing or modifying tests you must first read and follow `docs/TESTING.md`. This is non-negotiable.
- No breaching of package boundaries. You must preserve boundaries `## Package Boundaries` below

## Core Terms

- Local config: operational settings such as default database path, host, and port.
- Database file: portable accounting state. It must be usable without local config.

## Package Boundaries

Imports and runtime knowledge flow inward toward app-owned service packages. Composition may import every layer.

- `cmd/mina`: one binary and Cobra command tree. Cobra owns CLI parsing and command help. Should delegate all operations to runtime.
- `internal/httpclient`: generated REST client code from the OpenAPI source.
- `internal/webui`: embedded web UI assets and root browser routing boundary.
- `internal/appconfig`: local app config source loading, config-file discovery, env parsing, explicit overrides, source precedence, defaults, and source metadata.
- `internal/runtime`: database lifecycle policy, runtime option handling, and manual composition root.
- `internal/httpapi`: REST/OpenAPI adapter, generated REST contract code, generated route registration, generated request binding, OpenAPI request validation for transport shape, HTTP DTO mapping, and HTTP status/error mapping.
- App-owned service packages: domain types, validation, use cases, and repository interfaces.
- `internal/store`: DuckDB driver access, migrations, transactions, query code, and repository implementations.

Rules:

- Service packages must not import HTTP, OpenAPI, web UI, TUI, scheduler, SQL, generated DB, Cobra, process I/O, or runtime composition packages.
- Service packages own domain validation and use-case decisions.
- `internal/httpapi` calls services and maps generated OpenAPI request/response DTOs. Strict-server implementations map generated OpenAPI request objects to service inputs, call services, and map service outputs, errors, and statuses to generated OpenAPI response objects.
- `internal/httpapi` does not open databases, parse CLI flags, own SQL, make domain decisions, or duplicate service-owned domain validation.
- `internal/store` owns DB-facing row types, migrations, transactions, DuckDB-specific error mapping, and app-to-DB type conversion.
- `internal/store` does not know HTTP, OpenAPI, Cobra, or runtime composition.
- `internal/webui` serves embedded frontend assets and does not own REST handlers, database access, or domain behavior.
- `internal/runtime` wires concrete implementations manually. Avoid hidden global state for database handles, config, clocks, listeners, or services.
- `internal/appconfig` does not import runtime, store, HTTP, OpenAPI, background, provider, service, Cobra, or pflag packages.
- Shared contracts belong at the lowest layer that can own them.

## Store / Database

- DuckDB is the required database engine. Store should use DuckDB specific terms and SQL dialect. There are no plans to support alternative database engines.
- User-provided values in SQL must use parameter binding.
- The app opens an in-memory DuckDB database first.
- When a database file is provided, the app attaches it as the portable accounting-state database.
- Accounting state lives in one DuckDB schema selected by app config plus explicit CLI overrides.
- When no accounting-state database file is provided (e.g. for demos and tests) accounting state stored in a schema of the in-memory database.
- Store state owns the fully qualified accounting schema name, whether attached or in-memory.
- `docs/phase-1-data-model.md` is the source of truth for accounting-state tables, column types, generated columns, enum values, sequence use, arrays, timestamps, dates, and decimal precision.
- Migrations are versioned and upgrade-only.
- The database stores its schema version.
- Database open/create/migrate policy belongs to `internal/runtime`.
- DuckDB open, migration, query, and transaction code belongs to `internal/store`.
- Query helpers operate on provided database handles.
- Database transactions wrap multi-row domain changes.
- Double-entry transactions must be persisted atomically.

## Config

- Local config is operational state only.
- Config must not be required to interpret the accounting database.
- The selected database path and schema come from app config plus explicit CLI overrides.
- Runtime derives DuckDB accounting location defaults from the selected app config.

## REST API

- Every capability must be available through the API.
- API errors are stable, machine-readable JSON.
- Dynamic filters, sort keys, and field names must come from typed allowlists.
- Hidden accounts, categories, and tags are excluded by default and included only by explicit query.

## Testing

- `docs/TESTING.md` owns test classes, test design rules, and integration-test scope.

## If Editing This File

- Keep this file short. It is a map and a home for hard design rules.
- Keep it evergreen. Do not describe old designs, migrations, or history.
