# Mina Technical Architecture

This document defines the technical architecture for Mina, a local-first personal finance management system delivered as a CLI application with a localhost web UI and REST API. All implementation work must align with this architecture.

**Prerequisites:** Read `docs/business-requirements.md` before this document.
**Build/Deploy Source of Truth:** Use `docs/deployment-architecture.md` for development, release build flows, packaging, artifact layout, and deployment topology.

---

## System Overview

Mina is a single-user, single-household application that runs locally from a Rust CLI binary.

The CLI binary is responsible for:

- Opening or creating a local DuckDB database file.
- Running migrations and validating database compatibility.
- Serving a REST API over localhost.
- Serving embedded React frontend assets for the local web UI.
- Providing headless server mode for scripts and automation.
- Providing selected data-operation commands for import, export, and scripted maintenance.

The frontend is a normal React application compiled into static assets and embedded into the CLI binary for release builds. It communicates with Mina only through the REST API. There is one runtime path, one API contract, and one persistent data model.

### Runtime Topology

```text
User terminal
    │
    ▼
mina CLI binary
    ├── CLI command handling
    ├── DuckDB connection management
    ├── Domain services
    ├── REST API server on localhost
    └── Embedded React static assets
            │
            ▼
     Local web browser
            │
            ▼
       REST API calls
            │
            ▼
      Local DuckDB file
```

### Persistent State

The durable application state is intentionally small:

- The selected DuckDB database file containing all accounting data.
- Local CLI configuration in `XDG_CONFIG_HOME` that includes last-opened database path, bind address, port, and default open mode.

The database file remains the portable unit of accounting data. Configuration is operational state and must not be required to interpret the accounting database.

---

## Rust Crate Architecture

### Crate Overview

The crate layout should stay small and direct for the MVP. Mina follows a classical database-controller-router shape:

- **Routers** live in `mina-api`; they extract request data and the DuckDB connection, then call controllers.
- **Controllers** live in `mina-core`; they own business logic, validation, and checks not enforced by the database.
- **Database helpers** live in `mina-db`; they build and execute queries through the ORM and DuckDB connection.

```text
crates/
├── mina-schema/        # Entity structs, DDL, SQL migrations, OpenAPI schemas
├── mina-orm/           # ORM traits and query helpers over duckdb-rs connections
├── mina-orm-macros/    # Derive macros for ORM traits
├── mina-db/            # Query wrappers and persistence operations over duckdb-rs
├── mina-db-setup/      # Migration runner, database creation, sample data
├── mina-core/          # Controllers: business logic and validation
├── mina-api/           # Axum REST API routes and OpenAPI generation
└── mina-cli/           # CLI binary, config, server startup, asset serving
```

Crate structure may evolve, but all crates must use the `mina-` prefix.

### Dependency Flow

```text
mina-cli
   │
   ├── mina-api
   │     ├── mina-core
   │     ├── mina-schema
   │     └── duckdb-rs
   │
   ├── mina-core
   │     ├── mina-db
   │     ├── mina-schema
   │     └── duckdb-rs
   │
   ├── mina-db
   │     ├── mina-schema
   │     ├── mina-orm
   │     └── duckdb-rs
   │
   ├── mina-db-setup
   │     ├── mina-db
   │     ├── mina-schema
   │     └── duckdb-rs
   │
   └── mina-schema
         ├── mina-orm
         └── mina-orm-macros
```

Rules:

- `mina-schema` owns persistent domain shapes, DDL, and migrations.
- `mina-orm` works directly with `duckdb-rs` connection types and may depend on `duckdb-rs`.
- `mina-db` owns convenience query wrappers and persistence operations. It depends on `mina-schema`, `mina-orm`, and `duckdb-rs`.
- `mina-core` contains controllers. It depends on `mina-db`, `mina-schema`, and `duckdb-rs` so controllers can accept connection objects directly.
- `mina-api` maps HTTP requests to `mina-core` controllers. It depends on `mina-core`, `mina-schema`, and `duckdb-rs` because it manages request-scoped database access.
- `mina-cli` composes the application, parses commands, loads config, opens databases, and starts servers.

### Crate Responsibilities

**mina-schema**

- Source of truth for entities participating in CRUD and reporting operations.
- Entity structs derive ORM traits from `mina-orm` / `mina-orm-macros`.
- Entity structs and API DTOs derive REST serialization and OpenAPI schema traits.
- Defines shared API response DTOs, including stable JSON error response shapes.
- Database DDL definitions and SQL migration files.
- Shared validation constants that are intrinsic to stored data shape.

**mina-db**

- Query and persistence helper layer.
- Provides typed operations for accounts, transactions, records, categories, tags, members, exchange rates, budgets, imports, and reports.
- Accepts `duckdb-rs` connection objects directly.
- Builds queries through `mina-orm` where the ORM is useful, and uses explicit SQL where that is simpler.
- Executes all user-provided values through safe parameter binding.
- Converts `duckdb-rs` errors into Mina database errors.
- Does not contain business rules beyond persistence constraints and query-shaping concerns.

**mina-orm + mina-orm-macros**

- Implements a small ORM layer over `duckdb-rs` connections.
- Defines traits such as `Entity`, `Insertable`, `Updatable`, `Deletable`, and `Filterable`.
- Generates SQL for CRUD operations and filtered queries.
- Generates parameterized SQL and bind parameters separately.
- May depend directly on `duckdb-rs`.
- Receives DuckDB connection objects from callers

**mina-db-setup**

- Creates new Mina database files, including demo/test ones
- Applies version-based SQL migrations.
- Validates schema version compatibility.
- Generates demo or sample data for development when explicitly requested.
- Uses `duckdb-rs` connections and `mina-db` helpers where useful.

**mina-core**

- Contains controllers for accounts, transactions, records, categories, tags, members, exchange rates, budgets, imports, and reports.
- Enforces double-entry invariants and domain validation.
- Accepts `duckdb-rs` connection objects directly.
- Calls `mina-db` persistence helpers.
- Has no HTTP, CLI parsing, filesystem configuration, or frontend concerns.

**mina-api**

- Axum-based REST API.
- Routers extract request state, including the database connection, and call `mina-core` controllers.
- Serves generated OpenAPI schema used by frontend code generation.
- Maps domain and database errors into `mina-schema` error DTOs and HTTP status codes.

**mina-cli**

- Defines commands and flags.
- Loads and stores local configuration.
- Opens the selected database.
- Runs the API server and serves embedded frontend assets.
- Provides headless API server mode.
- Provides selected data-operation commands for automation.
- Wires together `duckdb-rs`, `mina-db-setup`, `mina-core`, and `mina-api`.

### Design Principles

- Keep crates independently understandable and testable.
- Prefer direct dependencies over abstractions until the MVP proves a need for indirection.
- Keep routers thin, controllers explicit, and database helpers focused on persistence.
- Keep implementation details out of architectural contracts unless they affect cross-crate boundaries.

---

## CLI Architecture

### First-Class Commands

The CLI should support three first-class usage patterns.

**Serve UI**

- Starts the REST API server on localhost.
- Serves embedded React assets from the same process.
- Prints the local URL.
- Optionally opens the URL with a user-controlled flag.

**Server API**

- Starts the REST API server without assuming browser usage.
- Supports scripting, integration tests, and local automation.
- Uses the same routes and domain services as the UI-serving command.

**Data Ops**

- Provides automation-friendly commands for operations such as import, export, database validation, and scripted account or transaction maintenance.
- Uses the same `mina-core` services as the REST API.
- Emits structured output where practical so commands can be composed in scripts.

### Configuration

Local configuration should include operational settings only:

- Default database path.
- Bind host and port.
- UI auto-open preference.
- Logging verbosity.

Configuration must not contain accounting domain state.

---

## Frontend Architecture

The frontend stack is React with Vite. React owns the local web UI and Vite owns development serving, bundling, and frontend build configuration.

### Structure

```text
frontend/
├── src/
│   ├── api/
│   │   ├── generated/      # Generated REST client and shared contract types
│   │   └── client.ts       # Small application wrapper around generated client
│   ├── context/
│   │   └── ApiContext      # Provides API client and app status to components
│   ├── components/
│   ├── pages/
│   └── ...
```

### Data Access

The frontend is REST-only.

- OpenAPI-generated types are the canonical TypeScript contract types.
- Generated REST client code is the default path for API calls.
- Components should not duplicate request/response shapes by hand.
- A thin application API wrapper may add cross-cutting concerns such as base URL resolution, error normalization, and authentication hooks if ever needed.

### Build Output

The Vite production build outputs one static asset bundle into a directory consumed by the CLI release build.

---

## API Architecture

### Route Design

The REST API should expose complete programmatic access to product functionality:

- Accounts and account balances.
- Transactions and journal records.
- Categories, tags, and household members.
- Exchange rates and currency conversion support.
- Search and filtering.
- Bulk operations.
- Import/export and reconciliation workflows as those phases are implemented.
- Reporting and saved searches.

### Contract Generation

- `mina-schema` defines serializable request, response, and error DTOs that derive OpenAPI schema traits.
- `mina-api` generates the OpenAPI schema from Axum route definitions and `mina-schema` DTOs.
- Frontend contract types and REST client code are generated from the OpenAPI schema.
- API changes and generated frontend updates should be committed together.
- CI should eventually verify that generated artifacts are current.

### Error Handling

API errors are part of the OpenAPI contract and must be stable and machine-readable. The JSON response structs live in `mina-schema`; `mina-api` only chooses status codes and maps internal errors into those DTOs.

- HTTP status code.
- Stable application error code.
- Human-readable message.
- Optional structured details for field validation, constraint failures, or conflict information.

---

## Database Architecture

### Connection Model

The application opens a selected DuckDB database file through `duckdb-rs`. Routers and CLI commands pass DuckDB connection objects to `mina-core` controllers, and controllers pass those connections to `mina-db` query helpers.

- App opens databases in normal writable mode.
- Connection ownership, pooling, or serialization policy is managed by `mina-api` and `mina-cli`.
- `mina-db` and `mina-orm` operate on provided DuckDB connections and do not own application startup policy.
- Direct DuckDB dependencies are acceptable in `mina-api`, `mina-core`, `mina-db`, and `mina-orm`.

### SQL Safety

All SQL that includes user-controlled values must use safe parameter binding through `duckdb-rs`.

Rules:

- Do not build SQL by concatenating user input into query strings.
- Keep SQL text and bind values separate in `mina-orm` and `mina-db` APIs.
- Dynamic filters, sort options, and column names must be selected from typed allowlists, not raw request strings.
- Explicit SQL is allowed when clearer than ORM-generated SQL, but it must still use parameters for values.
- Tests for query-building helpers should cover parameter ordering and reject unsupported dynamic fields.

### Migrations

Version-based SQL migrations are upgrade-only.

```text
mina-schema/
└── migrations/
    ├── 001_initial_schema.sql
    ├── 002_add_tags.sql
    └── ...
```

Rules:

- The database stores its current schema version in metadata.
- Migrations run in order.
- Downgrades are not supported.

### Portability

The DuckDB file is the portable accounting data artifact.

- A copied database file should be usable without copying local CLI config.
- Exports should be explicit user actions.
- Operational caches, if introduced, must be rebuildable.

### Future Encryption

Architecture should leave room for encrypted DuckDB databases when ready.

- Encryption options belong to database open/config state.
- Domain logic and schema definitions should not change for encrypted storage.

---

## Error Handling

Errors are defined at crate boundaries, not in implementation internals.

**mina-db**

- Defines database error types used by query helpers.
- Converts DuckDB-specific failures to shared database errors.
- Inner layers do not depend on DuckDB-specific error values.

**mina-core**

- Defines domain and use-case errors.
- Wraps or transforms database errors as needed.
- Adds validation failures, double-entry imbalance errors, and business constraint errors.

**mina-api**

- Maps `mina-core` errors to HTTP status codes and `mina-schema` error DTOs.
- Keeps error response shape stable and represented in the generated OpenAPI contract.

**mina-cli**

- Maps errors to clear terminal output and meaningful exit codes.
- Offers structured output for data-operation commands when requested.

Use `thiserror` for Rust error enums and keep error conversion explicit at crate boundaries.

---

## Testing Architecture

### Philosophy

- Favor end-to-end tests for high-value accounting workflows.
- Add focused unit and integration tests where crate boundaries carry non-trivial logic.
- Keep tests aligned with the same CLI/API/frontend runtime used by users.

### Test Layers

**Core and ORM tests**

- Validate SQL generation, filtering, persistence behavior, and domain invariants.
- Use temporary DuckDB databases.

**API tests**

- Exercise route behavior, error mapping, and OpenAPI contract expectations.

**CLI tests**

- Exercise command parsing, database selection, exit codes, and structured output.

**Frontend E2E tests**

- Use Playwright against the local CLI-served application or a development server pointed at the local API.
- Cover the same user-visible workflows as the released app.

---

## Key Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Delivery model | Local CLI with localhost web UI and REST API | Keeps the product local-first with a simple operational model |
| Database | DuckDB | Strong analytics, single-file portability, and good local performance |
| DuckDB binding | `duckdb-rs` Rust bindings | Keeps database execution native to the CLI process |
| DuckDB linking | Dynamic in development, static/bundled for release | Fast local iteration plus self-contained release builds |
| Persistence boundary | Database file plus local operational config | Keeps accounting data portable and configuration separate |
| Database layer | `mina-db` query helpers over `duckdb-rs` | Keeps persistence code organized without adding an execution abstraction |
| ORM | Mina-owned ORM over `duckdb-rs` connections | Supports typed CRUD/filtering while staying simple for the MVP |
| HTTP framework | Axum | Modern, tower-based, strongly typed Rust API framework |
| Frontend framework | React + Vite | React component UI with fast Vite development and deterministic static builds |
| Frontend data access | Generated REST client | Single contract path between frontend and backend |
| Error handling | `thiserror` plus stable API error bodies | Rich internal errors and predictable external behavior |
| Hierarchy encoding | Colon-separated paths | Simple, human-readable names such as `Food:Restaurants:FastFood` |
| Migrations | Version-based SQL | Numbered upgrade files with clear ordering |
| Static files | Embedded in CLI binary for release | Source-build release produces a self-contained local app binary |

---

## Data Model

### Full SQL Schema of the Core Entities

```sql
-- Sequence for global unique ID generation
CREATE SEQUENCE primary_key_gen_seq START 1;

-- ENUM types for status tracking
CREATE TYPE posting_status AS ENUM (
    'PENDING',
    'POSTED',
    'CANCELLED'
);

CREATE TYPE reconciliation_status AS ENUM (
    'RECONCILED',
    'UNRECONCILED'
);

CREATE TYPE source AS ENUM (
    'MANUAL',
    'IMPORTED',
    'RECURRING_TEMPLATE'
);

-- Category table with hierarchical FQN and virtual columns
CREATE TABLE category (
    category_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    fqn TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

-- Tag table with hierarchical FQN and virtual columns
CREATE TABLE tag (
    tag_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    fqn TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

-- Member table for household member tracking
CREATE TABLE member (
    member_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

-- Account table with FQN hierarchy and virtual columns
CREATE TABLE account (
    account_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    fqn TEXT NOT NULL,
    currency TEXT,
    external_id TEXT,
    external_system TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    kind TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '^[^:]+')
    ) VIRTUAL,

    parent_fqn TEXT GENERATED ALWAYS AS (
        CASE
            WHEN instr(fqn, ':') > 0
            THEN regexp_replace(fqn, ':[^:]+$', '')
            ELSE NULL
        END
    ) VIRTUAL,

    name TEXT GENERATED ALWAYS AS (
        regexp_extract(fqn, '[^:]+$')
    ) VIRTUAL,

    level INTEGER GENERATED ALWAYS AS (
        ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
    ) VIRTUAL,

    UNIQUE(fqn, tombstoned_at)
);

-- Transaction table for double-entry transaction metadata
CREATE TABLE transaction (
    transaction_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    initiated_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

-- Journal record table for individual debit/credit entries
CREATE TABLE journal_record (
    record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    transaction_id INTEGER NOT NULL REFERENCES transaction(transaction_id),
    account_id INTEGER NOT NULL REFERENCES account(account_id),
    member_id INTEGER REFERENCES member(member_id),

    currency TEXT NOT NULL,
    amount DECIMAL(18,8) NOT NULL,
    amount_usd DECIMAL(18,8) NOT NULL,

    category_id INTEGER,
    tag_ids INTEGER[] NOT NULL DEFAULT [],

    memo TEXT,

    pending_date DATE,
    posted_date DATE,

    posting_status posting_status NOT NULL,
    reconciliation_status reconciliation_status NOT NULL DEFAULT 'RECONCILED',

    source source NOT NULL,

    external_id TEXT,
    external_system TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP
);

-- Exchange rate table for historical currency conversion
CREATE TABLE exchange_rate (
    exchange_rate_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate DECIMAL(18,8) NOT NULL,
    effective_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(from_currency, to_currency, effective_date, tombstoned_at)
);

-- Budget table for monthly category budgets
CREATE TABLE budget (
    budget_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    category_fqn TEXT NOT NULL,
    month DATE NOT NULL,
    amount DECIMAL(18,8) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(category_fqn, month, tombstoned_at)
);

-- Credit limit history table for tracking limit changes over time
CREATE TABLE credit_limit_history (
    credit_limit_history_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
    account_id INTEGER NOT NULL REFERENCES account(account_id),
    credit_limit DECIMAL(18,8) NOT NULL,
    effective_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tombstoned_at TIMESTAMP,

    UNIQUE(account_id, effective_date, tombstoned_at)
);
```

### Hierarchical Names Encoding

Accounts, categories, and tags use hierarchical naming with colon-separated paths:

- `checking:Chase:Primary`
- `Food:Restaurants:FastFood`
- `Trips:Vacation:Summer2024`

Hierarchy is encoded directly in the name string. Tree structure is derived at query time when needed.
