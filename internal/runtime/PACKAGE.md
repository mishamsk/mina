# github.com/mishamsk/mina/internal/runtime

## Purpose

- Composes Mina's concrete application dependencies and owns its process-local lifecycle policy.

## Implicit Contracts

- An `App` owns its `AppDB` and background runner; `Close` cancels and joins runner work and bounded pending audit inserts before closing the database.
- One app-local read/write lease gives reference and reusable-definition mutations exclusive access and reference-dependent writes shared access; exchange-rate and recurring-occurrence writers have separate app-local exclusive leases.
- Lock order is the reference lease, then an owner-specific writer lease, then the database transaction; the generic lease combinator preserves that order and propagates exact lease ownership through context.
- Demo seeding holds every app lease through its single `AppDB` commit and main-cache invalidation; transaction-scoped services reuse those leases and safely re-enter them through the propagated context.
- Long-running apps alone load online authentication, expose embedded MCP at `/mcp`, and can start automatic operations. One-shot apps skip startup validation and automatic operations; migration apps validate after migration without authentication or operations.
- Embedded MCP dispatches to the trusted REST handler, then receives MCP-specific API-key protection; it must not be built from the root composed handler.
- Every app submits the initial dense exchange-rate cache rebuild as unrecorded, best-effort runner work. Exchange-rate loads rebuild that cache and backfill missing transaction `amount_usd` after every non-canceled attempt.
- Built-in Frankfurter-file startup gives the initial cache read 15 minutes and retains the ordinary two-minute allowance to load safe progress afterward; API-only, injected, manual, and scheduled loads keep the ordinary short deadline.
- Runtime resolves the accounting location, encryption key, and connection limit before delegating database open, migration, and read-only inspection mechanics to `store`.
- Runtime composes the data-aggregate service's Household, Category, and Tag flow reports from the DuckDB repository, Category/Tag readers, transaction classifier, and runtime clock.
- Runtime connects recurring's read-only future projection provider to transaction-list composition after both services are constructed.
- Runtime composes portable API audit persistence into trusted and externally protected REST trees so protection rejections are captured; audit insert failures do not change the determined REST outcome.
- Runtime registers API audit-log compaction for manual execution in every app and schedules it only under long-running automatic-operation policy; compaction uses the shared runtime clock and configured retention.
- The system clock installs one cancelable timer for each recurring-operation deadline without periodic wakeups.
- The offline schema command reads the embedded target DDL through a static accessor; constructing an app still follows the normal database lifecycle.

## Boundaries

- Owns: concrete dependency wiring, execution profiles, database lifecycle policy, handler composition, and background-operation lifecycle.
- Does not own: app-config source loading, CLI parsing, SQL, domain decisions, REST DTO mapping, MCP protocol behavior, or web UI serving.
