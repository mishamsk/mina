# Plan: Database Validation Command — Fix Pass 1

Implementation-only fix plan for reviewer findings against commits `026c27d..ca1a15e` (db validation command, iteration 1). All defects below carry file:line evidence from live verification and read-only audit. The original plan `docs/plans/2026-07-05-db-validation-command.md` remains the design ground truth; this plan only corrects divergences from it and precisely resolves two ambiguities it left ("layer passed" semantics; validate-command open path).

## Plan Context

- Do not run review-loop during tasks. The single allowed `just review-loop` for this goal was never run (iteration 1 hit the Codex usage limit at that step); it runs exactly once, in this plan's Final Verification.
- Clarified gating semantics (resolves original-plan ambiguity, binding): a layer "passes" when it produced **no error-severity findings**. Warnings and info findings accumulate in the report and never suppress later layers. Validator-internal failures (pin mismatch, registry completeness violation, pristine-reference build failure) abort immediately with exit 2. The registry completeness self-check runs at the start of a full validation, before any layer.
- Clarified validate-command open semantics (binding): `mina db validate` must never write to the target. No `store.Migrate`, no file creation, no schema creation. Attach the database file read-only (DuckDB `ATTACH ... (READ_ONLY)`). New severity decisions extending the original plan's table: missing database file or missing accounting schema → command error, exit 1, message naming the path/schema; `schema_version` behind the latest embedded migration → error finding "pending migrations; run mina migrate first"; legacy-shaped `schema_version` (pre-goose shape, detectable read-only via the existing shape helper) → error finding advising `mina migrate`. The already-specified "database is newer than this binary" error finding must actually be reachable.
- Startup validation scope (binding): startup validation applies to file-backed accounting state only. In-memory accounting state (no `--db`) is created by the running process from the embedded migrations and has no pre-trust problem; skip validation there (this also removes the per-app-test reference-catalog rebuild).

Protect — do not regress (verified working in iteration 1):

- Migration hash pin: pinned constant beside the embed, sha256 over sorted `migrations/*.sql`, verification through the repository interface, mismatch → exit 2 printing pinned+actual.
- Referential registry: all 12 relationships with plan severities; active-rows-only; hidden parents allowed; `UNNEST` array checks.
- Classification layer: pure `ValidatePersistedClassification` wrapper, no write-path changes, raw `transactions.Repository.List` batching with deterministic order.
- Exit codes 0/1/2 and stderr/stdout report split; startup validation config `none|shallow|full` default shallow with `MINA_STARTUP_VALIDATION`; startup abort on error findings for file-backed serve/migrate.
- Testscript pattern: demo seeded once into `demo` schema and never mutated; per-case `mina migrate --schema <case>` + `duckdbexec` fixture + `db validate --schema <case>`; case ordering schema → referential → invariants → classification.
- FQN consolidation into `services.ValidateFQN` (byte-identical behavior); SQL parameter binding and identifier quoting; reference catalog isolation (separate in-memory DB, `database_name`+`schema_name` filtered).

Scope exclusions: no REST surface; do not implement the documented non-checks; no cancelled-record semantics changes (Kata `12v0`); no performance work (Kata `mcsf`); no validation-architecture refactors beyond the listed defects.

## Tasks

### Task/Commit 1: Read-only validate open path and version handling

`runtime.ValidateDatabase` (`internal/runtime/app.go:105-124`) currently runs `store.OpenAppDB` + `store.Migrate` on the target: validating a nonexistent schema creates and migrates it inside the user's file and prints `ok: database is valid` (live-verified); a behind-latest DB gets an unconfirmed migration attempt; the planned "newer than this binary" finding is unreachable. Also fix the in-memory startup-validation waste and the duplicated validate call in `cmd/mina`.

- [x] Add a non-writing open path for validation in `internal/store` (read-only `ATTACH`; no schema creation) and use it from `runtime.ValidateDatabase`; remove the `store.Migrate` call
- [x] Missing database file or missing accounting schema → command error naming the path/schema, exit 1 (no file or schema may be created; verify the read-only attach errors on a missing file rather than creating it)
- [x] Version handling before the schema layer, read-only: `schema_version` behind latest → error finding "pending migrations; run mina migrate first"; above latest → error finding "database is newer than this binary"; legacy shape → error finding advising `mina migrate`
- [x] Skip startup validation when accounting state is in-memory (`internal/runtime/app.go:92-94,131-157`); file-backed startup behavior unchanged
- [x] Remove the duplicate `runtime.Validate`/`ValidateDatabase` double-call in `cmd/mina/main.go` `newDBValidateCommand`
- [x] Testscript cases (respecting existing case ordering): validate nonexistent schema → exit 1, then prove via `duckdbtables`/`duckdbexec` the schema was not created; behind-latest copy schema (delete top `schema_version` row) → "pending migrations" error and no migration applied (version still behind afterwards); newer-than-binary copy schema (bump `version_id`) → "newer than this binary" error
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: Error-only layer gating, completeness timing, composite uniqueness checks

`dbvalidation.Validate` (`internal/services/dbvalidation/dbvalidation.go:224-253`) gates every layer on `len(report.Findings) > 0` regardless of severity: one info finding (extra table) suppresses referential/invariant/classification with exit 0, and `missingUniqueIndexes` is only ever called on a provably empty slice, making the duplicate-active-uniqueness machinery (`internal/store/db_validation.go:516-581`) unreachable dead code. The registry completeness self-check also only runs after a clean schema layer (`dbvalidation.go:233`), letting a schema finding mask an exit-2 condition.

- [x] Gate layers on error-severity findings from prior layers only; warnings/info accumulate and never suppress deeper layers
- [x] Run the registry completeness self-check at the start of full validation, before the schema layer
- [x] Missing-unique-index warnings now actually feed `InvariantFindings`; add the plan-listed composite active-uniqueness checks missing from `activeUniquenessChecks` (`internal/store/db_validation.go:538-571`): `credit_limit_history (account_id, effective_date)`, `exchange_rate (from_currency, to_currency, effective_date)`, `budget (category_fqn, month)`
- [x] Testscript cases: unknown extra table (info) combined with a dangling `journal_record.account_id` in the same case schema → both findings reported, exit 1; drop a unique index and insert a duplicate active row → missing-index warning plus duplicate-active warning, exit 0
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 3: Budget FQN anti-join false positive

`scalarReferenceCounts` (`internal/store/db_validation.go:695-713`) counts any tombstoned parent match: a category deleted and recreated leaves a tombstoned row sharing the active row's fqn, so a budget referencing the perfectly valid active category reports "references tombstoned category". Plan rule: warn only when **no active** category has the fqn.

- [x] Fix the fqn-based reference check: missing = no active parent match; report the tombstoned variant only when a tombstoned match exists and no active match does; ID-based references unchanged
- [x] Testscript case: budget row whose `category_fqn` matches both an active and a tombstoned category → validates clean
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 4: Minor findings — missing check, typed classification error, dead code

Small correctness and hygiene items from the audit; none change layer behavior.

- [x] Implement the plan's memo leading/trailing-whitespace info check (journal_record and transaction_template_record memos)
- [x] Replace `classificationIntent` error-message substring matching (`internal/services/dbvalidation/dbvalidation.go:299-317`) with a typed error from the transactions package: `semanticShapeError` gains an intent-carrying error type surfaced through `ValidatePersistedClassification`; no message-text or write-path behavior change
- [x] Remove dead code: unused `store.MigrationHashCheck` type (`internal/store/db_validation.go:35-43`); no-op severity branch (`dbvalidation.go:396-399`); identical-branch `childMessage` switch (`db_validation.go:735-741`)
- [x] Sequence diff (`dbvalidation.go:476-478`): compare the already-introspected `StartValue`/`MinValue`/`MaxValue` alongside `IncrementBy`/`Cycle`; drop introspected fields that remain unread after this (`ValidationTable.SQL`, `ValidationIndex.SQL`, `ValidationColumn.MinaTable`, `Generated`)
- [x] Fix the stale comment on `LevelFull` (`dbvalidation.go:22-23`) — describe what it does, no wiring history
- [x] Include the offending FQN value in `fqnFindings` messages and report all violating tables (remove the single-finding `break`)
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 5: Package doc contract updates

Implicit contracts introduced in iteration 1 that the owning PACKAGE.md files must state (repo rule: package docs carry implicit contracts).

- [x] `internal/store/PACKAGE.md`: adding or editing a migration requires re-pinning `PinnedMigrationContentHash`; new FK-shaped columns must be added to the validation reference registry or its waiver list; the validator builds a scratch in-memory reference schema
- [x] `internal/runtime/PACKAGE.md`: startup runs configured database validation after migrate for file-backed accounting state only, error findings abort startup; `ValidateDatabase` never writes to the target
- [x] `internal/services/dbvalidation/PACKAGE.md`: correct the "default is shallow" line to reference the appconfig-owned default; reflect the clarified gating semantics
- [x] Verification
  - [x] `just pre-commit` passes
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "db validation command + fix pass: 4 layers gated on error-severity findings only; validate command opens read-only and never writes (missing schema/file = error, behind = run-migrate error, newer-than-binary = error); startup validation file-backed only, config none/shallow/full default shallow; migration hash pin + registry completeness self-check exit 2; budget fqn check requires no-active-parent; no REST by design; cancelled semantics deferred to kata 12v0"`
- [x] Move this plan and `docs/plans/2026-07-05-db-validation-command.md` to `docs/plans/completed/`
