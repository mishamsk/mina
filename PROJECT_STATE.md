# Project State

- Active scope: Phase 1 Stage 1 REST APIs in one Go `cmd/mina` binary.
- Default operator workflow: start the REST API with `mina serve --db PATH`
- Implemented API capability groups:
  - Health checks and stable JSON error envelopes.
  - Account, category, tag, and household member CRUD/list flows.
  - Exchange-rate and account credit-limit-history flows.
  - Transaction creation, read, list, full replacement, and tombstone deletion with nested journal records.
  - Journal-record search and account-record search.
  - Bulk journal-record category, tag, account, and status updates.
  - OpenAPI discovery through `GET /openapi.json`.
- Implemented storage behavior:
  - Runtime owns accounting location defaults, opens an in-memory DuckDB process database, and selects either an attached accounting database file or the in-memory accounting database with configurable schema fallback.
  - Store-owned accounting locations qualify migration and repository SQL against the selected database and schema.
  - Upgrade-only DuckDB migrations with schema-version tracking in the selected accounting location.
  - Atomic double-entry transaction persistence and replacement.
  - Tombstone-aware reads and list defaults for applicable resources.
  - Store-owned allowlists for dynamic filtering and sorting.
