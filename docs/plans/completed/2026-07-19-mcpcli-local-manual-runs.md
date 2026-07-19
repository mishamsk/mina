# Plan: Complete local manual-operation lifecycle handling

Give the two asynchronous manual triggers (`startExchangeRateLoadingRun`, `startDatabaseBackupRun`) explicit CLI completion metadata in the surface config, generate that metadata into the catalog, and make local-mode CLI runs of those triggers wait for a terminal run state — propagating failure and canceling active work on interruption — while remote-mode `202` behavior and every other command stay untouched.

## Plan Context

- Owning docs: `docs/cli-mcp-architecture.md` ("Local Runtime Policy" is the contract: "CLI exposure config for an asynchronous manual trigger identifies its generated status operation, run identifier, terminal field, and terminal values"; "The CLI polls completion only through generated REST client operations"; "Canceling the command cancels any active manual run before the local session closes"; "Reading operation status or invoking unrelated commands never starts operation execution"), `docs/architecture.md` (client surfaces call only generated REST operations), `api/client-surfaces.yaml`, `internal/tools/surfacegen` (validator + generator), `internal/httpclient/catalog.go` + `surfaces.gen.go`, `internal/clientcli`, `internal/runtime` (existing contract: closing the app cancels operations and waits — the client relies on this, it does not call runtime), `docs/TESTING.md`, `internal/apptest` (existing `one_shot_profile_test.go`, `BlockedDatabaseBackup`, `PollExchangeRateLoadingRun` helpers), `cmd/mina/testdata/script/` conventions.
- Facts about the two async triggers: both return `202` with an `operation_run_id`; run status operations are `getExchangeRateLoadingRun` and `getDatabaseBackupRun` (path parameter `operation_run_id`); the run payload's `outcome` field takes `running|succeeded|failed|skipped|canceled` — terminal values are `succeeded`, `failed`, `skipped`, `canceled`, and `failed`/`canceled` must produce a non-zero CLI exit.
- Surface config extension (`api/client-surfaces.yaml`): an optional CLI `completion` block on exposed operations, identifying the status operation id, the response field carrying the run identifier, the status path parameter it feeds, the terminal field name, the full terminal value set, and the subset that means failure. Add it to exactly the two async triggers. Shape naming is yours but must stay declarative data (no code in config).
- `surfacegen` validation for the new block: status operation must exist in the OpenAPI set and have a generated invoker (exposed on at least one surface); all fields non-empty; terminal values non-empty; failure values a subset of terminal values; a `completion` block on an operation whose CLI state is not `exposed` is an error. Extend generation so the catalog's CLI metadata carries the completion data (new fields on the hand-written contract types in `internal/httpclient/catalog.go` plus regenerated `surfaces.gen.go`). Freshness checks already cover regeneration; keep output deterministic.
- `internal/clientcli` behavior, local sessions only (detect local vs remote by which session type is active — remote sessions must not change at all):
  - after a successful `2xx` trigger response for an operation with completion metadata, extract the run identifier from the response JSON by the configured field, then poll the configured status operation through its generated invoker (short fixed interval, context-aware) until the terminal field reaches a terminal value;
  - on success terminal values print the final run status JSON to stdout; on configured failure values print it to stderr and exit non-zero;
  - on interruption (context cancellation) stop polling and close the local session; runtime close cancels the active run and waits — the client must not call runtime or services and must still close the session exactly once;
  - operations without completion metadata, status reads, and every remote invocation keep current behavior byte-for-byte.
- App-test coverage (`internal/apptest/runtime`, REST observables only): extend the existing one-shot policy coverage minimally to prove the database-backup manual trigger also runs to a successful terminal state under the one-shot profile with automatic operations disabled, and that reading both status endpoints records no new runs. Do not duplicate existing operation scenarios; automatic/manual policy stays app-test-owned.
- E2E coverage (smallest set, existing boundary, one script or a small extension of `mina_client_local.txt` — your choice, no new test locations):
  1. wait-to-terminal: a local `mina client --db ... --yes operations start-database-backup` with a backup directory configured exits `0` only after the run is terminal, prints the terminal run JSON, and the backup file exists on disk when the command returns (the on-disk file at exit is the proof that the CLI actually waited);
  2. interruption/cleanup: interrupt a local client process mid-lifecycle (`kill -INT` on a backgrounded invocation) and prove clean closure by a follow-up local command against the same database succeeding (no stale lock). Keep it minimal; do not build elaborate blocking fixtures in e2e — proving the interrupt path closes cleanly is enough, run-cancellation semantics are already runtime-owned and app-test-proven.
  Do not repeat REST operation scenarios or the remote shape matrix.
- Docs: update `internal/clientcli/PACKAGE.md` (completion-metadata contract) and, if the config shape gains the block, keep `api/client-surfaces.yaml` self-explanatory; a one-line `PROJECT_STATE.md` amendment only if user-visible behavior warrants it.
- Protect list (must not regress): remote CLI `202` pass-through for both triggers; every non-async command in both modes; one-shot profile policy from the previous plan; surfacegen determinism and freshness; `mina serve` scheduling behavior.
- Exclusions: no MCP work; no new runtime or service APIs; no cancel REST endpoint; no polling in remote mode; no changes to `api/openapi.yaml`.

## Tasks

### Task 1: Add completion metadata to the surface contract and generated catalog

End state: the two async triggers carry validated completion metadata in `api/client-surfaces.yaml`; surfacegen validates and generates it; the catalog exposes it; regeneration is fresh and deterministic.

- [x] Extend the surface config, surfacegen validation, contract types, and generated output per Plan Context, committing the regenerated `surfaces.gen.go` in the same commit.
- [x] Commit the task as `Add CLI completion metadata for async manual triggers`.

### Task 2: Implement local wait-to-terminal and interruption handling in the CLI

End state: local runs of the two triggers wait to a terminal state with failure propagation and interrupt-safe cleanup; remote and non-async behavior is unchanged; app-tests prove the one-shot backup trigger policy.

- [x] Implement the local completion polling, failure propagation, and interruption path in `internal/clientcli` per Plan Context, updating `internal/clientcli/PACKAGE.md`.
- [x] Extend the app-test one-shot policy coverage per Plan Context.
- [x] Commit the task as `Wait for terminal manual runs in local CLI mode`.

### Task 3: Add the minimal launched-process lifecycle proof

End state: e2e proves wait-to-terminal (backup file exists at command exit) and interruption/cleanup (follow-up local command succeeds) in the existing boundary.

- [x] Add the minimal e2e coverage per Plan Context.
- [x] Commit the task as `Add local manual-run lifecycle e2e smoke`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just pre-commit` passes, including surface validation and generation freshness.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Add declarative CLI completion metadata for the two async manual triggers, generate it into the httpclient catalog, and make local-mode CLI wait to terminal state with failure propagation and interrupt-safe close; remote 202 behavior and non-async commands unchanged; polling only through generated REST operations"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
