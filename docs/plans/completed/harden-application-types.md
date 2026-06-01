# Harden Application Value Types

## Plan Context

- Goal: service structs carry typed application values instead of stringly date, timestamp, and decimal fields.
- Storage remains DuckDB-typed: `DATE`, `TIMESTAMP`, `DECIMAL(18,8)`, enums, arrays, and nullable SQL values.
- REST remains string-on-the-wire, with civil dates as `YYYY-MM-DD`, audit timestamps as UTC RFC3339, decimals as fixed-scale `DECIMAL(18,8)` strings, and enums as lowercase strings.
- OpenAPI must use `format: date` and `format: date-time` for date and timestamp fields, and decimal fields must document expected string format, precision, and scale.
- Generated OpenAPI server and client files come from `api/openapi.yaml`; do not edit generated files by hand.
- Do not update `PROJECT_STATE.md` unless this work adds product capability beyond type hardening and REST contract clarification.

## Tasks

### Commit 1: Add Shared Application Value Types

- [x] Add `github.com/govalues/decimal` as the decimal library dependency and run `just tidy`.
- [x] Add a shared service-owned value package, preferably `internal/services/values`.
- [x] Add `CivilDate` for exact `YYYY-MM-DD` parsing and formatting.
- [x] Add `AuditTimestamp` for UTC-normalized audit timestamps formatted as RFC3339.
- [x] Add `Decimal` backed by the decimal library.
  - [x] Enforce `DECIMAL(18,8)` precision and scale.
  - [x] Provide constructors for signed, non-zero signed, positive, and non-negative decimal use cases.
  - [x] Provide canonical fixed-scale string formatting with exactly 8 fractional digits.
- [x] Keep HTTP/OpenAPI imports out of service value types.
- [x] Add exported Go API docs and a short package markdown doc for value contracts.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 2: Type Audit Timestamps on Entity Services

- [x] Change account, category, tag, and member service structs to use `values.AuditTimestamp` and nullable timestamp pointers for `created_at`, `updated_at`, and `tombstoned_at`.
- [x] Update account, category, tag, and member stores to scan DuckDB `TIMESTAMP` columns into time/nullable SQL values instead of string casts.
- [x] Keep repository interfaces service-owned and free of SQL, HTTP, and generated OpenAPI types.
- [x] Update HTTP mappers to emit UTC RFC3339 strings for audit timestamps.
- [x] Update normal runtime tests for any timestamp format assertions.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes

### Commit 3: Type Exchange Rate and Credit Limit Values

- [x] Change exchange-rate service structs and inputs to use typed decimals, civil dates, and audit timestamps.
- [x] Change credit-limit-history service structs and inputs to use typed decimals, civil dates, and audit timestamps.
- [x] Change list filters such as `effective_date` to use typed civil dates.
- [x] Replace duplicated string date and decimal validation with value constructors while preserving stable service-owned error messages.
- [x] Update stores to bind and scan DuckDB `DATE`, `TIMESTAMP`, and `DECIMAL(18,8)` values without converting them to service strings.
- [x] Keep DuckDB columns, uniqueness checks, tombstones, and sort behavior unchanged.
- [x] Update HTTP mappers to parse REST strings into service values and format service values back to REST strings.
- [x] Update normal runtime tests for canonical fixed-scale decimal responses and date behavior.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes

### Commit 4: Type Transaction and Journal Record Values

- [x] Change transaction service structs and inputs to use `values.CivilDate` for `initiated_date`, `pending_date`, and `posted_date`.
- [x] Change journal record service structs and inputs to use typed decimals for `amount` and `amount_usd`.
- [x] Change transaction and journal-record audit fields to typed audit timestamps.
- [x] Change journal-record search filters to typed decimal and civil-date values.
- [x] Replace manual `math/big` decimal parsing and balancing with decimal-library-backed arithmetic.
- [x] Preserve double-entry validation, signed amount behavior, non-zero amount behavior, and all-or-nothing writes.
- [x] Update transaction store scanning and binding for DuckDB `DATE`, `TIMESTAMP`, `DECIMAL(18,8)`, enum, array, and nullable columns.
- [x] Keep enum values lowercase in services and REST, with store-owned conversion to DuckDB enum values.
- [x] Update HTTP mappers to parse request/query strings into service values and format responses back to REST strings.
- [x] Update normal runtime tests for transaction create, replace, search, account-record search, and bulk update flows.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes

### Commit 5: Clarify REST OpenAPI Date, Timestamp, and Decimal Contracts

- [x] Update `api/openapi.yaml` civil date schemas and query parameters with `format: date`.
  - [x] `effective_date`
  - [x] `initiated_date`
  - [x] `pending_date`
  - [x] `posted_date`
  - [x] date range query parameters
- [x] Update audit timestamp schemas with `format: date-time`.
  - [x] `created_at`
  - [x] `updated_at`
  - [x] `tombstoned_at`
- [x] Add decimal descriptions for `amount`, `amount_usd`, `rate`, `credit_limit`, and decimal range query parameters.
  - [x] State that values are JSON strings, not JSON numbers.
  - [x] State precision and scale as `DECIMAL(18,8)`.
  - [x] State fixed-scale formatting with exactly 8 fractional digits.
  - [x] State signed, positive, or non-negative constraints where applicable.
- [x] Verify OpenAPI enum schemas remain lowercase strings for REST.
- [x] Run `just openapi` and update generated server and client outputs.
- [x] Update HTTP mappers, generated-client usage, and apptest helpers for generated `date` and `date-time` Go types.
- [x] Verify `GET /openapi.json` serves the updated formats and descriptions.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 6: Remove Stringly Leftovers and Tighten Docs

- [x] Search service packages for remaining stringly date, timestamp, and decimal fields.
  - [x] `rg -n "Date string|Date \\*string|At string|At \\*string|Amount.*string|Rate.*string|CreditLimit.*string" internal/services`
- [x] Remove obsolete duplicate date and decimal parsers from service packages.
- [x] Check store code for remaining `CAST(... AS VARCHAR)` on date, timestamp, and decimal columns; keep casts only where they are still intentional.
- [x] Update package docs only where this work changes implicit contracts, side effects, ownership boundaries, or invariants.
- [x] Keep documentation evergreen and avoid migration notes or history.
- [x] Verification
  - [x] `just openapi-check` passes
  - [x] `just fmt` passes
  - [x] `just test` passes
  - [x] `just test-integration` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

## Final Verification

- [x] `just init` passes on a clean checkout with required local tools available
- [x] `just tidy` leaves `go.mod` and `go.sum` clean
- [x] `just openapi-check` passes
- [x] `just fmt` passes
- [x] `just test` passes
- [x] `just test-integration` passes
- [x] `just pre-commit` passes
- [x] `just review-loop "harden service value types for dates timestamps and decimals"`
