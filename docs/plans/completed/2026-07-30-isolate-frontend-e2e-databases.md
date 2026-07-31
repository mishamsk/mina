# Plan: Isolate frontend E2E backends per test (Kata 2ffd)

Give every frontend E2E test and retry a fresh demo database and Mina process without changing behavioral coverage or test bodies. Completion requires parallel Chromium and WebKit runs to pass locally and through a manually dispatched `build-and-publish-docker.yml` run on the pushed `fix-flake-e2e-tests` branch, on the first attempt and with no leaked processes or temporary database files.

## Completion Record

- Misha authorized completing the isolation infrastructure with known assertion flakes recorded as follow-up work.
- Local zero-retry runs reported 386/386, 386/386, and 385/386 before review; the accounts assertion flake is Kata `98wt`. The post-review run passed 386/386 in 3.6 minutes.
- Manual workflow run `30584085493` tested pushed SHA `4c2ec633ed829c2be6b060856ad0578db084bbdc`: pre-commit, test, and integration passed; Linux E2E reported 384/386 in 14.6 minutes with two assertion flakes tracked by Kata `jfja`; Docker was skipped because Tests failed.
- The required review-loop command ran once. It stopped after four internal iterations; its final three findings were resolved and validated in commit `4c2ec633`.

## Plan Context

- Current architecture: `frontend/playwright.config.ts` starts one demo Mina server per browser/worker slot, so tests and retries assigned to a slot share mutable backend state even though Playwright resets browser contexts.
- Chosen isolation: suite setup creates one deterministic, immutable, file-backed demo template using the built `bin/mina` and the existing `2026-05-31` anchor. A test-scoped fixture copies that template into a unique OS temporary directory and starts Mina against the copy on an OS-assigned port.
- Startup policy: per-test servers set `MINA_STARTUP_VALIDATION=none` and retain `MINA_FX_AUTO_LOAD_ENABLED=false`; validation behavior remains covered by its owning app and integration tests rather than every frontend browser test.
- Evidence: on the local APFS benchmark, an 8.8 MiB template copy plus startup and a verified `/api/health` response took 115.6 ms with shallow validation and 88.1 ms with validation disabled, versus 625.2 ms for fresh in-memory demo seeding. Linux CI performance must be observed but does not change the isolation contract.
- Scope boundary: do not change `frontend/tests/e2e/*.spec.ts`, test assertions, test inventory, frontend product code, Go product behavior, OpenAPI, or product-state documentation. Expected changes are limited to Playwright configuration and lifecycle helpers, their package documentation, and the CI worker/retry mitigation.
- Cleanup contract: normal completion, setup failure, test failure, worker shutdown, `SIGINT`, and `SIGTERM` all stop owned Mina processes before removing only their exact test-owned temporary paths. Cleanup must be idempotent, bounded, and safe under concurrent workers and retries; no broad `/tmp` scans or cross-invocation process killing.
- Parallelism: every test/retry uses a unique writable database, backup directory, listener, and process. The template is read-only after creation and shared only as a copy source.
- Diagnostics: readiness requires a successful health response, not only the listening log. Startup and cleanup failures retain useful bounded process output, while zero-retry failures retain a Playwright trace.
- Owning guidance: follow [`docs/TESTING.md`](../../TESTING.md), [`docs/frontend-architecture.md`](../../frontend-architecture.md), and [`frontend/PACKAGE.md`](../../../frontend/PACKAGE.md).

## Tasks

### Task 1: Replace shared worker servers with test-scoped database and process isolation

End state: Playwright owns one immutable demo template for the invocation and a fresh writable copy plus Mina process for every logical test execution and retry. Existing spec imports continue through `frontend/tests/e2e/test.ts`, and no test body knows about lifecycle mechanics.

- [x] Add suite setup/teardown that creates the template in an OS temporary directory, seeds it once through the built Mina binary with the fixed demo anchor, verifies health, closes the seed process, and prevents the template from being mutated in place.
- [x] Replace the browser/worker `webServer` pool and captured-URL routing with a test-scoped fixture that copies the template, starts Mina with file validation and automatic FX loading disabled, verifies health, and supplies that process's base URL to browser and direct request fixtures.
- [x] Preserve configurable Playwright worker concurrency while removing assumptions that worker slots correspond to prestarted server slots; test retries must receive new database copies rather than the failed attempt's state.
- [x] Make teardown idempotently stop each owned process with a bounded graceful-to-forced escalation and remove its database, backup directory, and enclosing temporary directory after normal, failing, interrupted, and partially initialized runs.
- [x] Update frontend package testing notes to document per-test backend isolation, template ownership, worker semantics, and the fact that no template database is committed to the repository.
- [x] Keep every `frontend/tests/e2e/*.spec.ts` file byte-for-byte unchanged and preserve the existing 193 logical tests / 386 browser-project executions.
- [x] Run `just pre-commit`.
- [x] Run `MINA_FRONTEND_E2E_WORKERS=4 just test-frontend-e2e --retries=0`.
- [x] Run one intentional early-failure smoke and one `SIGINT` smoke; after each, confirm all invocation-owned Mina processes have exited and all recorded test/template temporary paths are absent.
- [x] Commit the task as `test(frontend): isolate e2e backends per test`.

### Task 2: Restore parallel, first-attempt-only frontend E2E CI

End state: local and GitHub frontend E2E runs use parallel workers without retries, so any reported flake or second-attempt pass fails the gate instead of masking instability.

- [x] Set Playwright retries to zero in every environment and retain traces on first-attempt failures.
- [x] Remove the temporary one-worker frontend E2E CI cap so GitHub uses the configured four-worker default; leave unrelated matrix jobs unchanged.
- [x] Record the authorized consecutive-run exception: 386/386, 386/386, then 385/386 due to the assertion flake tracked by Kata `98wt`; a post-review run passed 386/386 with four workers and zero retries.
- [x] Record local pass counts, elapsed times, cleanup-smoke evidence, and Linux suite timing on Kata `2ffd`.
- [x] Commit the task as `ci: restore parallel first-attempt frontend e2e`.

### Task 3: Prove the pushed branch through the manual publish workflow

End state: GitHub has tested the pushed implementation commit through the repository's manually dispatched build-and-publish workflow, and the workflow provides explicit evidence that frontend E2E passed without retries or flakes.

- [x] Push all implementation and review-fix commits to `origin/fix-flake-e2e-tests`, record the pushed tip SHA, and confirm the remote branch resolves to that SHA.
- [x] Manually dispatch `.github/workflows/build-and-publish-docker.yml` with `fix-flake-e2e-tests` as its `ref`; do not rely on a push-triggered or unrelated workflow run as acceptance evidence.
- [x] Confirm run `30584085493` reports `workflow_dispatch`, `headBranch: fix-flake-e2e-tests`, and pushed SHA `4c2ec633ed829c2be6b060856ad0578db084bbdc`, then record its final conclusion.
- [x] Record the authorized CI exception: reusable E2E passed 384/386 with zero retries; the two assertion flakes are Kata `jfja`; Docker was skipped because Tests failed.
- [x] Record the workflow run URL, run ID, tested SHA, job conclusions, and Playwright result on Kata `2ffd`.

## Success Criteria

- [x] Every task's isolation-infrastructure outcome is complete under the authorized assertion-flake exception.
- [x] No frontend E2E spec, assertion, or behavioral coverage changed; the suite still lists 193 logical tests and 386 Chromium/WebKit executions.
- [x] `just pre-commit` passes.
- [x] Record the authorized local exception and follow-up Kata `98wt`; the post-review four-worker, zero-retry run passed 386/386 on the first attempt.
- [x] Normal, forced-failure, `SIGINT`, and `SIGTERM` paths leave no invocation-owned Mina process, database copy, backup directory, or template directory behind.
- [x] Planned implementation and review-fix commits are present and the worktree was clean before archival.
- [x] With a clean worktree run `just review-loop --plan "docs/plans/2026-07-30-isolate-frontend-e2e-databases.md"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. The plan is immutable ground truth for reviewers and fixers. Never invoke review-loop a second time; findings that remain after the fix commits go into the completion report instead.
- [x] All implementation and review-fix commits are pushed to `origin/fix-flake-e2e-tests`; remote SHA `4c2ec633ed829c2be6b060856ad0578db084bbdc` was recorded before CI dispatch.
- [x] Manual `workflow_dispatch` run `30584085493` tested the recorded remote SHA and its final conclusion is recorded under the authorized exception.
- [x] Record that exact run's 384/386 zero-retry E2E result, skipped Docker job, and assertion-only follow-up Kata `jfja`.
- [x] Close Kata `2ffd` with implementation commits plus local and CI validation evidence.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
