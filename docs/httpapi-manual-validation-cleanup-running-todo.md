# HTTP API Manual Validation Cleanup

## Plan Context

`internal/httpapi` already uses generated OpenAPI routing, generated request binding, and OpenAPI request validation. Strict-server methods should stay thin: map generated OpenAPI request objects to service inputs, call services, and map service outputs to generated OpenAPI response objects.

This cleanup removes handwritten HTTP transport validation that duplicates generated binding or OpenAPI request validation. Service-layer validation remains unchanged.

Keep the unknown-query-parameter guard unless it is replaced by an equivalent validator-owned mechanism; the current upstream validator does not reject undeclared query names.

## Tasks

### Commit 1: Remove Redundant Path ID Validation
- [x] Confirm every path ID guarded by `positivePathID` has `minimum: 1` in `api/openapi.yaml`.
- [x] Remove `positivePathID` calls from strict-server methods:
  - [x] `DeleteAccount`, `GetAccount`, and `UpdateAccount`.
  - [x] `DeleteCategory`, `GetCategory`, and `UpdateCategory`.
  - [x] `DeleteMember`, `GetMember`, and `UpdateMember`.
  - [x] `DeleteTag`, `GetTag`, and `UpdateTag`.
  - [x] `ListCreditLimitHistory` and `CreateCreditLimitHistory` for `account_id`.
  - [x] `DeleteCreditLimitHistory` and `GetCreditLimitHistory`.
  - [x] `DeleteExchangeRate`, `GetExchangeRate`, and `UpdateExchangeRate`.
  - [x] `DeleteTransaction`, `GetTransaction`, and `ReplaceTransaction`.
  - [x] `SearchAccountJournalRecords` for `account_id`.
- [x] Delete `internal/httpapi/strict_context.go` if no helper remains.
- [x] Remove now-unused `services` imports from strict-handler files where applicable.
- [x] Update boundary test expectations only where they asserted handwritten path-ID messages instead of OpenAPI validation messages.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes because JSON-over-HTTP behavior is touched
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 2: Remove Redundant Required Body Guards
- [ ] Confirm every strict method with `request.Body == nil` corresponds to an OpenAPI operation with `requestBody.required: true`.
- [ ] Remove `request.Body == nil` guards from strict-server methods:
  - [ ] `CreateAccount` and `UpdateAccount`.
  - [ ] `CreateCategory` and `UpdateCategory`.
  - [ ] `CreateMember` and `UpdateMember`.
  - [ ] `CreateTag` and `UpdateTag`.
  - [ ] `CreateCreditLimitHistory`.
  - [ ] `CreateExchangeRate` and `UpdateExchangeRate`.
  - [ ] `CreateTransaction` and `ReplaceTransaction`.
  - [ ] `BulkCategorizeJournalRecords`.
  - [ ] `BulkUpdateJournalRecordTags`.
  - [ ] `BulkReassignJournalRecordAccount`.
  - [ ] `BulkUpdateJournalRecordStatuses`.
- [ ] Keep generated request error handling for malformed JSON, missing bodies, wrong body types, and validator failures.
- [ ] Remove now-unused `services` imports from strict-handler files where applicable.
- [ ] Update boundary test expectations only where they asserted handler-owned missing-body behavior.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test` passes
  - [ ] `just test-integration` passes because JSON-over-HTTP behavior is touched
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 3: Remove Bespoke Body Validation Message Shim
- [ ] Remove `requiredBoolBodyCompatibilityMessage` from `internal/httpapi/middleware.go`.
- [ ] Remove the request-body reread/unmarshal path used only to detect `is_hidden: null`.
- [ ] Let OpenAPI request validation own required non-null JSON field validation and message classification.
- [ ] Remove or revise `TestRouterOpenAPIJSONValidationRejectsNullRequiredBool` so it asserts the stable Mina error envelope without depending on a field-specific handwritten message.
- [ ] Remove now-unused imports from `internal/httpapi/middleware.go`.
- [ ] Keep generic OpenAPI validation error mapping in place for invalid JSON body schema failures.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test` passes
  - [ ] `just test-integration` passes because JSON-over-HTTP behavior is touched
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 4: Tighten Architecture And HTTP Adapter Docs
- [ ] Update `docs/architecture.md` with a concise evergreen statement that `internal/httpapi` uses generated OpenAPI routing/contracts, generated request binding, and OpenAPI request validation for transport-shape validation.
- [ ] State in `docs/architecture.md` that strict-server implementations should only map generated OpenAPI request/response types to service types, call services, and map service errors/statuses.
- [ ] Keep the architecture wording short and avoid endpoint examples, migration history, or implementation inventory.
- [ ] Align `internal/httpapi/PACKAGE.md` with the final code after redundant manual validation is removed.
- [ ] Confirm docs still distinguish transport validation in `internal/httpapi` from domain validation in service packages.
- [ ] Verification
  - [ ] `just fmt` is not required for docs-only changes
  - [ ] `just test` is not required for docs-only changes
  - [ ] `just test-integration` is not required for docs-only changes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 5: Reaudit HTTP API Boundary
- [ ] Revisit all handwritten code in `internal/httpapi` after the cleanup.
- [ ] Confirm strict-server methods remain limited to generated DTO mapping, service calls, response mapping, and service error/status handling.
- [ ] Confirm no HTTP adapter code owns domain validation, SQL, persistence decisions, process configuration, or service-layer decisions.
- [ ] Confirm no stale helpers, tests, imports, comments, package docs, or workaround paths remain from removed manual validation.
- [ ] Confirm any remaining manual transport guard has a current reason that cannot be expressed through generated binding or OpenAPI request validation, and that the reason is documented near the code.
- [ ] Verification
  - [ ] `just fmt` passes if code changes are made
  - [ ] `just test` passes if code changes are made
  - [ ] `just test-integration` passes if JSON-over-HTTP behavior is touched
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

## Deferred Verification

- [ ] `just test-integration` passes after the code cleanup because JSON-over-HTTP behavior is touched.
- [ ] Manual smoke commands are not required unless boundary or integration coverage does not cover a changed validation path.

## Final Verification

- [ ] `just init` passes on a clean checkout with required local tools available
- [ ] `just fmt` passes
- [ ] `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] Deferred verification completed or explicitly marked not relevant
