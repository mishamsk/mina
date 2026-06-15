# Clarify Test Scope And Trim E2E Tests

## Plan Context

- Use `app-tests` for normal in-process tests in `internal/apptest/runtime`.
- Use `e2e-tests` for testscript-driven launched-process tests in `cmd/mina/testdata/script`.
- Keep the core framing that Mina has exactly two test types and both exercise the app at a high-level app boundary; `app-tests` are high-level app-boundary tests that stay in-process, not lower-level unit or package tests.
- `app-tests` are the default for app behavior; `e2e-tests` are a small smoke suite for process and IO boundaries.
- `app-tests` may use only in-memory state and test-owned temp IO; they must not read or write host user cache/config/data locations.
- Move retained behavior out of bloated `e2e-tests` before deleting those scenarios.
- Do not update `PROJECT_STATE.md`; this is testing and documentation hygiene, not product requirement progress.

## Tasks

### Commit 1: Name Test Classes And Tighten E2E Guidance
- [x] Read `docs/TESTING.md`.
- [x] Update `docs/TESTING.md` to name the two classes:
  - [x] `app-tests`: normal in-process app tests through `internal/apptest/runtime`.
  - [x] `e2e-tests`: testscript launched-process tests through `cmd/mina/testdata/script`.
- [x] Preserve the explanation that these are the only two test types and both are high-level app-boundary tests.
- [x] Make `app-tests` the explicit default for app behavior and user-visible REST scenarios.
- [x] Define `e2e-tests` as a smoke suite only, limited to launched command behavior, CLI/config/env wiring, stdin/stdout/stderr, signals, real network listeners, database files, and external IO protection.
- [x] Add clear negative guidance:
  - [x] Do not add `e2e-tests` for every flag spelling or CLI argument combination.
  - [x] Do not add config precedence matrices beyond a representative wiring smoke.
  - [x] Do not duplicate REST endpoint, domain validation, provider edge-case, or app scenario coverage that can be tested as `app-tests`.
  - [x] Do not chase exhaustive coverage through `e2e-tests`.
- [x] Update `docs/agents/review/reviewer-prompts/testing.md`:
  - [x] Require review comments to use `app-tests` and `e2e-tests`.
  - [x] Require reviewers to ask whether an `e2e-test` can be an `app-test` before requesting or accepting it.
  - [x] Tell reviewers to flag validation matrices, duplicate app scenarios, and library-owned CLI parsing in `e2e-tests`.
  - [x] Prefer "move to app-tests" or "drop this coverage" over asking for more integration coverage.
- [x] Update short package testing notes if they would otherwise contradict the narrowed scope, especially `internal/appconfig/PACKAGE.md`.
- [x] Verification
  - [x] No broad test run; documentation-only change.
  - [x] Commit changes.

### Commit 2: Move Retained Behavior Into App-Tests
- [x] Read `docs/TESTING.md`.
- [x] Add focused `app-tests` for exchange-rate runtime validation currently covered through `mina_config.txt`:
  - [x] Invalid enabled exchange-rate schedule fails runtime composition.
  - [x] Unsupported startup provider fails runtime composition.
  - [x] Add a narrow `internal/apptest` option for startup provider only if needed.
  - [x] Do not keep the disabled-invalid-schedule branch unless it protects a realistic app-visible failure mode.
- [x] Add an `app-test` for startup loading with an existing Frankfurter cache that contains provider quote codes outside Mina's domain currency set:
  - [x] Write a temp cache fixture with one valid `USD/EUR` row and one extra provider-only quote such as `USD/GGP`.
  - [x] Start the app with automatic startup loading enabled and `WithCacheDir` pointed at the test-owned temp cache directory.
  - [x] Assert startup loading succeeds and the visible `USD/EUR` rate is available through REST.
- [x] Add one representative `app-test` for safe partial cache behavior:
  - [x] Write a valid partial Frankfurter cache fixture under a test-owned temp cache directory.
  - [x] Start the app with automatic startup loading enabled.
  - [x] Assert the available rate is loaded through REST and the app remains usable.
- [x] Move cache-population edge cases to `app-tests` when they can be driven deterministically:
  - [x] Cover interrupted, canceled, slow-stream, competing-install, and competing-resume scenarios without real Frankfurter access.
  - [x] Use deterministic test seams such as fake provider/cache dependencies or in-memory HTTP round trippers; do not rely on sleeps, wall-clock timing, external network, or host cache locations.
  - [x] Add a narrow runtime/apptest seam only if needed to inject deterministic cache population behavior without exposing storage internals.
  - [x] Drop only the edge-case variants that cannot be made deterministic without launched-process `e2e-tests` or real provider access.
- [x] Audit existing `app-tests` before adding duplicates:
  - [x] Manual exchange-rate trigger behavior is already covered in `background_operations_test.go`.
  - [x] Exchange-rate loading end-state behavior is already covered in `exchange_rate_loading_test.go`.
  - [x] Demo seed correctness is already covered in `app_admin_test.go`.
- [x] Verification
  - [x] `just test` passes.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.

### Commit 3: Reduce E2E Tests To Smoke Coverage
- [x] Read `docs/TESTING.md`.
- [x] Remove `cmd/mina/testdata/script/mina_bad_flags.txt`.
- [x] Trim `cmd/mina/testdata/script/mina_help.txt`:
  - [x] Keep one root help smoke.
  - [x] Keep one subcommand help smoke.
  - [x] Keep one version smoke.
  - [x] Drop duplicate help and version spellings.
- [x] Trim `cmd/mina/testdata/script/mina_config.txt`:
  - [x] Keep one command-help config annotation smoke.
  - [x] Keep one config-file discovery/load smoke.
  - [x] Keep one environment override smoke.
  - [x] Keep one CLI override smoke.
  - [x] Keep one invalid-present-config smoke.
  - [x] Remove missing-config, duplicate help, version-with-config, disabled invalid schedule, enabled invalid schedule, unsupported startup provider, and auto-load env matrix cases once covered or intentionally dropped.
- [x] Trim `cmd/mina/testdata/script/mina_rest_api.txt`:
  - [x] Keep the real-listener REST smoke.
  - [x] Remove omitted-database coverage duplicated by `mina_database_open.txt`.
  - [x] Keep one access-log e2e case, preferably file redirection because it proves external file IO.
  - [x] Drop default stderr, quiet flag, and `MINA_QUIET` access-log variants.
  - [x] Keep one shallow `--demo` startup smoke.
  - [x] Keep one file-backed demo existing-schema refusal check.
- [x] Trim `cmd/mina/testdata/script/mina_database_open.txt`:
  - [x] Keep missing database prompt safety.
  - [x] Keep `--yes` create/migrate behavior.
  - [x] Keep existing database migration-before-listen smoke.
  - [x] Keep omitted `--db` ephemeral warning smoke.
  - [x] Keep `migrate` applies migrations without listener startup.
  - [x] Keep migration-confirmation-declined preserves the file.
  - [x] Keep custom schema migration smoke.
  - [x] Remove `migrate` rejecting `--host`.
- [x] Trim `cmd/mina/testdata/script/mina_exchange_rate_loading.txt`:
  - [x] Keep one manual exchange-rate load smoke through a real listener.
  - [x] Keep one automatic startup loading smoke proving the listener binds and the startup operation completes.
  - [x] Remove provider quote-code, platform cache fallback, interrupted cache, canceled cache, slow stream, competing install, and competing resume cases after retained deterministic behavior is moved to `app-tests`.
  - [x] Remove unused embedded fixtures after the script is trimmed.
- [x] Remove unused testscript helper code from `cmd/mina/cli_smoke_test.go`:
  - [x] Remove `frankfurter` modes no longer used by scripts.
  - [x] Keep `waitfile`; it is a useful general-purpose e2e helper even if the trimmed scripts no longer use it.
  - [x] Keep `glob`; it is a useful general-purpose e2e helper even if the trimmed scripts no longer use it.
  - [x] Keep DuckDB helpers still used by database-file safety e2e-tests.
- [x] Verification
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.
  - [x] Commit changes.

## Final Verification

- [x] `just test` passes.
- [x] `just test-integration` passes.
- [x] `just pre-commit` passes.
- [x] Commit final changes if needed.
- [x] Run `just review-loop "clarify test scope and trim e2e-tests: use app-tests/e2e-tests names; e2e-tests are process and IO smoke only; retained behavior moved to app-tests before deleting bloated scripts"`.
- [x] Move this plan to `docs/plans/completed/`.
