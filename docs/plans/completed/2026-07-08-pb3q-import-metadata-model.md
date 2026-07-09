# Plan: Raw imported transaction metadata model (kata pb3q)

Add the portable accounting model for raw imported-record metadata before provider integrations exist, so future imports never require migrating accounting data: a provider-neutral `imported_record_metadata` table keyed to journal records, carrying normalized provider fields plus the raw provider payload JSON, with storage-layer access and db-validation coverage. Model only — no import features, no matching/classification, no new feature APIs, no UI.

## Plan Context

- Kata issue: `pb3q`. The fleet decision recorded on the issue resolves the raw-payload unknown: include a raw provider payload JSON column alongside normalized fields. Scope is strictly schema + storage layer + `docs/data-model.md`; feature workflows and APIs stay with the blocked follow-up issues.
- Schema rules: the new table goes in a NEW versioned migration file. Update `PinnedMigrationContentHash` (`internal/store/db_validation.go`) in the same commit as the migration; bump `cmd/mina/testdata/validate/version_assert_behind_latest.sql` accordingly. Keep `docs/data-model.md` aligned in the same commit. All column comments are evergreen field documentation.
- **Agreed table shape (operator-decided; keep names/types unless the schema linter forces otherwise):**

  ```sql
  -- Raw provider metadata captured for imported journal records
  CREATE TABLE imported_record_metadata (
      imported_record_metadata_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
      -- Journal record this imported metadata belongs to.
      record_id INTEGER NOT NULL,

      -- External system namespace that produced this metadata, e.g. plaid.
      external_system TEXT NOT NULL,
      -- Transaction identifier assigned by the external system.
      external_id TEXT,

      -- Raw provider transaction description or comment text.
      description TEXT,
      -- Provider merchant or payee display text.
      merchant_name TEXT,
      -- Provider merchant category code; text to preserve leading zeros.
      mcc_code TEXT,
      -- Primary provider category label when present.
      provider_category TEXT,
      -- Detailed provider category label when present.
      provider_category_detailed TEXT,

      -- Provider record status text, e.g. pending or posted, as reported by the provider.
      provider_status TEXT,
      -- UTC timestamp when the provider authorized the underlying transaction.
      provider_authorized_at TIMESTAMP,
      -- UTC timestamp when the provider posted the underlying transaction.
      provider_posted_at TIMESTAMP,

      -- Raw provider payload for this record as received; NULL when the source provides none.
      raw_payload JSON,

      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      tombstoned_at TIMESTAMP,

      UNIQUE(record_id, tombstoned_at)
  );

  CREATE UNIQUE INDEX imported_record_metadata_active_record_unique
  ON imported_record_metadata ((CASE WHEN tombstoned_at IS NULL THEN record_id ELSE NULL END));
  ```

  Column comments above are the intended `COMMENT ON COLUMN` texts (mirror them in `docs/data-model.md` like other tables).
- Design decisions (settled; do not redesign): metadata is record-level, at most one active row per journal record (tombstone-aware uniqueness like other tables); the table is self-contained provider provenance — it carries `external_system`/`external_id` even though `journal_record` has app-level link fields, because metadata rows are raw provider state while the journal-record fields are app-managed linking values; provider-neutral naming only (no Plaid-specific concepts); `journal_record.memo` stays Mina-authored — nothing here touches journal_record.
- Storage layer: concrete methods on a new store type in `internal/store` (e.g. `imported_metadata.go`) sufficient for future import features: batch create, get by record IDs, tombstone by record IDs. No service package yet (no owning use cases exist); the future import service will define its repository interface — note this in `internal/store/PACKAGE.md` only if it adds an implicit contract worth documenting. Follow existing store conventions (parameter binding, `withTx` for multi-row writes, DuckDB idioms, row scan helpers).
- db-validation: register `imported_record_metadata.record_id` in `validationReferences` (targets `journal_record`; child of a tombstonable parent — follow existing flag patterns so a metadata row on a tombstoned record is judged consistently with sibling rules); extend generic column checks (zero/whitespace/etc.) only where existing patterns apply mechanically. Add e2e validate testdata only if a new invariant is added.
- Testing reality for a model-only slice (per `docs/TESTING.md`: app-tests are REST-only, and this task adds no APIs): behavior coverage comes from migrations applying in every suite, db-validation reference-registry completeness checks, and the `mina_db_validate` e2e script if new invariants/testdata are added. Do NOT add sub-boundary tests (no store/service tests); do NOT add fake production APIs to make testing possible.
- No changes to `api/openapi.yaml`, no generated-client changes, no frontend changes.
- PROJECT_STATE.md: one store-section line (imported record metadata rows stored with raw provider payloads, ahead of provider integrations).

## Tasks

### Task/Commit 1: Schema, data-model doc, and db-validation registration

The migration and everything that keeps validation honest. After this commit the model exists and validates.

- [x] New migration file creating `imported_record_metadata` with the exact shape, comments, and active-record unique index above
- [x] Update `PinnedMigrationContentHash`; bump `version_assert_behind_latest.sql` testdata
- [x] Register `imported_record_metadata.record_id` in the db-validation reference registry with flags consistent with sibling child-of-tombstonable-parent references; extend mechanical column checks where existing patterns apply
- [x] Update `docs/data-model.md` with the table, comments, and index, matching the migration exactly
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in the kata issue `pb3q`
  - [x] Commit changes

### Task/Commit 2: Storage layer and state docs

Minimal store access so future import features consume the model without schema work. After this commit the slice is complete.

- [x] `internal/store` imported-record-metadata store: batch create, get by record IDs, tombstone by record IDs, following existing store conventions and row-scan patterns
- [x] Update `internal/store/PACKAGE.md` only if an implicit contract is added; update `PROJECT_STATE.md` with the one store-section line
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in the kata issue `pb3q`
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "pb3q imported record metadata model: new imported_record_metadata table (record-level, one active row per journal record, provider-neutral normalized fields, raw provider payload JSON column, self-contained external_system/external_id provenance); storage-layer batch create/get/tombstone only; db-validation reference registry + pinned hash updated; docs/data-model.md aligned; model-only — no services, no APIs, no UI, no journal_record changes, no sub-boundary tests"`
- [x] Move this plan to `docs/plans/completed/`
- [x] Close kata issue `pb3q` with evidence (commit SHA, suites run)
