# Plan: Remove `schedule_class` enum generated column and all DuckDB schema-selection workarounds — Kata issue `r6k6`

Kill `recurring_definition.schedule_class` (an enum-typed DuckDB GENERATED column) and derive the schedule class in Go from the already-fetched `schedule_rule` JSON. Then remove every workaround that column spawned: per-connection `USE` initialization, backup/testscript `USE` hacks, the app-test harness reach-through into `internal/store`, and all caveat comments. Backend only; API responses stay byte-identical.

## Plan Context

- Ground truth: `docs/architecture.md`, `docs/recurring-transactions-semantics.md`, `docs/TESTING.md`. Read before starting. Never edit ground-truth docs.
- Root cause (operator-verified empirically 2026-07-11 with a DuckDB probe; treat as fact):
  - DuckDB resolves the ENUM TYPE of a GENERATED column by unqualified name against the connection's CURRENT catalog/schema at bind time. With `recurring_definition.schedule_class recurring_schedule_class GENERATED ALWAYS AS (...) VIRTUAL`, any connection that has not `USE`-d the accounting schema fails: `SELECT` of that column, `SELECT *` on the table, `INSERT` into the table, and `COPY FROM DATABASE`.
  - NOT affected (probe-verified on a fresh pooled connection with no `USE`): unqualified `nextval('primary_key_gen_seq')` defaults, plain enum columns (`recurring_occurrence.status` is fine and stays), TEXT/INTEGER generated columns (all `parent_fqn`/`name`/`level` hierarchy columns are fine and stay), `COPY FROM DATABASE` once no enum generated column exists, and `DETACH` of a non-current database.
  - Therefore the comment in `internal/store/connection_init.go` claiming "unqualified sequence defaults" need connection-time schema selection is FALSE, and once the column is gone, NO per-connection schema selection is needed at all.
- Workaround inventory to remove (complete list):
  - `internal/store/connection_init.go` — whole file (connection-init `USE`, added on this branch).
  - `internal/store/appdb.go` — `connInit` field and the `connInit` parameters threaded through `openAppDBWithAttach`/`openAppDB`.
  - `internal/store/db.go` — `open()` reverts to plain `sql.Open` with the blank duckdb driver import (drop the `duckdb.NewConnector` init-callback path). KEEP `detachDatabase`'s `USE memory.main`: that is DETACH-of-current-database safety for the accounting DB itself (migration legitimately leaves the pool's connection in the accounting schema), not part of this bug.
  - `internal/store/migrations.go` — `enableAccountingConnectionInit` call sites revert to pool-level `useAccountingLocation`. The `USE` during migration STAYS: goose migrations run unqualified DDL in the selected schema by design.
  - `internal/store/backups.go` — `copyDatabase`: remove the `USE`-before-`COPY` and its enum caveat comment (COPY works without USE once the column is gone). `detachTarget`: remove the `USE memory.main` before detaching the target and the restore-accounting-after-detach step added on this branch — the backup target is never the current database.
  - `cmd/mina/cli_smoke_test.go` — `duckdbclone` testscript helper: remove `"USE src.demo"` and `"USE memory.main"` statements and the enum caveat comment (`memory.main` is already current on that fresh handle).
  - `internal/apptest/connection_init.go` and `internal/apptest/runtime/connection_init_test.go` — delete both. The apptest harness reaching into `internal/store` violates the REST-boundary testing rule; connection handling is a DB concern. The REST-level additions to `internal/apptest/runtime/recurring_definition_test.go` from the same branch are legitimate and STAY.
  - `internal/store/PACKAGE.md` — remove the invariant line "AppDB-owned DuckDB connections select the accounting schema at connection initialization ...". The line about hierarchy fields read from generated virtual columns STAYS.
- Replacement design (operator-fixed; do not relitigate):
  - Migration `internal/store/migrations/00011_create_recurring_transactions.sql`: drop `CREATE TYPE recurring_schedule_class`, the `schedule_class` column block, and its `COMMENT ON COLUMN` line. `recurring_occurrence_status` and the plain `status` column stay. Editing an embedded migration requires re-pinning `PinnedMigrationContentHash` in `internal/store/db_validation.go`.
  - `internal/store/recurring.go`: remove `CAST(schedule_class AS VARCHAR)` / `CAST(d.schedule_class AS VARCHAR)` from all five query sites and the `scheduleClass` scan target; in the row conversion (currently `definition.ScheduleClass = recurring.ScheduleClass(strings.ToLower(scheduleClass))`), derive instead from the already-scanned `scheduleRule` string: unmarshal `{"kind": ...}`; `kind == "interval"` → `recurring.ScheduleClassInterval`, else `recurring.ScheduleClassDateRule` — exactly the dropped SQL CASE semantics (`schedule_rule` is service-validated, so `kind` is always present; the else-branch mirrors the CASE ELSE).
  - API surface unchanged: `schedule_class` stays in responses with the same `interval`/`date_rule` values, now Go-derived. No OpenAPI change, no client regeneration, no frontend change.
- Boundary enforcement: `internal/store` is imported by the apptest harness ONLY in the file being deleted (verified). Add a depguard rule to `.golangci.yml` (shape-match the sibling rules, `list-mode: lax`) with files `internal/apptest/*.go`, `internal/apptest/**/*.go`, `"**/internal/apptest/*.go"`, `"**/internal/apptest/**/*.go"` denying `github.com/mishamsk/mina/internal/store` with a desc like "the app-test harness drives the app through runtime composition and the REST client, never the store directly". (Runtime `*_test.go` files are already covered by `normal-app-test-boundaries`.)
- No replacement regression test: the schema-sensitive construct no longer exists, and recurring behavior is asserted at the REST boundary by existing app-tests and suites. Do NOT add any test that reaches into `internal/store` from apptest.
- Existing accounting database files created from this branch still contain the old column/type and will fail pristine-catalog validation after this change; that is accepted pre-production policy (recreate them; demo data is recreated per run). Do not add migration-compat shims.
- `PROJECT_STATE.md`: do not update (no business-requirement progress). Package docs: update `internal/store/PACKAGE.md` as scoped above in the same commit as the behavior change.

## Tasks

### Task/Commit 1: Drop the generated column; derive schedule class in Go

- [x] Edit migration `00011_create_recurring_transactions.sql`: remove `CREATE TYPE recurring_schedule_class`, the `schedule_class` generated column, and its column comment.
- [x] Re-pin `PinnedMigrationContentHash` in `internal/store/db_validation.go`.
- [x] `internal/store/recurring.go`: remove `schedule_class` from all five queries and the scan; derive `Definition.ScheduleClass` from `schedule_rule` JSON `kind` per the design above.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Commit changes

### Task/Commit 2: Remove connection-init machinery and store-level USE workarounds

- [x] Delete `internal/store/connection_init.go`; remove `connInit` from `internal/store/appdb.go` (field + both call paths + `openAppDB` parameter).
- [x] `internal/store/db.go`: revert `open()` to plain `sql.Open` with the blank driver import; keep `detachDatabase` as is.
- [x] `internal/store/migrations.go`: replace `enableAccountingConnectionInit` call sites with pool-level `useAccountingLocation`; migration-time `USE` behavior unchanged.
- [x] `internal/store/backups.go`: remove `USE`-before-`COPY` + enum caveat comment in `copyDatabase`; remove the pre-detach `USE memory.main` and post-detach accounting restore in `detachTarget`.
- [x] Revert the `withSQLTx` closure wrapper in `internal/store/tx.go` if nothing still needs it.
- [x] Update `internal/store/PACKAGE.md`: drop the connection-initialization invariant line.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (database backup + validation tests exercise COPY/DETACH paths)
  - [x] Commit changes

### Task/Commit 3: Remove the apptest reach-through and the testscript USE hack; enforce the boundary

- [x] Delete `internal/apptest/connection_init.go` and `internal/apptest/runtime/connection_init_test.go` (keep the REST-level `recurring_definition_test.go` additions).
- [x] `cmd/mina/cli_smoke_test.go`: remove the two `USE` statements and the enum caveat comment from `duckdbclone`.
- [x] `.golangci.yml`: add the depguard rule denying `github.com/mishamsk/mina/internal/store` for `internal/apptest` harness files per the design above; confirm `just pre-commit` runs it clean and that a deliberate scratch violation is caught (do not commit the scratch check).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes (CLI smoke testscripts exercise `duckdbclone`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes (recurring review flows exercise materialization over HTTP)
- [x] Commit final changes
- [x] Run `just review-loop "Remove recurring schedule_class enum generated column (kata r6k6): DuckDB resolves generated-column enum types against the connection's current schema, so the column is dropped from migration 00011 (hash re-pinned) and ScheduleClass is derived in Go from schedule_rule kind; removed connection-init USE machinery, backup and duckdbclone USE workarounds, apptest reach-through test, and caveat comments; added depguard rule denying internal/store to the apptest harness. Constraints: API responses unchanged; migration-time USE and detachDatabase USE memory.main stay; no store-reaching tests; no ground-truth doc edits."`
- [x] Move this plan to `docs/plans/completed/`
