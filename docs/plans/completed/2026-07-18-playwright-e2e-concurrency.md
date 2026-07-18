# Parallel-safe frontend e2e worker pools (Kata 4h0b)

## Summary

Allow arbitrary concurrent worktrees to run frontend e2e tests without shared ports, databases, backup directories, or process cleanup. Each invocation defaults to four Playwright workers and launches eight isolated, Playwright-owned Mina processes: four each for Chromium and WebKit.

## Interface Changes

- Add `MINA_FRONTEND_E2E_WORKERS`, a positive-integer developer setting defaulting to `4`. It sizes both Playwright's workers and each browser's Mina server pool.
- Add a shared e2e test entrypoint exporting `test`, `expect`, `Locator`, `Page`, and `Route`.
- Internal captured URL names follow `MINA_FRONTEND_E2E_<BROWSER>_<SLOT>_URL`.
- Raw `--workers` values above the configured pool fail clearly and direct callers to `MINA_FRONTEND_E2E_WORKERS`.

## Task/Commit 1: Implement isolated dynamic server pools

Replace fixed-port lifecycle management with Playwright-owned, OS-assigned listeners and stable per-worker routing.

- [x] Comment on Kata `4h0b` that implementation now includes four-worker intra-run concurrency and unique backup directories.
- [x] Update `frontend/playwright.config.ts`:
  - [x] Validate `MINA_FRONTEND_E2E_WORKERS` as a positive safe integer, default `4`.
  - [x] Set Playwright `workers` from that value without enabling `fullyParallel`.
  - [x] Generate one `webServer` entry per browser and worker slot.
  - [x] Launch Mina with `--host 127.0.0.1 --port 0 --quiet --demo`.
  - [x] Set `MINA_FX_AUTO_LOAD_ENABLED=false` through `webServer.env`.
  - [x] Give each server a backup directory isolated by Playwright PID, browser, and slot.
  - [x] Give every server a distinct name and exact `wait.stdout` named capture for `listening http://127.0.0.1:<port>`.
  - [x] Retain the 30-second startup timeout and add `gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 }`.
  - [x] Remove fixed URLs, `MINA_FRONTEND_E2E_PORT`, `url`, `port`, and `reuseExistingServer`.
- [x] Add `frontend/tests/e2e/test.ts`:
  - [x] Override `baseURL` using project name and stable `testInfo.parallelIndex`.
  - [x] Reject unknown projects, slots outside the configured pool, absent captures, and URLs not matching `http://127.0.0.1:<port>`.
  - [x] Re-export the currently used Playwright test API and types.
- [x] Change all 12 e2e specs to import from `./test`; make no other spec changes.
- [x] Simplify `test-frontend-e2e` in the Justfile:
  - [x] Remove fixed-port environment handling and all `lsof`, `ps`, listener inspection, and process-killing logic.
  - [x] Preserve the build dependency, browser installation, argument forwarding, and Playwright invocation.
- [x] Add one short frontend package testing note documenting the worker setting and default.
- [x] Leave product architecture, UI design, OpenAPI, and `PROJECT_STATE.md` unchanged.
- [x] Verification:
  - [x] `just test`
  - [x] `just pre-commit`
  - [x] `MINA_FRONTEND_E2E_WORKERS=4 just test-frontend-e2e --project=chromium`
  - [x] `just test-frontend-e2e`
  - [x] Confirm debug output shows eight distinct URLs and none remains reachable after the normal run.
  - [x] Commit the coherent implementation.

## Final Verification and Closure

- [x] From two separate worktrees at the implementation commit, launch `DEBUG=pw:webserver just test-frontend-e2e` concurrently.
- [x] Confirm both four-worker suites pass, all 16 Mina URLs are distinct, fixture mutations remain isolated, and neither run reports a bind conflict or signals the other.
- [x] Run a direct forced-failure smoke with `DEBUG=pw:webserver mise exec -- pnpm exec playwright test --timeout=1`.
- [x] Confirm the smoke fails as intended and all eight URLs captured for that invocation become unreachable afterward.
- [x] Commit any review fixes, rerun affected checks, then run:
  - [x] `just review-loop "Make frontend e2e concurrency parallel-safe (kata 4h0b): Playwright-owned port-0 Mina server pools sized by MINA_FRONTEND_E2E_WORKERS, default 4; browser and stable parallel-index isolation; unique backup directories; no fixed ports, reuse, listener scans, or cross-session killing; preserve serial order within spec files" <implementation-sha>`
- [x] Move the plan to `docs/plans/completed/` and commit the archival change.
- [x] Close Kata `4h0b` with the final implementation SHA and evidence for `just test`, `just pre-commit`, `just test-frontend-e2e`, the concurrent-worktree smoke, and forced-failure cleanup.

## Assumptions

- Worker parallelism remains file-level; tests within one spec retain their current ordering.
- More concurrent worktrees require no coordination; practical limits are machine CPU, memory, and browser capacity.
- Explicit SIGINT/SIGTERM isolation smokes are not closure gates. Playwright's documented process-group shutdown remains configured and the forced-failure smoke verifies cleanup.
- The design relies on Playwright's documented named web-server captures and stable `parallelIndex` behavior: [web server](https://playwright.dev/docs/test-webserver), [parallelism](https://playwright.dev/docs/test-parallel).
