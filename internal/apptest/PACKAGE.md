# github.com/mishamsk/mina/internal/apptest

## Purpose

- Provides reusable in-process app-boundary test clients, scenarios, and deterministic side-effect fakes.

## Implicit Contracts

- Migration fixture clients upgrade an extracted archived database and complete full database validation before exposing REST behavior.

## Boundaries

- Owns: reusable test composition, shared REST-level behavior assertions, and test-owned fixture lifecycle.
- Does not own: production app behavior or persistence behavior.

## Testing Notes

- Produce and persist minimal immutable schema-version archives by following the [migration-fixture workflow](testdata/migrations/README.md); migration tests consume them through `NewFromMigrationFixture` and assert only through REST.
