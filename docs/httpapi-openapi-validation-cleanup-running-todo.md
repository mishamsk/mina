# HTTP API OpenAPI Validation Cleanup

## Plan Context

Clean up `internal/httpapi` so OpenAPI-generated binding and OpenAPI request validation own transport validation wherever practical. Keep this scoped to the REST adapter: generated OpenAPI wiring, Chi middleware, strict-server handlers, REST error envelopes, and OpenAPI discovery endpoints.

Do not change service-layer behavior, store behavior, business validation, persistence, CLI behavior, or endpoint semantics except where the current HTTP adapter has redundant manual validation that should be replaced by generated params or OpenAPI request validation.

Do not add private-helper unit tests. Verify through existing high-level runtime/API tests and focused additions to those boundary-style tests only when current coverage does not assert the HTTP behavior being changed.

## Tasks

### Commit 1: Add OpenAPI Request Validation Middleware
- [x] Add `github.com/oapi-codegen/nethttp-middleware` as the Chi/`net/http` OpenAPI request validation middleware dependency.
- [x] Load the embedded generated spec with `openapi.GetSpec()` in `internal/httpapi` router construction.
- [x] Register request validation as Chi middleware before generated route handling.
- [x] Configure validation failure handling so every validator error is written with Mina's declared JSON error envelope:
  - [x] HTTP status maps to the appropriate REST status, normally `400` for invalid requests.
  - [x] Error body remains `{"error":{"code":"invalid_request","message":"..."}}`.
  - [x] Content type remains `application/json`.
- [x] Preserve existing generated binding error handling for path/query/body decode errors that occur outside the validation middleware.
- [x] Verification:
  - [x] Existing high-level runtime/API tests still pass with no new private-helper unit tests.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes because JSON-over-HTTP behavior is touched.
  - [x] `just pre-commit` passes.
  - [x] Required docs updated.

### Commit 2: Replace Raw Query Parsing With Generated Params
- [x] Refactor strict-server list handlers to use generated `request.Params` instead of `r.URL.Query()`.
- [x] Add small HTTP adapter helpers for converting generated optional params into service list options:
  - [x] Optional bool pointer to bool with false default.
  - [x] Optional sort enum pointer to default service sort key.
  - [x] Optional sort direction enum pointer to default ascending direction.
  - [x] Optional offset pointer to `0`.
- [x] Refactor exchange-rate list filters to use generated `request.Params`.
- [x] Refactor journal-record search filters to use generated `request.Params`.
- [x] Refactor `/accounts/{account_id}/records` so `request.AccountId` supplies the account filter and generated query params supply the remaining record filters.
- [x] Remove the strict request context middleware if raw `*http.Request` access is no longer needed by strict handlers.
- [x] Delete or shrink `strict_parse.go` once no strict handler needs direct raw query parsing.
- [x] Forbid new manual `r.URL.Query()` parsing in `internal/httpapi` unless a concrete uncovered transport rule requires it and is documented near the code.
- [x] Verification:
  - [x] Existing high-level runtime/API tests still pass with no new private-helper unit tests.
  - [x] Boundary coverage confirms unsupported query params are rejected by OpenAPI validation, not handwritten allowlists.
  - [x] Boundary coverage confirms duplicate scalar query params are rejected or explicitly accepted according to OpenAPI validator behavior.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes because JSON-over-HTTP behavior is touched.
  - [x] `just pre-commit` passes.
  - [x] Required docs updated.

### Commit 3: Remove Redundant Strict JSON Body Validation
- [x] Verify OpenAPI request validation rejects unknown top-level JSON fields using existing `additionalProperties: false` schemas.
- [x] Verify OpenAPI request validation rejects unknown nested transaction record fields using the `CreateJournalRecordRequest` schema.
- [x] Verify OpenAPI request validation preserves required-field and required-null behavior for current request schemas.
- [x] Remove `strictJSONBodyValidator` from router middleware if OpenAPI validation covers the same transport rules.
- [x] Delete or shrink `strict_body.go` once no remaining JSON field-presence workaround is required.
- [x] Keep body decode error handling in strict generated handler options for malformed JSON and wrong body type errors emitted by generated binding.
- [x] Verification:
  - [x] Existing high-level runtime/API tests still pass with no new private-helper unit tests.
  - [x] Boundary coverage confirms unknown JSON fields and nested unknown record fields are rejected by OpenAPI validation.
  - [x] Boundary coverage confirms required `null` values are rejected with Mina's error envelope.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes because JSON-over-HTTP behavior is touched.
  - [x] `just pre-commit` passes.
  - [x] Required docs updated.

### Commit 4: Expose OpenAPI Discovery Endpoints
- [x] Add `GET /openapi.json` served from `openapi.GetSpecJSON()`.
- [x] Ensure `/openapi.json` returns `application/json`.
- [x] Decide whether to add an interactive documentation endpoint:
  - [x] Do not include an interactive documentation endpoint; document that API tools should use `/openapi.json`.
- [x] Ensure generated OpenAPI route registration remains the source of product API paths; discovery/docs endpoints are adapter-owned operational helpers.
- [x] Verification:
  - [x] Existing high-level runtime/API tests still pass with no new private-helper unit tests.
  - [x] Boundary coverage confirms `/openapi.json` returns the embedded spec.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] `just test-integration` passes because real-network REST/API discovery behavior is touched.
  - [x] `just pre-commit` passes.
  - [x] Required docs updated.

### Commit 5: Tighten HTTP Adapter Documentation And Guardrails
- [x] Update `internal/httpapi/PACKAGE.md` to say OpenAPI request validation owns transport-schema validation.
- [x] Document that strict-server handlers should consume generated request objects and generated `request.Params`.
- [x] Document that direct raw query parsing in `internal/httpapi` is disallowed unless a specific rule cannot be expressed through OpenAPI validation or generated params.
- [x] Document the Mina error envelope mapping for generated binding errors, OpenAPI validation errors, and strict handler errors.
- [x] Update `PROJECT_STATE.md` only if operator-visible API discovery endpoints or durable REST behavior changed.
- [x] Verification:
  - [x] Existing high-level runtime/API tests still pass with no new private-helper unit tests.
  - [x] `just fmt` passes.
  - [x] `just test` passes.
  - [x] Not relevant: Commit 5 includes documentation changes only, so `just test-integration` was not required.
  - [x] `just pre-commit` passes.
  - [x] Required docs updated.

## Deferred Verification

- [ ] `just test-integration` passes after the full cleanup because JSON-over-HTTP behavior, real-network REST behavior, and API discovery behavior are touched.
- [ ] Manual smoke commands are run only if existing boundary/integration coverage leaves a concrete uncovered risk.

## Final Verification

- [ ] `just init` passes on a clean checkout with required local tools available.
- [ ] `just fmt` passes.
- [ ] `just test` passes.
- [ ] `just test-integration` passes.
- [ ] `just pre-commit` passes.
- [ ] Deferred verification completed or explicitly marked not relevant.
