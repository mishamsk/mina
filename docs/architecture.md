# Mina Architecture

## What Mina Is

Mina is a local-first personal finance system for one household.

- Go 1.26+ application.
- One `cmd/mina` binary.
- REST API, web UI, REST-backed CLI client, and MCP server in one binary.
- Portable accounting state stored in a DuckDB database (file or in-memory).
- Frontend architecture is owned by `docs/frontend-architecture.md`.

## Hard Rules

- Keep abstractions narrow. Add interfaces only at real boundaries.
- No hidden global state.
- No unit tests. When planning, writing or modifying tests you must first read and follow `docs/TESTING.md` and every scope-specific guide it requires. This is non-negotiable.
- No breaching of package boundaries. You must preserve boundaries `## Package Boundaries` below

## Layers

Layers name responsibility boundaries; package rules below define their code placement and allowed knowledge flow.

- **Client-surface layer:** human and agent interfaces plus REST client machinery; constructs requests and renders results without bypassing REST behavior.
- **REST transport layer:** OpenAPI validation, HTTP mapping, and service invocation; makes no domain decisions.
- **Service layer:** domain types, validation, use cases, and the provider-facing and store-facing contracts they consume.
- **Provider layer:** concrete side effects outside the accounting database behind service-owned contracts.
- **Store layer:** DuckDB access, transaction mechanics, repository implementations, and app-to-database mapping.
- **DuckDB schema layer:** DDL-enforced storage shape and constraints, versioned through migrations.
- **Composition layer:** executable and runtime lifecycle policy, dependency wiring, and operation registration.

## Package Boundaries

Imports and runtime knowledge flow inward toward the service layer. Composition may import every layer.

- **Composition layer — `cmd/mina`:** one binary, process composition, and top-level Cobra command tree. It delegates client, MCP, serving, and runtime behavior to their owning packages.
- **Client-surface layer — `internal/httpclient`:** generated REST client code and remote or in-process client session construction and lifecycle. It carries no CLI or MCP surface knowledge, catalogs, or wrapping invokers.
- **Client-surface layer — `internal/clientcli`:** REST-backed client command tree, generated CLI operation catalog and wrapping invokers, request input and output rendering, and hand-written composite client commands.
- **Client-surface layer — `internal/mcpserver`:** REST-backed MCP tool registry, generated MCP operation catalog and wrapping invokers, MCP result mapping, stdio and Streamable HTTP protocol handling, and hand-written composite tools.
- **Client-surface layer — `frontend` and `internal/webui`:** browser application behavior and embedded-asset delivery; `internal/webui` owns the root browser routing boundary.
- **Composition support — `internal/appconfig`:** local app config source loading, config-file discovery, env parsing, explicit overrides, source precedence, defaults, and source metadata.
- **Composition support — `internal/background`:** in-process operation execution, scheduling, retry, timeout, and runner lifecycle mechanics without domain behavior.
- **Service layer — `internal/services`:** app-owned domain types, validation, use cases, and consuming contracts implemented by stores and providers.
- **Provider layer — `internal/providers`:** concrete external and local provider implementations for service-owned contracts. Production concrete providers are visible only to runtime composition.
- **Composition layer — `internal/runtime`:** database lifecycle policy, runtime option handling, dependency wiring, operation registration, and manual composition root.
- **REST transport layer — `internal/httpapi`:** REST/OpenAPI adapter, generated REST contract code, generated route registration, generated request binding, OpenAPI request validation for transport shape, HTTP DTO mapping, and HTTP status/error mapping.
- **Store layer — `internal/store`; DuckDB schema layer — `internal/store/migrations`:** DuckDB driver access, versioned DDL, transactions, query code, DB-facing row types, DuckDB-specific error mapping, app-to-database conversion, and repository implementations.
- **Test support outside product layers — `internal/apptest`:** reusable in-process app-boundary clients, scenarios, deterministic fakes, and fixture lifecycle.
- **Repository support outside product layers — `internal/tools`:** generators, architecture checks, and developer workflow commands; never product behavior.
- **Shared support outside product layers — `internal/x`:** pure in-process libraries with app-agnostic data structures and helpers.

Rules:

- Service packages must not import HTTP, OpenAPI, web UI, TUI, scheduler, SQL, generated DB, Cobra, process I/O, or runtime composition packages.
- `internal/httpapi` calls services and maps generated OpenAPI request/response DTOs. Strict-server implementations map generated OpenAPI request objects to service inputs, call services, and map service outputs, errors, and statuses to generated OpenAPI response objects.
- `internal/httpapi` does not open databases, parse CLI flags, own SQL, make domain decisions, or duplicate service-owned domain validation.
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
- Mina-owned instants use timezone-aware database types and canonical UTC transport; client surfaces own local-time presentation. Civil dates remain `DATE` values without timezone conversion.
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

## Data Integrity

### DuckDB Schema Layer

- DuckDB DDL owns physical row identity and storage shape through primary keys, column types, nullability, defaults, and enums for closed Mina-owned categorical values.
- DuckDB DDL does not use foreign keys or domain `CHECK` constraints.
- DuckDB unique constraints or indexes own exact business-key uniqueness for tables expected to stay small and rarely written; prefer them to owner-specific service serialization.
- Business keys on high-cardinality or frequently written tables belong to coordinated service writes or store transactions instead of DuckDB unique constraints or indexes.
- Non-unique secondary indexes are performance optimizations only and require representative evidence of a read benefit; they never own domain integrity.

### Service Layer

- Services validate domain rules and referenced IDs, including active/tombstoned and hidden-resource semantics, before writes.
- Mutations to cache-backed dictionaries and reusable definitions—accounts, categories, tags, members, transaction templates, and recurring definitions—acquire the app-wide coordinator's exclusive lease once around validation, database commit, and cache publication or invalidation.
- The exclusive lease also protects cross-row rules that an exact-key index cannot express, including prefix-free active FQN hierarchies, from validation through commit.
- Mutations whose correctness depends on those references acquire the same coordinator's shared lease once before validation and hold it through database commit, allowing unrelated dependent mutations to proceed concurrently.
- Services do not add serialization solely for an exact business key already owned by DuckDB. Overlap is allowed when the same service coordination is required to keep another integrity rule coherent through commit.
- Standalone datasets without schema-owned business keys serialize only their own writers around business-key uniqueness validation and database commit; they do not use the shared coordinator unless their correctness depends on coordinated reference or definition state.

### Store Layer

- Store transactions atomically persist multi-row domain changes—including double-entry transaction and journal-record changes—and own persisted concurrency preconditions for cross-table changes to a parent row and its owned or attached rows.
- When an owned or attached row must remain associated with an active parent under concurrent writes, its material mutation updates the parent `updated_at` to the operation timestamp in the same store transaction; `updated_at` is the revision and, where exposed, optimistic-concurrency token, while exact no-ops preserve it.
- A parent update must represent a material parent change; stores must not manufacture write conflicts with self-assignments or other fake updates.
- When an attached-row mutation is not a parent change, the store validates the relationship in its transaction snapshot but does not promise that a concurrent parent mutation cannot make the relationship inactive.

### Database Validation

- Database validation spans the composition, service, and store layers: composition owns execution policy, services orchestrate validation and findings, and stores supply DuckDB inspection and checks.
- Full database validation audits stored reference integrity and domain invariants as a diagnostic backstop; it does not replace write-time service validation or store transaction guarantees.
- File-backed long-running and migration startup uses shallow schema validation by default, permits full validation or no validation by configuration, and one-shot execution skips startup validation.

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
- Database validation is deliberately not exposed over REST; explicit offline execution is CLI-only.

## REST-Backed Client Surfaces

- `docs/cli-mcp-architecture.md` owns CLI client, MCP, generation, and local-session design.
- Every OpenAPI operation has an explicit, independent CLI and MCP exposure or exclusion decision; tags may supply default grouping but never exposure.
- Generated and hand-written client-surface CLI commands and MCP tools invoke application behavior only through the generated REST client.
- Local CLI sessions run the REST handler against the selected database in-process, without a listener or automatic operations.
- Client-surface generation is build-time repository tooling under `internal/tools`, not a runtime boundary.

## Testing

- `docs/TESTING.md` owns test-class navigation; its linked scope-specific guides own test design rules and integration-test scope.

## If Editing This File

- Keep this file short. It is a map and a home for hard design rules.
- Keep it evergreen. Do not describe old designs, migrations, or history.
