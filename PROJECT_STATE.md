# Project State

- Implementation scope: Phase 1 Stage 1 REST API.
- Go module: `mina.local/mina`, minimum Go version `1.25`.
- Package inventory:
  - `cmd/mina`: minimal CLI entrypoint with help and version output.
  - `internal/models`: data shape package placeholder.
  - `internal/store`: database and migration package placeholder.
  - `internal/controllers`: domain use-case package placeholder.
  - `internal/routers`: REST mapping package placeholder.
  - `internal/app`: process composition package placeholder.
- Developer recipes are owned by `Justfile`:
  - `just fmt`: format Go packages.
  - `just test`: run Go tests.
  - `just test-boundary`: run current boundary-capable test set.
  - `just pre-commit`: run formatting and tests.
  - `just test-cli`, `just test-rest`, and `just smoke`: placeholders for later process-level suites.
