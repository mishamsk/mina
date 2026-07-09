# Plan: Generic record link model for refunds and reimbursements (kata 139j)

Add the pairwise `record_link` model associating settlement journal records (refunds, business-expense reimbursement payouts) with the origin records they settle, so dangling/unmatched records are detectable before reporting and reconciliation features exist. Model only — schema + storage layer + `docs/data-model.md`; no linking workflow, no unmatched-record reports, no feature APIs (kata `x5yz` and `b1ws` build on this).

## Plan Context

- Kata issue: `139j`. The issue body carries the panel-agreed, authoritative DDL (`record_link_type` enum + `record_link` table + active-pair unique index) — read it with `kata show 139j --agent` and implement exactly. Comments in the final DDL must be evergreen field documentation (the issue's comments already are; keep them).
- Schema rules: the new enum + table go in a NEW versioned migration file (the issue's "no migrations" note forbids ALTER/upgrade statements against existing tables, not a new-table migration file — this matches how `transaction_template`, recurring, and imported-metadata tables landed). No changes to any existing table. Update `PinnedMigrationContentHash` (`internal/store/db_validation.go`) in the same commit; bump `cmd/mina/testdata/validate/version_assert_behind_latest.sql`. Keep `docs/data-model.md` aligned in the same commit.
- Design decisions (settled by the issue + panel; do not redesign): generic pairwise links cover both `REFUND` and `REIMBURSEMENT`; record-level; M-M expressed as multiple rows; NO stored amounts (derived from linked records); links are pure metadata — balances/reports unaffected; no FKs, no CHECK constraints, no lookup indexes; `origin != settlement` and record-kind/intent sanity are future service validation (x5yz/b1ws), not schema.
- **Tombstoning interaction (operator-decided at planning time, per the issue):** db-validation treats an ACTIVE link referencing a tombstoned journal record as a finding — register both `record_link.origin_record_id` and `record_link.settlement_record_id` in `validationReferences` targeting `journal_record` WITHOUT `allowTombstonedParent` (strict, like `journal_record → category`): links are cross-aggregate metadata, not owned provenance, so a live link to a tombstoned record is a real inconsistency. Cascade-tombstoning of links when records are tombstoned is owned by the future linking service (`x5yz`/`b1ws`); nothing in this task touches the transactions service.
- db-validation additions: the two reference registrations above (dangling references to nonexistent records are findings per the standard registry behavior — this satisfies the issue's "mina db validate reports dangling link references"); active-pair uniqueness check mirroring existing composite active-uniqueness patterns (like `exchange_rate`'s pair check); e2e validate testdata following the existing `ref_*`/`inv_*` patterns, registered in `mina_db_validate.txt`.
- Storage layer: concrete methods on a new store type in `internal/store` (e.g. `record_links.go`), mirroring the imported-metadata store shape: batch create, get by record IDs (returning links where the record participates on either side), tombstone by link IDs. Standard conventions: parameter binding, `withTx` for multi-row writes, row-scan helper, unique-constraint → `ErrConflict` mapping. No service package yet — the future linking service defines its repository interface.
- Testing reality for a model-only slice (per `docs/TESTING.md`): no APIs exist, so no app-tests; coverage comes from migrations applying in every suite, db-validation registry completeness, and the `mina_db_validate` e2e testdata. Do NOT add sub-boundary tests or fake production APIs.
- No changes to `api/openapi.yaml`, no generated clients, no frontend, no services.
- PROJECT_STATE.md: one store-section line (pairwise record links stored for refund and reimbursement settlement, metadata-only).

## Tasks

### Task/Commit 1: Schema, data-model doc, and db-validation

The migration and validation coverage. After this commit the model exists and validates.

- [x] New migration file creating the `record_link_type` enum and `record_link` table with the exact issue DDL (comments, `UNIQUE(origin_record_id, settlement_record_id, tombstoned_at)`, active-pair unique expression index)
- [x] Update `PinnedMigrationContentHash`; bump `version_assert_behind_latest.sql` testdata
- [x] Register `record_link.origin_record_id` and `record_link.settlement_record_id` in the db-validation reference registry (strict — no tombstoned-parent allowance); add the active-pair uniqueness check following existing composite patterns
- [x] e2e validate testdata: dangling link reference finding, tombstoned-record link finding, duplicate active pair finding — registered in `mina_db_validate.txt` per existing patterns
- [x] Update `docs/data-model.md` with the enum, table, comments, and index, matching the migration exactly
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in the kata issue `139j`
  - [x] Commit changes

### Task/Commit 2: Storage layer and state docs

Minimal store access for the future linking service. After this commit the slice is complete.

- [x] `internal/store` record-link store: batch create, get by record IDs (either side), tombstone by link IDs, following existing store conventions
- [x] Update `internal/store/PACKAGE.md` only if an implicit contract is added; update `PROJECT_STATE.md` with the one store-section line
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in the kata issue `139j`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "139j record link model: new record_link_type enum + pairwise record_link table exactly per panel-agreed issue DDL (record-level, M-M as rows, no stored amounts, no FKs/CHECKs/lookup indexes); strict db-validation references for origin/settlement to journal_record (tombstoned parent = finding; cascade ownership deferred to linking service); active-pair uniqueness check + e2e validate testdata; storage-layer batch create/get-by-record/tombstone only; docs/data-model.md aligned; model-only — no services, no APIs, no UI, no existing-table changes, no sub-boundary tests"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close kata issue `139j` with evidence (commit SHA, suites run)
