# mina

Spec-first Go CLI that serves a REST API from an in-process DuckDB database.

## Tooling

- Go 1.25+
- DuckDB official Go driver: `github.com/duckdb/duckdb-go/v2`
- OpenAPI code generation: `github.com/oapi-codegen/oapi-codegen/v2`
- Router: `github.com/go-chi/chi/v5`

## Generate API Code

```sh
go generate ./internal/api
```

The OpenAPI contract lives at `api/openapi.yaml`. Generated server, models, and client code are written to `internal/api/openapi.gen.go`.

## Run

```sh
go run ./cmd/mina serve --addr :8080 --db ./mina.duckdb
```

Omit `--db` to use an in-memory DuckDB database.

## Test Strategy

Most tests should go through the generated OpenAPI client with an in-process `http.RoundTripper`, so they assert only at the API boundary without paying real network costs. Keep full-network tests under `internal/integrationtest` and use raw JSON assertions for a small number of end-to-end checks.
