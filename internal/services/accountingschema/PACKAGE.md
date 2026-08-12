# github.com/mishamsk/mina/internal/services/accountingschema

## Purpose

- Exposes the checked-in current target accounting DDL as a build-time application asset for REST and offline CLI inspection.

## Implicit Contracts

- The returned DDL is immutable process-wide inspection output generated from a pristine migrated database; it never describes a configured database's live state.

## Boundaries

- Owns: embedding and returning the generated accounting-schema artifact.
- Does not own: schema generation, database initialization, migration, validation, repair, or live catalog introspection.
