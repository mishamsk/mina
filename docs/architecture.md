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
- `internal/httpclient`: generated REST client code and remote or in-process client session construction and lifecycle. It carries no CLI or MCP surface knowledge, catalogs, or wrapping invokers.
- `internal/clientcli`: REST-backed client command tree, generated CLI operation catalog and wrapping invokers, request input and output rendering, and hand-written composite client commands.
- `internal/mcpserver`: REST-backed MCP tool registry, generated MCP operation catalog and wrapping invokers, MCP result mapping, stdio and Streamable HTTP protocol handling, and hand-written composite tools.
- `internal/webui`: embedded web UI assets and root browser routing boundary.
- `internal/appconfig`: local app config source loading, config-file discovery, env parsing, explicit overrides, source precedence, defaults, and source metadata.
- `internal/services`: app-owned domain types, validation, use cases, and provider-facing contracts. Consuming services own the interfaces implemented by providers.
- `internal/providers`: concrete external and local provider implementations for service-owned contracts. Production concrete providers are visible only to runtime composition.
- `internal/runtime`: database lifecycle policy, runtime option handling, and manual composition root.
- `internal/httpapi`: REST/OpenAPI adapter, generated REST contract code, generated route registration, generated request binding, OpenAPI request validation for transport shape, HTTP DTO mapping, and HTTP status/error mapping.
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
- `internal/clientcli` and `internal/mcpserver` invoke Mina behavior only through the generated REST client owned by `internal/httpclient`; they do not call services, stores, SQL, or runtime application methods.
- `internal/clientcli` and `internal/mcpserver` are imported only by composition (`cmd/mina`, and `internal/runtime` for the embedded MCP handler); their generated catalogs are private to their surface.
- `internal/mcpserver` owns MCP protocol behavior; `internal/httpapi` remains the REST protocol and application transport boundary.
- `internal/runtime` wires concrete implementations and owns explicit one-shot and long-running execution profiles. Avoid hidden global state for database handles, config, clocks, listeners, or services.
- `internal/appconfig` does not import runtime, store, HTTP, OpenAPI, background, provider, service, Cobra, or pflag packages.
- `internal/services` does not import concrete providers; services own the contracts providers implement.
- `internal/providers` owns provider-specific side effects and implements service-owned contracts without making transport, CLI, or runtime-composition decisions.
- Production packages import concrete providers only from `internal/runtime` composition.
- `internal/tools` is not imported by product packages.
- `internal/x` packages do not import app packages or own side-effect boundaries.
- Shared contracts belong at the lowest layer that can own them.

## Store / Database

- `values.Decimal` and DuckDB `DECIMAL(18,8)` are the system-wide application and database precision limit, including aggregates and percentages.
- Out-of-range arithmetic fails instead of rounding, clamping, widening, or switching to internal string-backed decimals. Decimal text is allowed only at explicit parsing and rendering boundaries such as JSON transport.
- DuckDB is the required database engine. Store should use DuckDB specific terms and SQL dialect. There are no plans to support alternative database engines.
- User-provided values in SQL must use parameter binding.
- The app opens an in-memory DuckDB database first.
- When a database file is provided, the app attaches it as the portable accounting-state database.
- Accounting state lives in one DuckDB schema selected by app config plus explicit CLI overrides.
- When no accounting-state database file is provided (e.g. for demos and tests) accounting state stored in a schema of the in-memory database.
- Every app owns an opaque schema in the in-memory database for disposable runtime state; runtime schemas are outside portable accounting state, migrations, backups, and validation.
- Store state owns the fully qualified accounting schema name, whether attached or in-memory.
- `internal/store` owns runtime-schema creation, safe qualification, propagation across transaction-scoped repositories, and whole-schema cleanup.
- Versioned migrations are the source of truth for accounting DDL; `internal/services/accountingschema/schema.sql` is the generated current target artifact, with ownership and workflow in `docs/generated-files.md`.
- Migrations are versioned and upgrade-only.
- Migrations merged to `main` are immutable; every later persisted-state change uses a new migration when an upgrade is required.
- `docs/compatibility.md` owns supported accounting-data forward-upgrade guarantees.
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

- Every application capability must be available through the API; authentication administration and offline database validation are deliberate CLI-only operational flows.
- Every interactive user-facing state mutation goes through the REST handler over HTTP or in process; runtime-owned automatic work and offline administration remain outside the API audit trail.
- API errors are stable, machine-readable JSON.
- External REST authenticates with browser cookies or API keys; external MCP accepts API keys only. Public bootstrap routes and trusted in-process dispatch are explicit exceptions.
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
