# Generated Files

- `internal/httpapi/openapi/openapi.gen.go` is generated from `api/openapi.yaml` with `api/oapi-codegen.yaml`; it contains OpenAPI models, the embedded spec, Chi server routing contracts, REST route path/method declarations, and strict-server request/response contracts.
- `internal/httpclient/openapi.gen.go` is generated from `api/openapi.yaml` with `api/oapi-codegen-httpclient.yaml`; it contains OpenAPI models, REST client calls, and typed response wrappers.
- `frontend/src/api/generated` is generated from `api/openapi.yaml` with `frontend/openapi-ts.config.ts`; it contains browser fetch client code, generated operation functions, request/response types, and error DTO types.
- `internal/webui/dist` is ignored Vite build output from `frontend`; it contains embedded browser assets served from `/`.
- `internal/services/accountingschema/schema.sql` is DuckDB's native `EXPORT DATABASE` schema output from a pristine in-memory accounting database after the real migration path; it is static inspection output and never initializes, migrates, validates, repairs, or introspects a user database.
- `internal/runtime` and `internal/store` do not currently contain generated files.
- Run `just openapi` after changing the OpenAPI source or generator config.
- Run `just openapi-check` to validate `api/openapi.yaml` and verify generated OpenAPI outputs are current without rewriting files.
- Run `just frontend-openapi` after changing the OpenAPI source or frontend generator config.
- Run `just frontend-openapi-check` to verify generated frontend OpenAPI outputs are current.
- Run `just accounting-schema` after changing accounting migrations or schema-generation tooling.
- Run `just accounting-schema-check` to reject changes to migrations already on `main` and verify the checked-in accounting DDL byte-for-byte without rewriting it.
- Run `mina db schema` to print the embedded artifact without opening a database; a normally started server also exposes it through REST.
- Pre-commit runs the fast accounting-schema freshness check on every invocation.
- Do not edit generated files by hand.
- Generated OpenAPI output must stay deterministic: no timestamps, no local paths, and generator execution through the module-pinned `go tool oapi-codegen` or pinned frontend package manager.
