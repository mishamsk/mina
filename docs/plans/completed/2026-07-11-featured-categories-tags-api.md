# Plan: Featured flag for categories and tags — model + API (Kata 18w4)

Add portable-state `is_featured` to Category and Tag, mirroring the Account precedent: column + migration, service/store support, and create/update/list API exposure with an `is_featured` list filter. Backend/API only — the featured UX surface (star toggle/indicator) is explicitly follow-up work (`f9c5` reserves the indicator slot; no UI in this task).

## Plan Context

- Kata issue: `18w4` — "Featured flag for categories and tags (model + API; UX surface later)".
- Ground truth: `docs/hierarchy-semantics.md:102-111` — `is_featured` is LEAF state; groups have no stored flags; "Featuring applies to leaves only. Featuring a group ... is unsupported." Therefore: no group derivation for featured, and NO by-path featured bulk setter (the by-path hidden setters are a hidden-only group convenience — do not mirror them for featured). Do not edit `docs/hierarchy-semantics.md`.
- Account precedent to mirror:
  - Column: `is_featured BOOLEAN NOT NULL DEFAULT FALSE` with comment "Marks active rows for prominent UI/account-picker placement without changing accounting semantics." (`internal/store/migrations/00005_create_account.sql:11,35`, `docs/data-model.md:163,199`).
  - API: response schema `is_featured` (required, like Account), `CreateAccountRequest.is_featured` (optional, default false), `UpdateAccountRequest.is_featured` (optional), `listAccounts` `is_featured` boolean query filter (`api/openapi.yaml:771`).
  - Service: `IsFeatured` on the domain struct and `CreateInput`, `*bool` on update input, list filter option.
- Current category/tag shapes: `CreateCategoryRequest` (`api/openapi.yaml:3015`) and `CreateTagRequest` (`:3792`) have `is_hidden` only; `UpdateCategoryRequest` (`:4676`) and `UpdateTagRequest` (`:4721`) REQUIRE `is_hidden` and have nothing else. To mirror the account update contract, make the category/tag update requests account-style: both `is_hidden` and `is_featured` optional, service-validated "at least one field is required" (mirroring `accounts.UpdateMutable`, `internal/services/accounts/accounts.go:320-370`). Evolve the existing category/tag update use cases (`UpdateHidden` in `internal/services/categories/categories.go:268` and the tags equivalent) into account-style mutable updates — rename/reshape rather than stacking a parallel method; update the by-id handler mapping accordingly. The by-path HIDDEN bulk setters (`setCategoryHiddenByPath`, `setTagHiddenByPath`) stay exactly as they are.
- Migration: one new `internal/store/migrations/00015_*.sql` adding `is_featured` to BOTH `category` and `tag` (+ the account-style column comments). DuckDB may require dropping/recreating dependent unique indexes around ALTER TABLE — follow the pattern in `00014_add_member_is_hidden.sql`. Update `PinnedMigrationContentHash` (`internal/store/db_validation.go:23`), `LatestMigrationVersion` (`db_validation.go:54`), the validate testdata expecting the previous version (`cmd/mina/testdata/validate/version_assert_behind_latest.sql`), and any validate fixture that rebuilds category/tag tables (mirror what 00014 did for member in `cmd/mina/testdata/validate/`).
- Docs: update `docs/data-model.md` category and tag tables (column + comment) in the migration commit. Update `internal/services/categories/PACKAGE.md` and `internal/services/tags/PACKAGE.md` implicit contracts (featured is leaf-only portable state; no group derivation). No PROJECT_STATE.md capability change beyond extending the existing reference-data line if it names featured metadata (currently says "account featured metadata" — extend to categories/tags).
- Store: `internal/store/categories.go` / `tags.go` — `is_featured` in INSERT, SELECT columns, scans, list filter (`is_featured = ?` only when the filter option is set), and the reshaped update method. Reference caches that carry rows must include the new field where the account pattern does.
- Featured does not affect picker exclusion, hidden semantics, reference validation, or classification — it is display metadata only. Do not add featured-based validation anywhere.
- Tests: app-tests per `docs/TESTING.md` (read first) in `internal/apptest/runtime/category_test.go` and `tag_test.go`, mirroring the account featured coverage in `account_test.go` (create default false, create with featured true, update toggles featured and round-trips, list `is_featured` filter, group rows — if any surface in list responses — carry no featured flag). Also keep the existing required-`is_hidden` update tests aligned with the new optional contract (update them deliberately where the contract changed).
- Do not change ground-truth docs (`docs/hierarchy-semantics.md`, `docs/webui-design.md`, `docs/accounting-semantics.md`).

## Tasks

### Task/Commit 1: `is_featured` columns through migration, store, and services

Portable featured state for category and tag below the transport layer.

- [x] Migration `00015` adding `is_featured BOOLEAN NOT NULL DEFAULT FALSE` + comments to `category` and `tag`; bump `PinnedMigrationContentHash` and `LatestMigrationVersion`; align `cmd/mina/testdata/validate/` fixtures with the new version and columns.
- [x] Update `docs/data-model.md` category and tag tables (column + account-style comment).
- [x] Store categories/tags: INSERT, SELECT, scan, optional `is_featured` list filter, and the account-style mutable update method (hidden and/or featured in one UPDATE).
- [x] Services categories/tags: `IsFeatured` on domain structs and `CreateInput`, list filter option, and the account-style mutable update use case ("at least one field is required"; preserve existing hidden-update behavior incl. reference-cache write-through, now also carrying featured state).
- [x] Update `internal/services/categories/PACKAGE.md` and `internal/services/tags/PACKAGE.md` (leaf-only featured contract).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `18w4` (`kata comment 18w4 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: REST exposure, generated clients, and app-test coverage

- [x] `api/openapi.yaml`: `is_featured` in Category and Tag response schemas (required, mirroring Account), optional-with-default-false in `CreateCategoryRequest`/`CreateTagRequest`, account-style `UpdateCategoryRequest`/`UpdateTagRequest` (optional `is_hidden` + optional `is_featured`), and `is_featured` query filter on `listCategories` and `listTags` mirroring `listAccounts`. No by-path featured endpoints.
- [x] Regenerate `just openapi` and `just frontend-openapi`; commit generated code. No frontend runtime/UI changes.
- [x] Handlers `internal/httpapi/strict_entities.go`: map the new fields/params; keep handlers thin.
- [x] App-tests in `category_test.go`/`tag_test.go` per the coverage listed in Plan Context (create default/explicit, update toggle + round-trip, list filter, empty-update rejected with 400, adjusted hidden-update contract).
- [x] Extend the PROJECT_STATE.md reference-data capability line to cover category/tag featured metadata.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue `18w4` (`kata comment 18w4 --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Featured flag for categories and tags (kata 18w4): portable is_featured via migration 00015 + pinned-hash bump mirroring the account precedent; leaf-only per hierarchy-semantics (no group derivation, no by-path featured setter); category/tag update requests become account-style optional-field mutable updates; listCategories/listTags gain is_featured filter; generated Go+frontend clients refreshed; backend/API only, UX surface deferred (f9c5)"`
- [x] Move this plan to `docs/plans/completed/`
