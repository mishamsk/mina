# github.com/mishamsk/mina/internal/tools/accountingschema

## Purpose

- Generates the checked-in current target accounting DDL through Mina's real migration path.

## Implicit Contracts

- Generation migrates only a pristine process-local `memory.mina` accounting location, drops disposable runtime state, and keeps only DuckDB `EXPORT DATABASE`'s `schema.sql` output.

## Boundaries

- Owns: pristine accounting migration and extraction of DuckDB's native schema export.
- Does not own: product database initialization, migration policy, validation, repair, or live schema inspection.
