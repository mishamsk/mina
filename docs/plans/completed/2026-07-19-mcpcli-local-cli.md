# Plan: Deliver the one-shot runtime profile and CLI local mode

Refactor `internal/runtime` composition into explicit long-running and one-shot execution profiles, then wire `mina client --db PATH <area> <command>` through the in-process `internal/httpclient` transport with no listener and no automatic operations. Existing long-running (`serve`) behavior must remain byte-for-byte intact.

## Plan Context

- Owning docs: `docs/cli-mcp-architecture.md` (Terms, Client Modes and Sessions, Local Runtime Policy, CLI Surface — these are the contract), `docs/architecture.md` (`internal/runtime` "owns explicit one-shot and long-running execution profiles"; `internal/clientcli` must not import runtime; `cmd/mina` composes), `internal/runtime/PACKAGE.md`, `internal/clientcli/PACKAGE.md`, `internal/httpclient` (`NewInProcessClient`), `docs/TESTING.md`, `internal/apptest` harness, `cmd/mina/main.go` (serve's `appconfig.Load` + `configOverride` + `--yes`/`MINA_YES` consent pattern), `cmd/mina/testdata/script/` conventions.
- Runtime profiles: make the execution profile an explicit runtime concept (an `Options` profile field or dedicated constructors — your choice, but explicit at every call site). Long-running keeps today's behavior exactly (startup validation per config for file-backed state, operations per `OperationConfig`, `StartOperations`). One-shot profile:
  - opens/creates and migrates the selected database exactly like today's open policy;
  - skips every database-validation pass, including shallow startup validation (`validateStartupDatabase` must not run);
  - registers manual-operation REST handlers so manual triggers and status reads work, but never starts startup operations, schedules, recurring-operation goroutines, or `StartOperations` — regardless of what app config enables;
  - composes the same REST handler stack as long-running (binding, validation middleware, DTO mapping, services, stores) so local requests behave exactly like remote requests.
  Update every existing `runtime.New*` call site (`cmd/mina` serve/migrate/db, `internal/apptest`) to state its profile explicitly; existing behavior at those sites must not change. Update `internal/runtime/PACKAGE.md` implicit contracts for the profile split in the same commit.
- Local session wiring without breaking boundaries: `internal/clientcli` must not import `internal/runtime` (depguard). `cmd/mina` composes the one-shot runtime app and injects a local session factory into `internal/clientcli` (for example a function returning an `http.Handler` plus closer); `internal/clientcli` builds the client through `httpclient.NewInProcessClient(handler)`. The session owns runtime/database cleanup for the command lifetime: close the runtime app (and thus the database) after the command completes, on error, and on interrupt.
- `mina client` target selection:
  - `--db PATH` flag joins the existing `--server`; explicit `--db` and `--server` together fail with a clear mutual-exclusion error;
  - with neither flag, resolve `DatabasePath` through the standard `appconfig.Load` path (same `configOverride` pattern as serve, honoring `--config-file`); a configured database path selects local mode;
  - when resolution still yields no file-backed target, fail with an actionable message naming both `--db` and `--server` — never fall back to ephemeral in-memory state;
  - database creation and migration consent follows serve's existing prompt policy (`--yes` flag, `MINA_YES`), reusing the existing helpers;
  - when the selected database file is already locked/owned by another process, fail with actionable guidance to use remote mode (`--server`) against the owning server.
- App-test coverage (the policy proof; `internal/apptest/runtime` only, per `docs/TESTING.md`): extend the apptest harness minimally (an option selecting the one-shot profile) and add a small scenario set proving through REST observables that a one-shot app with automatic operations enabled in config (a) records no automatic operation runs (operation status endpoints show none), (b) still serves manual-operation status reads and a manual trigger, and (c) ordinary REST behavior works identically. Do not duplicate existing operation scenarios; keep it to the policy.
- E2E coverage: ONE minimal launched-process script (for example `cmd/mina/testdata/script/mina_client_local.txt`) proving transport and lifecycle only — do not repeat the remote shape matrix:
  1. `mina client --db $WORK/local.db --yes <area> <command>` against a fresh path creates, migrates, serves the command in-process, and prints JSON; a second command against the same file works (persistence across invocations);
  2. explicit `--db` plus `--server` fails with the mutual-exclusion message;
  3. with a `mina serve` process owning the same database file, `mina client --db` fails with the remote-mode guidance;
  4. with neither flags nor config, the actionable no-target message appears.
  Optionally prove validation skip end-to-end (for example `duckdbexec` state that fails `mina db validate` while `mina client --db` still succeeds) — include only if it stays small.
- No-listener proof is structural: the local path must contain no listener construction (`net.Listen`/server start); reviewers verify by inspection and the e2e smoke runs entirely without a port.
- Docs: update `PROJECT_STATE.md` (local CLI mode) and touched PACKAGE.md files (`internal/runtime`, `internal/clientcli`) in the owning commits. Keep bullets short.
- Protect list (must not regress): `mina serve` startup validation, operation startup, demo seeding, prompts, and listener behavior; `mina migrate` and `mina db validate` flows; remote CLI behavior from the previous plan; apptest default harness semantics for existing tests.
- Exclusions: no asynchronous manual-run completion polling or interruption-cancel orchestration (next plan); no MCP work; no changes to generated files, `api/`, or surface config.

## Tasks

### Task 1: Split runtime composition into explicit long-running and one-shot profiles

End state: both profiles exist and are explicit at every call site; one-shot skips all database validation and never starts operation execution automatically while keeping manual-operation handlers; app-tests prove the policy; long-running behavior is unchanged.

- [x] Implement the explicit profile split in `internal/runtime` per Plan Context, updating all call sites and `internal/runtime/PACKAGE.md`.
- [x] Add the minimal apptest harness option and app-test scenarios proving the one-shot policy per Plan Context.
- [x] Commit the task as `Add one-shot runtime execution profile`.

### Task 2: Wire `mina client --db` local mode

End state: `mina client --db PATH <area> <command>` works end to end in-process with no listener; target selection, mutual exclusion, consent, cleanup, and locked-database guidance behave per Plan Context.

- [x] Add the local session factory composition in `cmd/mina` and the `--db` target selection, mutual exclusion, config resolution, consent, cleanup, and locked-database guidance in `internal/clientcli` per Plan Context, updating `internal/clientcli/PACKAGE.md`.
- [x] Commit the task as `Wire mina client local mode through in-process transport`.

### Task 3: Add the local-mode e2e smoke and user-visible docs

End state: the minimal local-mode launched-process smoke passes in the existing e2e boundary and `PROJECT_STATE.md` records local CLI mode.

- [x] Add the single local-mode testscript per Plan Context.
- [x] Update `PROJECT_STATE.md` per Plan Context.
- [x] Commit the task as `Add local CLI e2e smoke and project state`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes, including the new one-shot policy app-tests.
- [x] `just test-integration` passes, including the new local smoke.
- [x] `just pre-commit` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Split internal/runtime into explicit long-running and one-shot profiles (one-shot: open+migrate, manual handlers, no validation, no operation start) and wire mina client --db through the in-process httpclient transport with mutual exclusion, config resolution, consent, cleanup, and locked-db guidance; serve/migrate/db-validate and remote CLI must not regress"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
