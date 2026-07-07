# Plan: Rework prefix-free reopen app-test to in-memory pattern (Kata tjj6)

Replace `TestAccountRejectsHierarchyFQNConflictAfterDatabaseReopen` (file-backed temp DuckDB plus full close/reopen) with the same behavioral scenario expressed through the normal app-test pattern: in-memory DuckDB, per-test schema, generated REST client. Test-only change; no production code.

## Plan Context

- The scenario worth keeping: the create-path prefix-free conflict check fires against rows the serving app instance did not create itself (its reference cache loads them from stored state). Today the test forces this with `apptest.WithDatabasePath` on a temp file and a close/reopen cycle — a lifecycle pattern no other feature app-test uses (`WithDatabasePath`'s only other consumer is the backup tests, which functionally require a file source) and outside the app-test class in `docs/TESTING.md` (in-memory DuckDB, per-test schemas).
- In-memory equivalent: open a second `apptest.New` client with `apptest.WithProcessDB(sharedProcessDB)` and `apptest.WithAccountingSchema(<same schema as the first client>)`. The second app opens the existing schema with cold caches — same observable behavior, normal client creation flow, no file IO. Look at `newSharedClient` in `internal/apptest/runtime/shared_db_test.go` for how per-test schemas are assigned; the second client must reuse the first client's schema, not get a fresh one.
- Fallback: if the runtime cannot cleanly open an existing in-memory schema through the apptest harness (e.g. it insists on creating the schema), delete the test instead and note that in-memory cache-reload coverage arrives with the restructure task's tests. Do not add harness workarounds or production hooks for the sake of this test.

## Tasks

### Task/Commit 1: Rework the reopen test

- [x] Rework `TestAccountRejectsHierarchyFQNConflictAfterDatabaseReopen` in `internal/apptest/runtime/account_test.go` into an in-memory two-client test per Plan Context (create leaf via first client; second client over the same process DB and schema rejects `<leaf>:Child` with 409 conflict envelope); rename the test to describe the behavior (enforcement against stored state) rather than a reopen lifecycle
- [x] Confirm harness/runtime can open an existing in-memory schema cleanly; fallback removal was not needed
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata tjj6
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Test-only rework: express prefix-free enforcement-against-stored-state app-test in-memory via shared process DB and same accounting schema, replacing file-backed reopen pattern; constraints: no production code changes; conform to docs/TESTING.md app-test class"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close Kata tjj6 with evidence
