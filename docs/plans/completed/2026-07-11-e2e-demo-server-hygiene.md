# Plan: Frontend e2e demo server hygiene (Kata 2d1e)

Stop stale reused demo servers from poisoning cross-run frontend e2e state. Today `frontend/playwright.config.ts` starts two `mina serve --demo` web servers (ports `MINA_FRONTEND_E2E_PORT`, default 18080, and that port + 1) with `reuseExistingServer: !process.env.CI`. Interrupted Playwright runs leak those servers; later runs silently reuse them, so accumulated fixture mutations (members, accounts, categories created by earlier specs/runs) break specs that assume pristine demo data. Fix: the `test-frontend-e2e` Justfile recipe kills stale `mina serve` listeners on the two e2e ports before running Playwright, and Playwright never reuses an existing server.

## Plan Context

- Kata issue: `2d1e` — "Frontend e2e: stale reused demo servers poison cross-run state".
- The e2e ports (18080/18081 by default) are used only by Playwright-launched `mina serve --demo` processes. `just dev` uses port 8080 (or a high port), so killing mina listeners on the e2e ports cannot hit an intentional dev server.
- The Justfile is the only owner of developer recipes; the guard lives in the `test-frontend-e2e` recipe as embedded bash, in the same style as the existing `dev-kill` recipe (which already demonstrates the `pgrep`/`lsof`/`ps` patterns to identify `mina serve` processes).
- With the guard in place, `reuseExistingServer: false` is safe: the ports are free (or held by a non-mina process, which must be a hard, clearly-reported error — never kill non-mina processes).
- Do not add new test code for the recipe itself: this is developer tooling; per repo rules it is validated by running the recipe (including a manual stale-server smoke) and `just pre-commit`.
- Do not change ground-truth docs (`docs/webui-design.md`, `docs/architecture.md`, `docs/frontend-architecture.md`, theme or semantics docs).

## Tasks

### Task/Commit 1: Kill stale e2e demo servers before Playwright and never reuse servers

Make every `just test-frontend-e2e` run start from pristine demo state. After this commit, leaked servers from interrupted runs are reaped automatically and Playwright always launches fresh demo servers.

- [x] In `Justfile`, extend the `test-frontend-e2e` recipe with an embedded bash pre-step (before `playwright test`) that:
  - [x] Computes the two e2e ports from `MINA_FRONTEND_E2E_PORT` (default 18080) and port + 1, matching `frontend/playwright.config.ts`.
  - [x] For each port, finds listening PIDs (`lsof -nP -tiTCP:$port -sTCP:LISTEN`), and for each PID inspects its command line (`ps -p <pid> -o command=`).
  - [x] Kills only processes whose command line is a `mina serve` invocation (reuse the `dev-kill` matching approach); sends TERM, waits briefly for exit, escalates to KILL if still alive, and prints what it killed.
  - [x] Fails the recipe with a clear message (port, pid, command) if a listener on an e2e port is not a `mina serve` process — do not kill it.
  - [x] Leaves the recipe otherwise unchanged (still `build`-dependent, still installs browsers, still runs `playwright test`).
- [x] In `frontend/playwright.config.ts`, set `reuseExistingServer: false` unconditionally so no run ever adopts a pre-existing (possibly polluted) server.
- [x] Manual smoke: with the repo built, start a decoy stale server (`MINA_FX_AUTO_LOAD_ENABLED=false ./bin/mina serve --host 127.0.0.1 --port 18080 --quiet --demo &`), then run `just test-frontend-e2e` and confirm the recipe reports killing the stale server and the suite passes; confirm no `mina serve` listeners remain on 18080/18081 afterwards (`lsof -nP -iTCP:18080 -iTCP:18081 -sTCP:LISTEN`).
- [x] Verification
  - [x] `just test` passes
  - [x] `just pre-commit` passes
  - [x] `just test-frontend-e2e` passes
  - [x] Update progress in Kata issue `2d1e` (`kata comment 2d1e --agent ...`)
  - [x] Commit changes

## Final Verification

- [x] `just test` passes
- [x] `just pre-commit` passes
- [x] `just test-frontend-e2e` passes
- [x] Commit final changes
- [x] Run `just review-loop "Frontend e2e demo server hygiene (kata 2d1e): test-frontend-e2e recipe kills stale mina serve listeners on the e2e ports (18080/18081 by default) before Playwright, refuses to kill non-mina listeners, and playwright.config.ts sets reuseExistingServer:false unconditionally; tooling-only change, no app code touched"`
- [x] Move this plan to `docs/plans/completed/`
