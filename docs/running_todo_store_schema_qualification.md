# Store Schema Qualification Fix

## Plan Context

Mina storage must not depend on session-level `SET schema`. Runtime always opens an in-memory DuckDB process database first. When an accounting database path is provided, runtime attaches that file as the accounting catalog. When no path is provided, runtime creates accounting state in a fixed in-memory accounting schema and emits an operator warning that the data is ephemeral.

Store state must carry the selected accounting catalog and schema. Store and migration SQL must reference accounting objects through fully qualified, correctly quoted three-part names. The implementation must verify DuckDB identifier-quoting rules and use library-provided helpers if duckdb-go exposes appropriate helpers.

The test client has one isolation surface: each normal test receives a unique accounting schema. Tests must not share one accounting schema or depend on randomized object names to avoid collisions.

Normal in-process app tests move out of `internal/runtime` into one package directory: `internal/apptest/runtime`. Basic reusable test helpers belong in `internal/apptest`; scenario-specific helpers that are not broadly reusable stay local to `internal/apptest/runtime`.

## Tasks

### Commit 1: Model Accounting Location Explicitly
- [x] Add a store-owned accounting location type containing catalog/database name and schema name.
- [x] Add identifier validation for catalog and schema names used in qualified SQL.
- [x] Add a DuckDB identifier-quoting helper and fully qualified object-name helper after verifying the correct quoting rules and checking whether duckdb-go provides usable helpers.
- [x] Replace `UseSchema` as an application correctness mechanism with explicit accounting-location setup.
- [x] Define the fixed in-memory accounting schema used when no database path is provided.
- [x] Define the attached accounting catalog name used when a database path is provided.
- [x] Add normal in-process coverage for identifier validation and fully qualified accounting-object routing.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 2: Rework Runtime Database Opening
- [x] Change runtime startup to always open an in-memory DuckDB database first.
- [x] When `DatabasePath` is provided, attach that file as the accounting catalog.
- [x] When `DatabasePath` is not provided, create and use the fixed in-memory accounting schema.
- [x] Allow an omitted database path in configuration validation for serve and migrated in-process app construction.
- [x] Preserve create-if-missing behavior for provided accounting database paths.
- [x] Add an operator-visible warning path for serve mode when no accounting database path is provided.
- [x] Ensure runtime composition passes the accounting location into store constructors.
- [x] Update CLI integration coverage and normal in-process app tests for path-provided and path-omitted startup.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 3: Qualify Migrations And Store SQL
- [x] Update migrations to create schemas, sequences, enum types, tables, and indexes using the selected accounting location.
- [x] Update schema-version reads and writes to use the selected fully qualified location.
- [x] Update all repository constructors to require accounting location state.
- [x] Replace every unqualified accounting table, sequence, and enum type reference in store SQL with quoted three-part names; define indexes with quoted names on qualified tables because DuckDB rejects qualified index names.
- [x] Keep dynamic filter and sort allowlists typed; only object identifiers may be rendered into SQL.
- [x] Remove remaining production dependencies on `SET schema` for accounting behavior.
- [x] Add regression coverage proving the app can operate against a non-default accounting schema.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 4: Keep Test Client Isolation Explicit
- [x] Keep one test-client surface that creates and migrates a unique accounting schema per test.
- [x] After production store qualification is complete, remove any remaining test dependency on `SET schema`.
- [x] Keep direct persistence assertions scoped to the test client's accounting location.
- [x] Measure cold `just test` timing after the schema-qualification and isolation changes.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 5: Move Normal Tests Under Apptest Runtime
- [x] Create the `internal/apptest/runtime` package for normal in-process app tests.
- [x] Move current `internal/runtime/*_test.go` normal tests into `internal/apptest/runtime`.
- [x] Move basic reusable helpers into `internal/apptest`; candidates include ID formatting, typed pointer helpers, path builders, and common JSON response marker types.
- [x] Keep non-basic scenario helpers in `internal/apptest/runtime`; candidates include transaction fixture structs, balanced transaction request builders, search fixture builders, and assertion helpers tied to specific scenario files.
- [x] Avoid multiple scenario subpackages until helper boundaries are stable; Go packages cannot span directories, so each subfolder would require its own imports and shared-helper decisions.
- [x] Ensure `go test ./...` and `just test` discover and run the moved tests.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 6: Update Test Architecture Documentation
- [x] Update `docs/architecture.md` to state that Mina has exactly two app test classes.
- [x] Document that normal in-process app tests live in `internal/apptest/runtime`.
- [x] Document that end-to-end integration tests live under the `cmd/mina` testscript integration suite.
- [x] Document that `internal/apptest` owns reusable harness code for normal in-process app tests.
- [x] Remove or revise any architecture wording that implies normal in-process app tests belong in `internal/runtime`.
- [x] Verification
  - [x] Required docs updated

## Deferred Verification

- [ ] `just test-integration` passes after CLI, real-network REST, process startup, or JSON-over-HTTP behavior changes.
- [ ] Manual smoke commands are run only when a concrete uncovered risk remains, and are added as explicit temporary commands or comments.

## Final Verification

- [ ] `just init` passes on a clean checkout with required local tools available
- [ ] `just fmt` passes
- [ ] `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] Deferred verification completed or explicitly marked not relevant
