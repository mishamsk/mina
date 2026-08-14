# Data Integrity Rationale

This document records the reasoning behind Mina's data-integrity boundaries. It describes the intended design, not implementation status.

## Operating Model

- One Mina process owns the writable DuckDB database.
- Mina serves one household at modest volume; overlapping writes to the same logical records are possible but rare.
- Read-heavy analytical responsiveness matters more than optimizing for adversarial write contention.
- Out-of-band database edits are unsupported while Mina owns the database; full database validation is the diagnostic for restoring trust afterward.

## DuckDB Constraints

- Primary keys protect physical row identity. Exact DuckDB types, nullability, defaults, and enums protect storage shape.
- Mina does not use foreign keys. A DuckDB foreign key proves that a physical parent key exists, but Mina references depend on whether a row is active or tombstoned and may have additional hidden-resource rules. Foreign keys would therefore enforce only part of the reference contract while adding indexes and DuckDB-specific update limitations.
- The absence of foreign keys does not depend on a blanket prohibition against physical deletion. Each owning service or store operation defines lifecycle behavior for its records.
- Mina does not use domain `CHECK` constraints. Services reject invalid writes, and full database validation detects invalid persisted state from bugs or out-of-band edits without duplicating request-path validation in DDL.

## Business-Key Uniqueness and Indexes

- Small, rarely written tables use DuckDB unique constraints or indexes for exact business keys. Their maintenance cost is negligible at household scale, and schema ownership is simpler than a dedicated service serializer.
- A schema-owned exact key does not justify service serialization by itself. When service coordination is already required for a broader domain rule, its validation may overlap the exact-key check; DuckDB remains the final authority for that key. Cache-backed dictionaries and reusable definitions use the app-wide coordinator to protect active reference lifetime, cache publication, and cross-row rules such as prefix-free active FQN hierarchies.
- High-cardinality or frequently written datasets use app-scoped, owner-specific writer coordination around business-key validation and commit. Exchange rates follow this rule because they grow through daily batch writes and their unique index has no demonstrated read benefit.
- Parent-owned and attached rows may instead obtain their concurrency guarantee by materially updating their parent revision in the same store transaction.
- Transaction-attached metadata and links use store transaction guarantees rather than unique indexes because they grow with fact data and their parent revisions already provide the necessary concurrency boundary.
- Non-unique secondary indexes are considered separately as query-performance tools. Add one only when representative query plans or measurements show that DuckDB will use it for a material read benefit; do not infer a join or aggregation benefit from its use for constraint enforcement.
- Existing non-unique indexes supporting journal-record parent lookups and API-audit ordering remain valid read optimizations independent of business-key ownership.

## Service Read/Write Coordination

- Runtime supplies one app-wide read/write coordinator to every service instance that participates in reference or reusable-definition writes.
- A dependent mutation acquires one shared lease before its first coordinated reference validation and releases it only after commit or failure. Concurrent dependent mutations may therefore validate and write in parallel.
- A reference or reusable-definition mutation acquires one exclusive lease before validation and releases it only after commit or failure and cache publication or invalidation.
- The outer use case acquires the lease once. Internal service calls operate under that lease rather than acquiring it again, avoiding nested read/write-lock behavior and keeping the critical section visible.
- Reads that do not require a coherent multi-step cached snapshot do not acquire the coordinator.

## Store Transaction Guarantees

- “Multi-row” includes changes to several rows in one table and changes spanning tables.
- Services decide whether a requested domain state is valid. Stores atomically persist the validated change and own preconditions that must remain true until commit.
- A transaction row, its journal records, and records attached to them are protected through real writes to the relevant parent rows when the relationship must remain active under concurrency.
- Updating `updated_at` to itself or otherwise changing a parent only to provoke a DuckDB write conflict is not a valid concurrency mechanism.
- A material owned-row or attached-row mutation that participates in the parent's concurrency guarantee sets the parent `updated_at` to the shared operation timestamp. That timestamp is the parent revision and, where exposed, REST optimistic-concurrency token; exact no-ops leave it unchanged.
- Mina relies on the single-process operating clock and ordinary transaction timing to advance successive operation timestamps. It does not add separate monotonicity reads or corrections.
- If an attached-row mutation is deliberately not considered a parent change, the store still validates an active relationship in its transaction snapshot but does not protect that relationship against a concurrent parent mutation.

## Database Validation

- Shallow validation compares the database schema with the migrated target and remains the default for file-backed long-running and migration startup.
- Full validation additionally audits logical references and domain invariants. It is available by startup configuration and through the offline database-validation command.
- Validation detects invalid stored state; it does not provide write-time concurrency or replace service and store ownership.
