# Plan: Hidden-state semantics for household members (Kata t828)

Give Members the same hidden-state semantics accounts, categories, and tags already have: portable `is_hidden` state in the accounting database, `is_hidden` in Member API responses, an update path, `include_hidden` list behavior, default exclusion from lists/pickers, and continued resolvability for historical references. Backend/API only — the hide/unhide UI is a separate blocked issue (`dcjx`) and must not be touched here.

## Plan Context

- Kata issue: `t828` — "Add hidden-state semantics for household members". Backend/API only.
- Members are flat (no FQN hierarchy), so member hidden state is a plain leaf row flag with NO group derivation — the `docs/hierarchy-semantics.md` group-derivation rules do not apply to members and must not be extended to them.
- Existing pattern to mirror (file:line refs as of plan authoring):
  - Data model: `is_hidden` columns + comment "Excludes active rows from default lists while keeping them selectable by explicit query." — `docs/data-model.md:66-96` (category), `:107,135` (tag), `:158,196` (account). Member table at `docs/data-model.md:140-149` has no `is_hidden` yet.
  - Migrations: `internal/store/migrations/00002_create_category.sql:9`, `00003_create_tag.sql:7`, `00005_create_account.sql:9`. Current max version is `00013`; the new upgrade migration is `00014_*.sql` (upgrade-only, goose). Adding a migration requires updating `PinnedMigrationContentHash` (`internal/store/db_validation.go:23`) and `LatestMigrationVersion` (`db_validation.go:54`) — follow the existing helpers at `db_validation.go:1236-1269`.
  - Store: `internal/store/tags.go` is the closest flat-ish reference for filter/update/scan (`:82-83` include-hidden filter, `:131` UpdateHidden, `:235` scan). Members store: `internal/store/members.go` (`List` `:84-98`, `scanMember` `:202-221`).
  - Service: `internal/services/tags/tags.go` and `internal/services/categories/categories.go` — `IsHidden` domain field, `ListOptions.IncludeHidden`, `UpdateHidden(id, ...)`, and hidden-reference validation via `ReferenceOptions.AllowHidden` + `Reference.IsHidden` (categories `:77-86`, enforced at `:184`). Members service: `internal/services/members/members.go` (`Member` `:14-21`, `ListOptions` `:33-37`, `ValidateActiveReferences` `:107-128`, reference cache `:268-308`).
  - API: `api/openapi.yaml` — member endpoints `:578-703`, `Member` schema `:3978-4020`, categories `include_hidden` param `:160-165`, hidden setters exist as separate endpoints for category/tag/account (`setCategoryHiddenByPath` `:289` etc.). Handlers: `internal/httpapi/strict_entities.go:239-294` (members), `:149` (categories IncludeHidden parsing).
  - Codegen: `just openapi` (server + Go httpclient) and `just frontend-openapi` (frontend generated client); staleness checks run in pre-commit.
- API shape (decided):
  - Add `is_hidden` (boolean, required) to the `Member` response schema.
  - Add `include_hidden` query param to `listMembers`, default false, mirroring categories/tags.
  - Add a dedicated hidden setter endpoint `PUT /api/members/{member_id}/hidden` with body `{ "is_hidden": <bool> }`, mirroring the category/tag/account hidden setters but addressed by id (members are flat, not path-addressed). Do NOT change `UpdateMemberRequest` (name updates keep their current contract) and do NOT add `is_hidden` to `CreateMemberRequest` — hidden state is set post-create via the setter, matching the issue scope (responses, update, include-hidden lists).
- Reference semantics (decided): mirror category/tag hidden-reference validation. Add `IsHidden` to the member `Reference` and `AllowHidden` to member `ReferenceOptions`; enforce in `members.ValidateActiveReferences` exactly as categories do (`ErrInvalidReference` for hidden refs unless `AllowHidden`). At each member-reference call site (transactions, recurring, etc.), pass `AllowHidden` consistent with how the same call site treats category references, so hidden members behave like hidden categories in writes. Historical reads must keep resolving hidden member names (hidden is not tombstoned; read paths that resolve references by id must be unaffected).
- Hidden members are excluded from default member lists; pickers consume the default list, so no separate picker work is needed backend-side.
- Tests are app-tests per `docs/TESTING.md` (read before writing tests): REST-client-driven in `internal/apptest/runtime/member_test.go`, mirroring the hidden coverage patterns in `category_test.go` (`:67,134,389`) and `tag_test.go` (`:61,152`). Scenario helper parity: add a hidden-member helper in `internal/apptest/scenario.go` next to `Member(name)` (`:143-147`) only if two or more tests need it.
- Docs to update in the same commit as the schema change: `docs/data-model.md` member table (new column line + comment matching the existing hidden wording). Update `internal/services/members/PACKAGE.md` (and store PACKAGE.md if it documents member row shape) where implicit contracts change. Do NOT touch `docs/hierarchy-semantics.md`, `docs/webui-design.md`, or other ground-truth docs.
- PROJECT_STATE.md: add/adjust one line only if it currently describes member capabilities in a way this changes (keep it short; no history).

## Tasks

### Task/Commit 1: Member `is_hidden` through data model, store, and service

Portable hidden state end to end below the transport layer. After this commit the accounting schema, store rows, and members service all carry and enforce member hidden semantics.

- [x] Add migration `internal/store/migrations/00014_add_member_is_hidden.sql`: `ALTER TABLE ... ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT false` (match the dialect/style of existing member/category migrations, including the column COMMENT used elsewhere) — upgrade-only.
- [x] Update `PinnedMigrationContentHash` and `LatestMigrationVersion` in `internal/store/db_validation.go` per the existing procedure.
- [x] Update `docs/data-model.md` member table: add the `is_hidden` column line with the standard comment "Excludes active rows from default lists while keeping them selectable by explicit query."
- [x] Store `internal/store/members.go`: include `is_hidden` in INSERT defaults (false), SELECT columns, `scanMember`, an `IncludeHidden` list option filter (`AND is_hidden = 0` when false, mirroring tags), and an `UpdateHidden` store method mirroring `tags.go:131`.
- [x] Service `internal/services/members/members.go`: add `Member.IsHidden`, `ListOptions.IncludeHidden`, `UpdateHidden(ctx, id, ...)` use case (active-member checks consistent with `UpdateName`), `Reference.IsHidden` + `ReferenceOptions.AllowHidden` enforcement in `ValidateActiveReferences` mirroring categories, and thread `IsHidden` through the member reference cache.
- [x] Align member-reference call sites (transactions, recurring, and any other `members.ReferenceOptions` users) to pass `AllowHidden` consistent with the same call site's category-reference options.
- [x] Update `internal/services/members/PACKAGE.md` implicit contracts (hidden default-exclusion, hidden-reference write rule, historical resolvability).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Update progress in Kata issue `t828` (`kata comment t828 --agent ...`)
  - [x] Commit changes

### Task/Commit 2: REST contract, handlers, generated clients, and app-test coverage

Expose member hidden semantics over the API and prove the behavior at the app boundary.

- [x] `api/openapi.yaml`: add `is_hidden` to the `Member` schema, `include_hidden` query param to `listMembers` (default-false wording mirroring categories/tags), and the `PUT /api/members/{member_id}/hidden` setter (request schema with required `is_hidden`; response/status/error shapes mirroring the existing hidden setters; standard not-found/tombstoned error mapping).
- [x] Regenerate clients: `just openapi` and `just frontend-openapi`; commit generated code. No frontend runtime/UI changes.
- [x] Handlers `internal/httpapi/strict_entities.go`: parse `IncludeHidden` for member lists, map the hidden setter to `members.UpdateHidden`, map `is_hidden` into member DTOs. Handlers stay thin — no domain decisions.
- [x] App-tests in `internal/apptest/runtime/member_test.go`: hidden setter round-trip (`is_hidden` in responses); default list excludes hidden member; `include_hidden=true` includes it; get-by-id still resolves a hidden member; a transaction referencing a member keeps resolving the member after it is hidden (historical reference); a new write referencing a hidden member behaves like the equivalent hidden-category write (rejected or allowed per the mirrored call-site semantics — assert whichever the categories parity dictates); invalid `include_hidden` value handling mirroring `category_test.go:449` if members share that binding style.
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-integration` passes
  - [x] Update progress in Kata issue `t828` (`kata comment t828 --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] Commit final changes
- [x] Run `just review-loop "Member hidden-state semantics (kata t828): portable member is_hidden via upgrade migration 00014 + pinned-hash bump; store/service mirror tags/categories hidden patterns (IncludeHidden lists, UpdateHidden, AllowHidden reference validation, flat leaf flag with no group derivation); REST adds Member.is_hidden, listMembers include_hidden, PUT /api/members/{member_id}/hidden; generated Go+frontend clients refreshed; backend/API only, no UI controls (dcjx owns those); app-test coverage for lists, setter, historical references"`
- [x] Move this plan to `docs/plans/completed/`
