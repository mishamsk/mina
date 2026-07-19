# Mina Architecture

## What Mina Is

Mina is a local-first personal finance system for one household.

- Go 1.26+ application.
- One `cmd/mina` binary.
- REST API, web UI, REST-backed CLI client, and MCP server in one binary, with a later TUI.
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

- `cmd/mina`: one binary, process composition, and top-level Cobra command tree. It delegates client, MCP, serving, and runtime behavior to their owning packages.
- `internal/httpclient`: generated REST client code, generated operation catalog and invokers, and remote or in-process client session construction and lifecycle.
- `internal/clientcli`: REST-backed client command tree, request input and output rendering, and hand-written composite client commands.
- `internal/mcpserver`: REST-backed MCP tool registry, MCP result mapping, stdio and Streamable HTTP protocol handling, and hand-written composite tools.
- `internal/webui`: embedded web UI assets and root browser routing boundary.
- `internal/appconfig`: local app config source loading, config-file discovery, env parsing, explicit overrides, source precedence, defaults, and source metadata.
- `internal/runtime`: database lifecycle policy, runtime option handling, and manual composition root.
- `internal/httpapi`: REST/OpenAPI adapter, generated REST contract code, generated route registration, generated request binding, OpenAPI request validation for transport shape, HTTP DTO mapping, and HTTP status/error mapping.
- App-owned service packages: domain types, validation, use cases, and repository interfaces.
- `internal/store`: DuckDB driver access, migrations, transactions, query code, and repository implementations.
- `internal/tools`: repository-only generators, architecture checks, and developer workflow commands; never product behavior.
- `internal/x`: pure in-process library packages with app-agnostic data structures and helpers.

Rules:

- Service packages must not import HTTP, OpenAPI, web UI, TUI, scheduler, SQL, generated DB, Cobra, process I/O, or runtime composition packages.
- Service packages own domain validation and use-case decisions.
- Reference integrity is not enforced by foreign keys or store prechecks; services validate referenced IDs, active/tombstoned semantics, and hidden-resource rules before writes.
- `internal/httpapi` calls services and maps generated OpenAPI request/response DTOs. Strict-server implementations map generated OpenAPI request objects to service inputs, call services, and map service outputs, errors, and statuses to generated OpenAPI response objects.
- `internal/httpapi` does not open databases, parse CLI flags, own SQL, make domain decisions, or duplicate service-owned domain validation.
- `internal/store` owns DB-facing row types, migrations, transactions, DuckDB-specific error mapping, and app-to-DB type conversion.
- `internal/store` does not know HTTP, OpenAPI, Cobra, or runtime composition.
- `internal/webui` serves embedded frontend assets and does not own REST handlers, database access, or domain behavior.
- `internal/clientcli` and `internal/mcpserver` invoke Mina behavior only through generated REST operations owned by `internal/httpclient`; they do not call services, stores, SQL, or runtime application methods.
- `internal/mcpserver` owns MCP protocol behavior; `internal/httpapi` remains the REST protocol and application transport boundary.
- `internal/runtime` wires concrete implementations and owns explicit one-shot and long-running execution profiles. Avoid hidden global state for database handles, config, clocks, listeners, or services.
- `internal/appconfig` does not import runtime, store, HTTP, OpenAPI, background, provider, service, Cobra, or pflag packages.
- `internal/tools` is not imported by product packages.
- `internal/x` packages do not import app packages or own side-effect boundaries.
- Shared contracts belong at the lowest layer that can own them.

## Store / Database

- DuckDB is the required database engine. Store should use DuckDB specific terms and SQL dialect. There are no plans to support alternative database engines.
- User-provided values in SQL must use parameter binding.
- The app opens an in-memory DuckDB database first.
- When a database file is provided, the app attaches it as the portable accounting-state database.
- Accounting state lives in one DuckDB schema selected by app config plus explicit CLI overrides.
- When no accounting-state database file is provided (e.g. for demos and tests) accounting state stored in a schema of the in-memory database.
- Store state owns the fully qualified accounting schema name, whether attached or in-memory.
- `docs/data-model.md` is the source of truth for accounting-state tables, column types, generated columns, enum values, sequence use, arrays, timestamps, dates, and decimal precision.
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
- Database validation is a CLI-only pre-trust diagnostic and is deliberately not exposed over REST.

## REST-Backed Client Surfaces

- `docs/cli-mcp-architecture.md` owns CLI client, MCP, generation, and local-session design.
- Every OpenAPI operation has an explicit, independent CLI and MCP exposure or exclusion decision; tags may supply default grouping but never exposure.
- Generated and hand-written client-surface CLI commands and MCP tools invoke application behavior only through the generated REST client.
- Local CLI sessions run the REST handler against the selected database in-process, without a listener or automatic operations.
- Client-surface generation is build-time repository tooling under `internal/tools`, not a runtime boundary.

## Testing

- `docs/TESTING.md` owns test classes, test design rules, and integration-test scope.

## If Editing This File

- Keep this file short. It is a map and a home for hard design rules.
- Keep it evergreen. Do not describe old designs, migrations, or history.
