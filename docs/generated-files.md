# Generated Files

- `internal/httpapi/openapi/openapi.gen.go` is generated from `api/openapi.yaml` with `api/oapi-codegen.yaml`; it contains OpenAPI models, the embedded spec, Chi server routing contracts, and strict-server request/response contracts.
- `internal/httpapi/models` contains hand-written REST DTOs; it is not generated.
- `internal/runtime`, `internal/services`, and `internal/store` do not currently contain generated files.
- Run `just openapi` after changing the OpenAPI source or generator config.
- Do not edit generated files by hand.
- Generated OpenAPI output must stay deterministic: no timestamps, no local paths, and generator execution through the module-pinned `go tool oapi-codegen`.
