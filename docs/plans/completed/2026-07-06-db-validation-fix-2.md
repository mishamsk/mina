# Plan: Database Validation Command — Fix Pass 2

Implementation-only fix plan closing out reviewer and user feedback on the db validation command after fix pass 1 (branch `db-validation-command`, current HEAD `bdac339`). All items are quality/robustness cleanups against a feature that already passes both test suites and live verification; none change the validation contract. Design ground truth remains `docs/plans/completed/2026-07-05-db-validation-command.md`; fix-pass-1 ground truth remains `docs/plans/completed/2026-07-05-db-validation-fix-1.md`.

## Plan Context

- Sources of these items: direct user review comments on the fix-pass-1 diff (Tasks 1–4), and residual audit findings previously logged to Kata `zvcx` (closed, folded here) plus the two remaining audit nits (Task 5).
- The startup exit-code change from fix pass 1 (`5ed5a97`: validator-internal startup failures exit 2 via `errors.As` on `dbvalidation.IsInternal`) is **approved and retained** — no task reverts it.

Clarified decisions (binding):

- Task 1 removes the wrapper by exporting the original function, not by adding indirection. `transactions.validateTransactionClassification` becomes exported `ValidateTransactionClassification`; the trivial `ValidatePersistedClassification` wrapper is deleted; all three callers (two in `transactions.go` bulk paths, one in `dbvalidation.go`) call the exported name. No behavior change; `SemanticShapeError` typed error is unchanged.
- Task 2 replaces the hand-rolled per-fixture data copy with DuckDB's own `COPY FROM DATABASE` (the exact idiom `internal/store/backups.go` uses), which produces a byte-faithful catalog replica — structure and data — in one statement. This is empirically verified: a `COPY FROM DATABASE` replica of the seeded demo validates clean (all enums, generated columns, indexes, PK, defaults, comments, and `schema_version` preserved). Because `COPY FROM DATABASE` is catalog-level, each case becomes its own database file cloned from a single seeded demo file (not a schema inside one file), which also removes the per-case `mina migrate --schema <case>` step. The seeded schema name is preserved by the copy, so cases keep exercising the `--schema` override. Each fixture then carries only its break statement(s).
- Task 4 targets the two validator-internal (exit-2) tripwires that only surface when a developer changes migrations or the schema. Both get a full remediation paragraph, because whoever hits them is mid-development and needs to be told exactly what to do, not just that something mismatched.

Protect — do not regress (verified working through fix pass 1):

- Read-only validate open path (no `store.Migrate`, no file/schema creation; missing file/schema → exit 1; behind/newer/legacy version → error findings; byte-identical file after validate).
- Error-only layer gating; warnings/info accumulate; internal failures exit 2; hash pin; 12-entry referential registry with severities; composite active-uniqueness checks; budget-fqn no-active-parent semantics.
- Classification batching over the transactions repository (batch 100, deterministic order); startup validation file-backed only, config `none|shallow|full` default shallow.
- Testscript still seeds the demo exactly once and never mutates the seeded file; case ordering schema → referential → invariant → classification; every finding-severity assertion and exit code (0/1/2) and the stderr/stdout split preserved; the `--schema` override stays exercised; the read-only/version/startup/internal-error cases from fix pass 1 keep their assertions.
- SQL parameter binding and identifier quoting; reference-catalog isolation in a separate in-memory DB; `services.ValidateFQN` behavior; API error strings and HTTP status for classification failures.

Scope exclusions: no REST surface (deliberate carve-out); no new validation checks beyond the residuals below; no cancelled-record semantics (Kata `12v0`); no performance work (Kata `mcsf`).

## Tasks

### Task/Commit 1: Remove the trivial classification wrapper

`internal/services/transactions/classification.go:26-29` adds `ValidatePersistedClassification` as a one-line pass-through to the private `validateTransactionClassification`. Export the original instead.

- [x] Rename `validateTransactionClassification` → `ValidateTransactionClassification` (exported), keep its doc comment (make it evergreen, describing what it validates rather than "for validation")
- [x] Delete `ValidatePersistedClassification`
- [x] Update callers: `internal/services/transactions/transactions.go:899,937` and `internal/services/dbvalidation/dbvalidation.go:314`
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: Robust test fixtures via a DuckDB `COPY FROM DATABASE` clone

Every fixture under `cmd/mina/testdata/validate/` hand-lists each table's non-generated columns to copy demo data (11 INSERT statements per file), and `schema_drop_column.sql` hand-writes an entire `CREATE TABLE journal_record` minus one column. Both drift the moment the accounting model changes. Replace the hand-rolled copy with a `COPY FROM DATABASE` clone (the `internal/store/backups.go` idiom) so each case is a faithful replica file and every fixture carries only its break. All specifics below are empirically verified against the real migrated demo schema.

- [x] Add a testscript helper command in `cmd/mina/cli_smoke_test.go` (alongside `duckdbexec`) that clones a DuckDB database file to a fresh file, e.g. `duckdbclone <src-db> <dst-db>`: open an in-memory DuckDB, `ATTACH '<src>' AS src (READ_ONLY)`, `ATTACH '<dst>' AS dst`, `COPY FROM DATABASE src TO dst`, detach. This yields a structurally faithful replica (verified: the clone validates clean)
- [x] Restructure `cmd/mina/testdata/script/mina_db_validate.txt`: seed the demo once into a named schema (`mina serve --demo --db $WORK/demo.db --schema demo …`, health-check, SIGINT; the seeded file is read-only from here on). Per case: `duckdbclone $WORK/demo.db $WORK/<case>.db`, `duckdbexec $WORK/<case>.db <case>.sql`, then `mina db validate --db $WORK/<case>.db --schema demo`. Keep case ordering, every finding assertion, and every exit-code assertion. Drop the now-unneeded per-case `mina migrate --schema <case>` step
- [x] Rewrite every fixture in `cmd/mina/testdata/validate/` to contain only its break statement(s) against schema `demo`, no data-copy INSERTs (uniform across fixtures — they differ only by the break)
- [x] `schema_drop_column` fixture becomes exactly (verified to produce the single finding `error: schema: missing column journal_record.memo` and nothing else): `DROP INDEX demo.journal_record_transaction_id_idx;` then `ALTER TABLE demo.journal_record DROP COLUMN memo;` then recreate the index `CREATE INDEX journal_record_transaction_id_idx ON demo.journal_record (transaction_id);`. (DuckDB blocks `ALTER … DROP COLUMN` while the table has a secondary index; dropping and restoring it keeps the finding set to just the missing column. `CREATE TABLE AS SELECT * EXCLUDE(col)` was rejected — it loses types/constraints/enums/PK and emits ~30 cascade findings; `* EXCEPT` is not valid syntax in this DuckDB.)
- [x] Preserve the read-only/version/startup/internal-error cases from fix pass 1 within the new file-per-case structure (nonexistent schema/file, behind/newer/legacy version, startup `full`/`none`, etc.)
- [x] Confirm the seeded demo file is created once and never mutated (clones only read it via `READ_ONLY` attach)
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 3: Local transaction-reader interface in dbvalidation

`internal/services/dbvalidation/dbvalidation.go:162,166` depends on the whole `transactions.Repository`, but only calls `List` (line 304). Depend on a minimal locally-defined interface instead; composition still passes the concrete store repository.

- [x] Define a minimal interface in `dbvalidation` exposing only the method the classification pass needs (`List(context.Context, transactions.ListOptions) (transactions.ListResult, error)`); name it in reader terms
- [x] Change the `Service` field and `NewService` parameter to that interface; the concrete transaction store passed in `internal/runtime` is unchanged (structural satisfaction)
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 4: Full developer guidance on validator-internal tripwires

The two exit-2 messages tell a developer only that something mismatched. `internal/services/dbvalidation/dbvalidation.go:192-196` (embedded migration hash mismatch) and `:240-242` (reference registry incomplete) fire only when someone edits migrations or adds an FK-shaped column during development. Give each a full remediation paragraph.

- [x] Hash mismatch: expand to a paragraph explaining the embedded migrations changed since the validator was pinned; the developer must review whether the schema reference registry, waivers, and severity rules still cover the new/edited schema, then update `internal/store.PinnedMigrationContentHash` to the printed actual hash; include the pinned and actual hashes
- [x] Registry incompleteness: expand to a paragraph naming the offending FK-shaped column(s) and instructing the developer to either register the reference in the validation reference registry or add it to the waiver list with justification, per the completeness convention documented in `internal/store/PACKAGE.md`
- [x] Keep both as `InternalError` (exit 2); no behavior change beyond message text
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 5: Residual correctness and robustness (Kata zvcx + audit nits)

Small deviations from the audit, none reachable in a normally Mina-written database.

- [x] Memo whitespace info check (`internal/store/db_validation.go:465,475`): broaden the SQL trim set to match Go `strings.TrimSpace` semantics (add vertical tab, form feed, U+0085, U+00A0 via `chr()`), so the validator's memo check and the write-path rule (`strings.TrimSpace(*memo) != *memo`) agree
- [x] Completeness-check ordering (`dbvalidation.go`): run the reference build and registry completeness self-check before the version early-returns (`:218-234`), so a version-mismatch finding can no longer mask a latent exit-2 registry-incompleteness condition; the fix-pass-1 wording "at the start of a full validation, before any layer" then holds literally
- [x] Structured unique-index metadata (`dbvalidation.go:335-357`): pass missing/mismatched unique-index names from the schema layer to the invariant duplicate-active check via a typed field on the finding (or a returned value), not by parsing finding message text
- [x] Unsupported `schema_version` shape (`internal/store/db_validation.go:85`): surface as a schema error **finding** (consistent with legacy/behind/newer handling) rather than a bare command error with no report line
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "db validation command, final polish pass. Intent: an offline pre-trust integrity checker for accounting DB files created/edited outside Mina, since reference integrity is service-enforced only (no DB foreign keys). Deliberate carve-outs — NO REST API by design (validation is for the pre-server moment; a running server already implies a healthy migrated DB); tests are integration-only (testscript in cmd/mina/testdata), which is plan-sanctioned because there is no REST surface. This pass: removed a trivial classification wrapper (exported the original); made testscript fixtures robust via a Go schema-data-copy helper so fixtures carry only break statements; dbvalidation depends on a local minimal transaction-reader interface not the full repo; validator-internal exit-2 tripwires (migration hash mismatch, registry incompleteness) give full developer remediation guidance; residual fixes — memo trim charset parity with strings.TrimSpace, registry completeness check runs before version findings, unique-index names passed structurally, unsupported schema_version shape reported as a finding. Do not flag the absent REST endpoint or the integration-only test strategy — both are intentional and documented in docs/architecture.md."`
- [x] Address any review-loop findings directly (do not re-run review-loop)
- [x] Move this plan to `docs/plans/completed/`
