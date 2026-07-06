# Plan: Database Validation Command — Fix Pass 3

Implementation-only micro fix plan resolving Kata `1sfw`: the unique-constraint schema check that a review loop added during fix pass 2 is correct but (a) its fixture reintroduced the full-table DDL boilerplate that fix pass 2 removed, and (b) it reports a missing unique constraint as an error while a missing unique index is a warning. This pass makes the two consistent and shrinks the fixture. Design ground truth remains `docs/plans/completed/2026-07-05-db-validation-command.md`.

## Plan Context

- **Do not run review-loop.** This plan has no review-loop step; its Final Verification is the two test suites plus pre-commit only. Any residual review comments are folded here already.
- Why a missing unique *constraint* should be a warning, not an error: in Mina's schema, active-row uniqueness is enforced by the partial unique *index* (e.g. `member_active_name_unique`), not by the table `UNIQUE(name, tombstoned_at)` constraint — DuckDB treats NULLs as distinct, so that constraint does not prevent two active rows sharing a value. So a missing unique constraint is structural drift that does not by itself allow duplicate active rows, and it should not abort the schema layer. The missing unique *index* case remains a warning that additionally triggers the data-level duplicate-active check; the missing constraint does not need that data check. Both being warnings is the consistent, correct model.
- The constraint check itself (`diffConstraints` in `internal/services/dbvalidation/dbvalidation.go`, `introspectValidationConstraints` in `internal/store/db_validation.go`) is kept — it closes a real gap (table-level `UNIQUE` constraints were previously unvalidated). Only its severity and fixture change, plus a PK de-duplication.
- Fixture approach (verified live): DuckDB cannot drop the unnamed unique constraint (`ALTER TABLE … DROP CONSTRAINT`/`DROP UNIQUE` are unimplemented), so the table must be rebuilt. Rebuild the smallest, most stable constrained table — `member` (5 columns, no column comments) — instead of `category` (10 columns, 6 comments). Because the finding is now a warning, the schema layer no longer aborts and the referential layer runs, so the rebuild must preserve member data (81 of 272 demo journal records reference `member_id`) to avoid spurious dangling-member findings.

Protect — do not regress: everything verified through fix pass 2 (read-only open path, error-only gating, hash pin exit 2, registry + severities, budget-fqn, classification batching, startup file-backed-only, clone-based fixtures, demo immutability, all existing finding/exit assertions). Only the constraint severity, the constraint fixture, and the PK double-report change.

Scope exclusions: no other checks or severities touched; no REST surface; no cancelled-record semantics (Kata `12v0`); no performance work (Kata `mcsf`).

## Tasks

### Task/Commit 1: Missing unique constraint is a warning; primary key reported once

- [x] `internal/store/db_validation.go` `introspectValidationConstraints`: narrow the query to `constraint_type = 'UNIQUE'` only (drop `'PRIMARY KEY'`), so the validation constraint catalog holds only unique constraints. Primary-key presence is already owned by `diffTables` (`ref.HasPrimaryKey && !got.HasPrimaryKey` → error), so this removes the duplicate "missing primary key constraint …" finding from `diffConstraints`
- [x] `internal/services/dbvalidation/dbvalidation.go` `diffConstraints`: change the missing-constraint finding from `SeverityError` to `SeverityWarning` (the unexpected-constraint finding stays a warning); simplify `missingConstraintMessage`/related helpers if the primary-key branch is now dead
- [x] `internal/services/dbvalidation/PACKAGE.md`: add a one-line note that a missing table `UNIQUE` constraint is a warning (active-row uniqueness is guarded by the partial unique index, not the constraint) and that primary-key presence is reported by the table diff
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: Shrink the constraint fixture to a data-preserving member rebuild

- [x] Rewrite `cmd/mina/testdata/validate/schema_drop_unique_constraint.sql` to rebuild `member` minus its `UNIQUE(name, tombstoned_at)` constraint while preserving structure and data (verified to yield exactly one finding). Exact content:
  ```sql
  USE demo;
  DROP INDEX member_active_name_unique;
  CREATE TABLE member_rebuilt (
      member_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      tombstoned_at TIMESTAMP
  );
  INSERT INTO member_rebuilt SELECT * FROM member;
  DROP TABLE member;
  ALTER TABLE member_rebuilt RENAME TO member;
  CREATE UNIQUE INDEX member_active_name_unique ON member ((CASE WHEN tombstoned_at IS NULL THEN name ELSE NULL END));
  ```
  (`USE demo` matters: it makes the unqualified `nextval('primary_key_gen_seq')` default store unqualified so it matches the reference and produces no default-mismatch finding.)
- [x] Update the case assertion in `cmd/mina/testdata/script/mina_db_validate.txt`: it now succeeds with a warning — replace `! exec … / stderr 'error: schema: missing unique constraint \(fqn, tombstoned_at\) on table category'` with `exec … / stdout 'warning: schema: missing unique constraint \(name, tombstoned_at\) on table member'`
- [x] Confirm the case still validates to exactly that one warning (no default mismatch, no dangling-member referential findings) and the demo file remains unmutated
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
- [x] Move this plan to `docs/plans/completed/`
