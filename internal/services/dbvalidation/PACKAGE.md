# github.com/mishamsk/mina/internal/services/dbvalidation

## Purpose

- Orchestrates offline accounting-database integrity validation and its diagnostic reports.

## Implicit Contracts

- Shallow validation compares only the schema catalog. Full validation then runs referential, SQL-invariant, and transaction-classification checks, stopping after each layer that produces error findings.
- Full validation reuses `transactions.ValidateTransactionClassification` for every persisted lifecycle state by passing its transaction reader a resolved all-lifecycle predicate, rather than duplicating transaction semantics.
- Schema index drift remains a schema warning. Full validation audits every business key unconditionally, including keys owned by service writers or store transactions rather than DuckDB indexes.
- Findings are sorted by severity, layer, and message before return, making `Report.Write` deterministic for command consumers.
- Validator self-consistency failures—including a stale embedded-migration hash, incomplete reference registry, or missing transaction reader—are `InternalError`s. Callers must preserve that distinction from invalid-database findings for their exit handling.

## Boundaries

- Owns: validation layer orchestration, finding severity, and report rendering.
- Does not own: database opening, DuckDB catalog queries or SQL checks, migration embeds, transaction persistence or classification semantics, startup policy, or CLI exit mapping.
