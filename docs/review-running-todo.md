# Review Cleanup and Test Policy Alignment

## Plan Context

This plan addresses every item in `docs/review.md`. Start with the durable docs that steer later implementation: `docs/architecture.md`, `AGENTS.md`, and `PROJECT_STATE.md`. Then align developer recipes, pre-commit behavior, generated-code checks, and the test harness with the corrected policy.

## Tasks

### Commit 1: Correct architecture, agent, and project-state docs
- [x] Update `docs/architecture.md` before code or recipe changes.
- [x] Remove `Boundary scenario test` from Core Terms. (`docs/review.md`: `docs/architecture.md:27`)
- [x] Remove the `Where To Look` section that repeats `AGENTS.md`. (`docs/review.md`: `docs/architecture.md:29`)
- [x] Rewrite Persistent State to describe the real DuckDB shape: the app opens an in-memory database first, attaches the persistent accounting-state database when provided, tracks the fully qualified accounting schema in store state, defaults that schema to `main`, allows a configurable schema, and supports in-memory schema storage for demos and tests. (`docs/review.md`: `docs/architecture.md:59`)
- [x] Keep the persistent-state bullets high level and explicitly leave room for later rebuildable in-memory/cache schemas outside accounting state. (`docs/review.md`: `docs/architecture.md:59`)
- [x] Rewrite Testing around only two test classes: in-process high-level boundary tests and testscript-driven end-to-end integration tests. (`docs/review.md`: `docs/architecture.md:101`)
- [x] Specify that end-to-end integration tests run only through testscript, are not run by default, and own real-network REST tests, CLI tests, and later TUI tests. (`docs/review.md`: `docs/architecture.md:101`)
- [x] Specify that normal tests bypass CLI/network but exercise app logic through an in-memory client, in-memory DuckDB, and per-test schemas. (`docs/review.md`: `docs/architecture.md:101`)
- [x] Specify the test assertion tiers: basic persistence checks may create through the client and assert attached database state; other scenario tests should use the client for fixture setup and assertions. (`docs/review.md`: `docs/architecture.md:101`)
- [x] Add the durable test-quality rule that good tests are independent of implementation details and should read as scenarios through reusable harness building blocks. (`docs/review.md`: `docs/architecture.md:101`)
- [x] Simplify `AGENTS.md` pre-commit guidance so the Justfile owns details instead of duplicating recipe internals. (`docs/review.md`: `AGENTS.md:22`)
- [x] Remove the `just test-boundary` workflow line from `AGENTS.md` and align commit verification guidance with the corrected two-test-class policy. (`docs/review.md`: `AGENTS.md:38`)
- [x] Simplify `PROJECT_STATE.md` back to a concise roadmap/status inventory.
- [x] Remove Go module/minimum-Go bullets from `PROJECT_STATE.md`; `go.mod` and `mise.toml` own that detail. (`docs/review.md`: `PROJECT_STATE.md:4`)
- [x] Remove tooling, direct dependency, package inventory, and developer recipe enumeration from `PROJECT_STATE.md`; those are owned by `mise.toml`, `go.mod`, package docs, and `Justfile`. (`docs/review.md`: `PROJECT_STATE.md:5`, `PROJECT_STATE.md:10`, `PROJECT_STATE.md:15`, `PROJECT_STATE.md:149`)
- [x] Keep only short current-stage status, implemented durable capability groups, default operator workflow shape, and known next work in `PROJECT_STATE.md`. (`docs/review.md`: `PROJECT_STATE.md` file-level)
- [x] Verification
  - [x] Required docs updated
  - [x] No code verification required for this docs-only commit

### Commit 2: Align Justfile and local tool bootstrap
- [x] Replace the current top-of-file comments and shell setting with the requested shared import and shell configuration: `import? "~/.justfile"`, Bash with `-euo pipefail`, and the PowerShell Windows shell. (`docs/review.md`: `Justfile:1`, `Justfile:4`)
- [x] Add an `init` recipe that checks for `mise` and `prek`, then installs the pre-commit hook through `prek`. (`docs/review.md`: `Justfile:2`)
- [x] Add `mise.toml` with Go pinned to `1.25`. (`docs/review.md`: `Justfile:2`)
- [x] Keep `just test` limited to the non-testscript in-process test set; full end-to-end testscript suites must not run on default test calls. (`docs/review.md`: `Justfile:19`)
- [x] Remove the `test-boundary` recipe and all Justfile or doc ambiguity that presents it as a separate suite. (`docs/review.md`: `Justfile:21`)
- [x] Route full CLI and real-network REST integration coverage through testscript-owned recipes instead of direct special-case Go test commands. (`docs/review.md`: `Justfile:31`)
- [x] Remove the active empty `smoke` recipe; leave only a clear comment if a future agent-only manual-smoke placeholder is useful. (`docs/review.md`: `Justfile:33`)
- [x] Update docs touched in Commit 1 if recipe names or workflow wording need final alignment.
- [x] Verification
  - [x] `just init` passes
  - [x] `just fmt` passes if code changed
  - [x] `just test` passes
  - [x] The non-default testscript integration recipe passes if created in this commit
  - [x] Required docs updated

### Commit 3: Rebuild pre-commit around light non-mutating checks
- [x] Add all relevant supported `prek` built-in hooks from the documented built-in hook set. (`docs/review.md`: `.pre-commit-config.yaml:1`)
- [x] Remove all test-running hooks from `.pre-commit-config.yaml`; pre-commit must stay light and not run `just test` or any integration suite. (`docs/review.md`: `.pre-commit-config.yaml:19`)
- [x] Replace the mutating OpenAPI pre-commit hook with a non-mutating generated-code freshness check that fails when generated output does not match `api/openapi.yaml` and `api/oapi-codegen.yaml`. (`docs/review.md`: `.pre-commit-config.yaml:9`)
- [x] Add or adjust a Justfile recipe for the non-mutating generated-code check if the hook needs a stable entrypoint.
- [x] Ensure `just pre-commit` runs the configured hooks without falling back to obsolete `test-boundary` behavior.
- [x] Verification
  - [x] `just fmt` passes if code changed
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 4: Move end-to-end coverage fully under testscript
- [x] Inventory current process-level CLI and REST tests and classify them as testscript end-to-end coverage or in-process tests.
- [x] Convert real-network REST API coverage to testscript instead of `go test ./cmd/mina -run TestRESTSmokeProcess`. (`docs/review.md`: `Justfile:31`)
- [x] Keep CLI process behavior coverage in testscript and ensure it is run only by the non-default integration recipe. (`docs/review.md`: `docs/architecture.md:101`)
- [x] Ensure default `just test` excludes all testscript end-to-end suites. (`docs/review.md`: `Justfile:19`)
- [x] Remove or rewrite obsolete Go test wrappers that only existed to invoke process smoke tests outside testscript.
- [x] Update package docs or `PROJECT_STATE.md` only if durable workflow shape changes after the recipe split.
- [x] Verification
  - [x] `just fmt` passes
  - [x] `just test` passes without running testscript suites
  - [x] The non-default testscript integration recipe passes
  - [x] `just pre-commit` passes
  - [x] Required docs updated

### Commit 5: Build the in-process scenario test harness
- [ ] Extend the test harness so normal tests use in-memory DuckDB, per-test schemas, and an in-process typed client that bypasses CLI and network. (`docs/review.md`: `docs/architecture.md:101`)
- [ ] Add reusable scenario builders for common fixtures so tests read as high-level user workflows instead of setup boilerplate. (`docs/review.md`: `docs/architecture.md:101`)
- [ ] Add a supported helper for the narrow persistence-check tier where a test creates through the client and asserts attached database state directly. (`docs/review.md`: `docs/architecture.md:101`)
- [ ] Keep all other scenario setup and assertions routed through the client. (`docs/review.md`: `docs/architecture.md:101`)
- [ ] Ensure the harness hides implementation details such as repository methods, SQL construction, router internals, and service-private helpers from ordinary behavior tests. (`docs/review.md`: `docs/architecture.md:101`)
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test` passes
  - [ ] The non-default testscript integration recipe passes if touched behavior can affect CLI or real-network REST behavior
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

### Commit 6: Refactor current tests to the corrected policy
- [ ] Refactor existing normal tests onto the in-process scenario harness.
- [ ] Move basic create/persist assertions to the approved persistence-check pattern only where that is the behavior under test. (`docs/review.md`: `docs/architecture.md:101`)
- [ ] Refactor transaction, list, filter, update, delete, and bulk-operation scenarios so setup and assertions go through the typed client. (`docs/review.md`: `docs/architecture.md:101`)
- [ ] Remove tests around private helpers where public scenario coverage gives the same signal.
- [ ] Confirm no ordinary test depends on CLI, real network listeners, testscript, or package-private implementation details.
- [ ] Update `PROJECT_STATE.md` only if the durable test/workflow status changed from the earlier doc correction.
- [ ] Verification
  - [ ] `just fmt` passes
  - [ ] `just test` passes
  - [ ] The non-default testscript integration recipe passes
  - [ ] `just pre-commit` passes
  - [ ] Required docs updated

## Deferred Verification

- [ ] Run the non-default testscript integration recipe after any CLI, real-network REST, process startup, or JSON-over-HTTP behavior changes.
- [ ] Run any future manual-smoke commands only when a concrete uncovered risk exists and after adding them as explicit temporary commands or comments, not as an empty default recipe.

## Final Verification

- [ ] `just init` passes on a clean checkout with required local tools available
- [ ] `just fmt` passes
- [ ] `just test` passes without running testscript end-to-end suites
- [ ] The non-default testscript integration recipe passes
- [ ] `just pre-commit` passes without running tests or mutating generated code
- [ ] `docs/review.md` items are all covered by completed tasks in this plan
