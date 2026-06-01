# Generate REST API Client for Test Harness

## Plan Context

- Current REST server contract code is generated from `api/openapi.yaml` into `internal/httpapi/openapi/openapi.gen.go`.
- Add a separate generated `internal/httpclient` package from the same OpenAPI source with `generate.client: true` and `generate.models: true`; oapi-codegen v2.7.0 emits `ClientWithResponses` and per-operation response wrapper types when client generation is enabled.
- First allowed consumer is `internal/apptest`; production imports stay blocked until a specific production use case is approved.
- Normal tests must get the generated client from the apptest client harness. They may import `internal/httpclient` for generated request, response, model, enum, and params types when generated method signatures require them.
- Preserve test essence: each runtime test migration changes endpoint-call mechanics only, not scenario setup intent, assertions, status expectations, or error-envelope expectations.
- For malformed query/body coverage that cannot use typed generated params or bodies, use generated arbitrary-body methods and small apptest request-editor helpers instead of preserving bespoke raw path calls.
- Do not update `PROJECT_STATE.md`; this is generated-client and test-infrastructure work, not product capability progress.

## Tasks

### Commit 1: Add Generated HTTP Client Package

- [x] Add `api/oapi-codegen-httpclient.yaml` for package `internal/httpclient`.
  - [x] Generate `client: true`.
  - [x] Generate `models: true`.
  - [x] Output to `internal/httpclient/openapi.gen.go`.
  - [x] Avoid embedded spec and server generation in this package.
- [x] Run `just openapi` after updating generation config.
- [x] Update `Justfile` generation recipes.
  - [x] `just openapi` regenerates both server and client outputs.
  - [x] `just openapi-check` validates `api/openapi.yaml` and compares both generated outputs against temp regeneration.
- [x] Add package documentation for `internal/httpclient`.
  - [x] Code package doc states it is generated REST client code.
  - [x] Add a short package markdown doc only if needed for the temporary consumer rule.
- [x] Update generated-file documentation.
  - [x] Add `internal/httpclient/openapi.gen.go` to `docs/generated-files.md`.
  - [x] Keep the no-hand-edit and deterministic-generation rules.
- [x] Update architecture docs surgically.
  - [x] Add `internal/httpclient` to package boundaries as generated REST client code. Make sure it is one new bullet point, no other changes
- [x] Update depguard rules for the new package.
  - [x] Allow `github.com/mishamsk/mina/internal/httpclient` in `internal/apptest` and normal runtime tests.
  - [x] Deny `github.com/mishamsk/mina/internal/httpclient` from services, store, HTTP server adapter, runtime composition, and `cmd/mina` until an explicit future use case is approved.
  - [x] Keep normal runtime tests blocked from importing `internal/runtime`, `internal/store`, services, `net/http/httptest`, and other internals.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 2: Wire Apptest Through Generated Client

- [x] Add an apptest in-process `httpclient.HttpRequestDoer`.
  - [x] Route generated `*http.Request` values through `runtime.App.Handler()`.
  - [x] Keep using `httptest.ResponseRecorder` internally so no real network listener is started.
  - [x] Return an `*http.Response` with status, headers, and body for generated response parsers.
- [x] Construct `httpclient.ClientWithResponses` inside `apptest.New`.
  - [x] Use a fixed local base URL such as `http://mina.test`.
  - [x] Fail test setup immediately if generated client construction fails.
- [x] Expose the generated client from `internal/apptest.Client`.
  - [x] Use one narrow accessor such as `REST() *httpclient.ClientWithResponses`.
  - [x] Keep test-owned app setup and app teardown in `internal/apptest`.
- [x] Add apptest helpers for transport-shape edge cases.
  - [x] Request editor for adding or replacing raw query strings.
  - [x] JSON reader helper for arbitrary map/body cases that typed generated bodies cannot represent.
  - [x] Keep helpers focused on HTTP transport shape, not domain behavior.
- [x] Migrate `internal/apptest/scenario.go` to use the generated client.
  - [x] Preserve fixture names and returned DTOs.
  - [x] Preserve existing scenario failure messages as closely as practical.
- [x] Migrate the first proof tests through the generated client.
  - [x] `internal/apptest/runtime/app_test.go`
  - [x] `internal/apptest/runtime/harness_test.go`
- [x] Keep `apptest.Decode`, `Client.JSON`, and related bespoke raw helpers temporarily until all tests are migrated.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes

### Commit 3: Migrate Member Runtime Tests

- [x] Migrate `internal/apptest/runtime/member_test.go`.
  - [x] Use generated `CreateMemberWithResponse`, `GetMemberWithResponse`, `ListMembersWithResponse`, `UpdateMemberWithResponse`, and `DeleteMemberWithResponse`.
  - [x] Use typed params for valid tombstone queries.
  - [x] Use apptest raw-query helpers for malformed query values.
  - [x] Use generated arbitrary-body methods for missing required JSON fields and unknown JSON fields.
- [x] Remove file-local path helpers that are no longer needed.
- [x] Keep all expected statuses, response-field assertions, and duplicate/tombstone semantics unchanged.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes

### Commit 4: Migrate Category and Tag Runtime Tests

- [x] Migrate `internal/apptest/runtime/category_test.go`.
  - [x] Use generated typed calls for create/read/list/update/delete.
  - [x] Use generated params for valid hidden and tombstone query combinations.
  - [x] Use raw-query and arbitrary-body helpers for invalid transport-shape cases.
- [x] Run `just test` after the category file migration before editing tag tests.
- [x] Migrate `internal/apptest/runtime/tag_test.go` with the same constraints.
- [x] Remove obsolete path helpers from both files.
- [x] Preserve hierarchy, hidden, tombstone, duplicate, and validation assertions.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes

### Commit 5: Migrate Account and Credit-Limit Runtime Tests

- [x] Migrate `internal/apptest/runtime/account_test.go`.
  - [x] Use generated typed account methods and params.
  - [x] Preserve hidden, tombstone, duplicate, currency, external system, and unknown-field assertions.
- [x] Run `just test` after the account file migration before editing credit-limit tests.
- [x] Migrate `internal/apptest/runtime/credit_limit_history_test.go`.
  - [x] Use generated nested account credit-limit methods for list/create.
  - [x] Use generated credit-limit-history read/delete methods.
  - [x] Preserve date, decimal, duplicate, missing-account, tombstone, and unknown-field assertions.
- [x] Remove obsolete path helpers from both files.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes

### Commit 6: Migrate Exchange-Rate, Hierarchy, and List-Query Runtime Tests

- [x] Migrate `internal/apptest/runtime/exchange_rate_test.go`.
  - [x] Use generated typed exchange-rate methods and params.
  - [x] Preserve currency-pair, rate, date, duplicate, tombstone, and validation assertions.
- [x] Run `just test` after the exchange-rate file migration.
- [x] Migrate `internal/apptest/runtime/hierarchy_response_test.go`.
  - [x] Use generated create calls.
  - [x] Preserve response hierarchy assertions only.
- [x] Run `just test` after the hierarchy file migration.
- [x] Migrate `internal/apptest/runtime/list_query_test.go`.
  - [x] Use generated typed params for valid pagination and sorting cases.
  - [x] Use raw-query helpers for unsupported or malformed query cases.
  - [x] Preserve list ordering and pagination assertions.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes

### Commit 7: Migrate Transaction Runtime Tests

- [x] Migrate `internal/apptest/runtime/transaction_test.go`.
  - [x] Use generated typed transaction create/read/list calls.
  - [x] Use generated arbitrary-body or raw-query helpers for malformed date, bad enum, excessive decimal precision, missing references, and unsupported list query coverage as needed.
  - [x] Preserve balancing, nested journal-record, domain validation, and error-envelope assertions.
- [x] Replace path construction helpers with generated path parameters.
- [x] Keep transaction fixture helper names and domain intent unchanged.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes

### Commit 8: Migrate Transaction Search, Update, and Bulk Record Tests

- [x] Migrate `internal/apptest/runtime/transaction_update_search_test.go`.
  - [x] Use generated transaction replace/delete/read/list methods.
  - [x] Use generated record search methods and typed params for valid search filters.
  - [x] Use raw-query helpers for unsupported or malformed query cases.
  - [x] Preserve all record visibility, account-view, update, delete, and all-or-nothing assertions.
- [x] Run `just test` after the transaction update/search file migration.
- [x] Migrate `internal/apptest/runtime/record_bulk_test.go`.
  - [x] Use generated bulk category, tag, account, and status methods.
  - [x] Preserve selection, duplicate-selection, no-op, missing-reference, and all-or-nothing assertions.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes

### Commit 9: Remove Bespoke Test Client Calls and Tighten Docs/Lints

- [x] Remove obsolete bespoke test-client API.
  - [x] Delete `apptest.Decode` if no callers remain.
  - [x] Delete `Client.JSON` if no callers remain.
  - [x] Delete `Response[T]` and `EmptyJSON` if no callers remain.
  - [x] Keep only small apptest helpers still needed by generated-client tests.
- [x] Replace normal runtime test imports of `internal/httpapi/openapi` with `internal/httpclient`.
- [x] Tighten depguard after migration.
  - [x] Remove normal-test allowance for `github.com/mishamsk/mina/internal/httpapi/openapi`.
  - [x] Keep normal tests allowed to import `internal/apptest`.
  - [x] Keep normal tests allowed to import `internal/httpclient` only for generated DTO, params, enum, and response types.
- [x] Update `docs/TESTING.md` surgically.
  - [x] Say normal tests exercise behavior through the apptest in-process generated REST client.
  - [x] Say tests obtain the generated client from `internal/apptest`.
  - [x] Keep the no-SQL, no-service, no-router-internals, no-mock rules unchanged.
- [x] Update `internal/apptest/doc.go` to mention the generated REST client.
- [x] Check whether `internal/httpapi/PACKAGE.md` needs a wording update now that generated client code is no longer colocated with generated server contract code.
- [x] Do not add migration notes or history to docs.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available
- [x] `just openapi-check` passes
- [x] `just fmt` passes
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just review-loop "generate REST API client and migrate apptest runtime tests"`
