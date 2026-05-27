# Generated Files

- `internal/openapi/openapi.gen.go` is generated from `api/openapi.yaml` with `api/oapi-codegen.yaml`.
- Run `just openapi` after changing the OpenAPI source or generator config.
- Do not edit generated files by hand.
- Generated OpenAPI output must stay deterministic: no timestamps, no local paths, and generator execution through the module-pinned `go tool oapi-codegen`.
