# github.com/mishamsk/mina/internal/runtime

## Purpose

- Composes Mina's concrete application dependencies and owns its process-local lifecycle policy.

## Implicit Contracts

- An `App` owns its `AppDB` and background runner; `Close` cancels and joins runner work before closing the database.
- One app-local reference serializer is shared by dictionary and dependent-write services, so dictionary deletes cannot race writes that create dependent references.
- Demo seeding runs through transaction-scoped service instances in one `AppDB` transaction; only a committed seed invalidates the main reference and needed-currency caches.
- Long-running apps alone load online authentication, expose embedded MCP at `/mcp`, and can start automatic operations. One-shot apps skip startup validation and automatic operations; migration apps validate after migration without authentication or operations.
- Embedded MCP dispatches to the trusted REST handler, then receives MCP-specific API-key protection; it must not be built from the root composed handler.
- Every app submits the initial dense exchange-rate cache rebuild as unrecorded, best-effort runner work. Exchange-rate loads rebuild that cache and backfill missing transaction `amount_usd` after every non-canceled attempt.
- Runtime resolves the accounting location, encryption key, and connection limit before delegating database open, migration, and read-only inspection mechanics to `store`.

## Boundaries

- Owns: concrete dependency wiring, execution profiles, database lifecycle policy, handler composition, and background-operation lifecycle.
- Does not own: app-config source loading, CLI parsing, SQL, domain decisions, REST DTO mapping, MCP protocol behavior, or web UI serving.
