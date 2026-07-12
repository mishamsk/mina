# Plan: Fold additive migrations into the original create migrations (Misha directive 2026-07-12)

Two recent fleet tasks added new numbered ALTER migrations instead of editing the entity-creating migrations in place. Fold them back.

## Plan Context

- EXPLICIT CONSTRAINT (Misha, 2026-07-12): Mina is pre-production and the migration set is EVERGREEN — migrations are expected to NOT be additive. There are no existing users, so editing the original create migrations in place is safe and required. Schema changes fold into the migration that creates the entity; ALTER statements are avoided entirely.
- Files to fold and delete:
  - `internal/store/migrations/00014_add_member_is_hidden.sql` → fold `is_hidden BOOLEAN NOT NULL DEFAULT FALSE` (declared inline in the column list, matching the style of the other flag columns) plus its `COMMENT ON COLUMN member.is_hidden ...` into `internal/store/migrations/00004_create_member.sql`; DELETE 00014. The 00014 index drop/recreate dance disappears entirely — `member_active_name_unique` stays exactly as 00004 already defines it.
  - `internal/store/migrations/00015_add_category_tag_is_featured.sql` → fold `is_featured BOOLEAN NOT NULL DEFAULT FALSE` plus comments into `00002_create_category.sql` and `00003_create_tag.sql` (placed next to `is_hidden`, matching the account migration's style at `00005_create_account.sql:11`); DELETE 00015.
- Follow-ups required by the fold:
  - Recompute `PinnedMigrationContentHash` (`internal/store/db_validation.go:23`) per the established procedure/helpers in that file. `LatestMigrationVersion` is derived dynamically from the embedded files — no code change; it becomes 13.
  - `cmd/mina/testdata/validate/version_assert_behind_latest.sql`: `= 14` → `= 12` (latest − 1).
  - `docs/data-model.md` already declares these columns inline — verify unchanged, do not touch.
  - `cmd/mina/testdata/validate/schema_drop_unique_constraint.sql` already includes `is_hidden` inline — verify unchanged.
  - Resulting schema must be byte-equivalent in effect: same columns, same types/defaults, same comments, same indexes. No behavior change anywhere else; do not touch services, stores, API, or frontend.
- Verification: `just test` (app-tests run migrations on in-memory DBs), `just pre-commit`, `just test-integration` (db create/validate flows exercise versions and the pinned hash).
- No ground-truth doc edits. No PROJECT_STATE.md change.

## Tasks

### Task/Commit 1: Fold 00014 and 00015 into the create migrations

- [x] Apply the folds and deletions per Plan Context; recompute the pinned hash; fix the version fixture.
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
- [x] Run `just review-loop "Evergreen migrations fold (Misha directive): additive migrations 00014/00015 folded into the original create migrations (member.is_hidden into 00004, category/tag.is_featured into 00002/00003), files deleted, pinned migration hash recomputed, validate version fixture adjusted; pre-production evergreen policy — migrations must not be additive, no ALTERs, no existing users; schema effect byte-equivalent, zero behavior changes"`
- [x] Move this plan to `docs/plans/completed/`
