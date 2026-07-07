# Plan: Manual REST responsiveness benchmark (Kata mcsf)

Add one manual-only benchmark recipe for current Mina REST responsiveness under realistic local data and moderate parallel query load. The benchmark is for a human to run on demand from the terminal; it is not product behavior, not an automated test, not agent-required verification, and not architecture.

## Plan Context

- `kata show mcsf --agent` acceptance: a hurl-based load-test surface runnable against a locally served app via a Justfile recipe.
- Allowed implementation surface:
  - `mise.toml`: add pinned `hurl` tool dependency.
  - `Justfile`: add the manual benchmark recipe(s) and all lifecycle/data-generation shell needed by those recipes.
  - `scripts/`: new folder for committed hurl script file(s), for example `scripts/rest-benchmark.hurl`.
  - `AGENTS.md`: add a short note that `scripts/` contains repo scripts that are not product code and that manual benchmark recipes must not be run by agents unless the user explicitly asks.
- Forbidden implementation surface:
  - Do not change `docs/architecture.md`, `PROJECT_STATE.md`, `docs/TESTING.md`, frontend docs, business-requirements docs, package docs, or any other project documentation.
  - Do not add a `loadtests/` directory, benchmark README, Go helper package, internal tool, product API, frontend code, CI/pre-commit hook, test suite entry, or standing agent verification guidance.
  - Do not make benchmark recipes prerequisites of `just test`, `just pre-commit`, review-loop prompts, or any existing recipe.
- `mina db validate` exists. It requires `--db`, accepts `--schema`, defaults to full validation, and uses `--shallow` only for schema-only validation. The manual benchmark must include full validation timing against the generated benchmark database.
- The generated benchmark database must be created fresh under ignored `build/load-tests/` by the manual recipe. Do not commit, preserve, or require a prebuilt database.
- Default generated data must contain at least 50,000 valid transactions across 10 years, with at least 100 categories, 5 members, and 50 accounts. Names and transaction shapes can be deterministic bogus data; realism matters only for valid references, varied rows, date spread, and enough volume to exercise REST list queries and validation.
- Terminal output is a required deliverable. The recipe must end with an aligned, human-readable summary table showing current REST timing rows and a full `db validate` timing row.

## Tasks

### Task/Commit 1: Add manual benchmark recipe and hurl script

Add the benchmark as a manual local recipe only. Keep every committed artifact within the allowed file list above, with all generated runtime state under ignored `build/load-tests/`.

- [x] Add pinned `hurl` to `mise.toml`.
- [x] Add `scripts/` and committed hurl script file(s) for the REST benchmark. Keep the hurl scripts focused on API requests and lightweight assertions; do not add README or docs under `scripts/`.
- [x] Update `AGENTS.md` with a short `scripts/` note: repo scripts are not product code, and manual benchmark recipes are never agent-required checks and must not be run unless the user explicitly asks.
- [x] Add Justfile manual recipe(s), with names such as `bench-rest` and `bench-db-validate`, that:
  - [x] build or use the local `mina` binary through existing Justfile-owned build behavior;
  - [x] create a fresh database under `build/load-tests/<run-id>/mina.db`;
  - [x] start `mina serve --db ... --yes --host 127.0.0.1 --port <free-port> --quiet`;
  - [x] generate the benchmark data for the same database from recipe-owned shell logic, with defaults of at least 50,000 transactions, 10 years, 100 categories, 5 members, and 50 accounts;
  - [x] run hurl through `mise exec -- hurl` against the temporary server with moderate configurable parallelism/repetition;
  - [x] include UI-relevant read scenarios such as health, account/category/member lookups, paged transaction lists, account or record reads when available, and the known-expensive unpaged transaction list;
  - [x] include a small valid write share, roughly a 90/10 read/write mix, using captured or generated valid references;
  - [x] stop the server with a trap and avoid coupling to `just dev` pid files;
  - [x] run full database validation timing with `mina db validate --db "$db_path"` by default, adding `--shallow` only when explicitly requested on the validation recipe;
  - [x] write raw hurl outputs/reports only under ignored `build/load-tests/`.
- [x] End the benchmark recipe with a readable terminal summary table. Include scenario or endpoint, request count, success/error counts, total elapsed or requests/sec, useful latency fields available from hurl output such as min/avg/p50/p90/p95/p99/max, and a full `db validate` row.
- [x] Confirm by inspection that no benchmark command is called by `just test`, `just pre-commit`, CI-style recipes, existing recipes, review-loop prompts, or AGENTS-required verification.
- [x] Confirm by inspection that no forbidden files or folders changed.
- [x] Verification
  - [x] `just --list` shows the manual benchmark recipe name(s).
  - [x] Do not run `bench-rest`, `bench-db-validate`, or any full benchmark recipe unless the user explicitly asks for a manual run.
  - [x] `just pre-commit` passes.
  - [x] Update progress in Kata issue `mcsf` with implementation evidence and the manual command names only.
  - [x] Commit changes.

## Final Verification

- [x] Only `mise.toml`, `Justfile`, `scripts/**`, and `AGENTS.md` changed for implementation.
- [x] No architecture, project-state, testing, frontend, business-requirements, package, README, CI, app-code, API, or product docs changed.
- [x] Benchmark recipes are manual-only and are not called by any test, pre-commit, CI-style recipe, existing recipe, review-loop prompt, or required agent workflow.
- [x] Generated benchmark databases and reports are under ignored `build/load-tests/`; no generated database or report files are committed.
- [x] Recipe implementation prints a readable terminal summary table for current REST performance and full database-validation timing.
- [x] Do not run `bench-rest`, `bench-db-validate`, or any full benchmark recipe unless the user explicitly asks for a manual benchmark run.
- [x] `just pre-commit` passes.
- [x] Commit final changes.
- [x] Run `just review-loop "manual hurl REST responsiveness benchmark for kata mcsf; implementation limited to mise.toml Justfile scripts/ and AGENTS.md; no product/docs/architecture/project-state changes; manual-only and not part of tests/pre-commit/agent verification; generated 50k-transaction database under ignored build/load-tests; terminal summary table required; full mina db validate timing included but benchmark not executed unless user requests"`
- [x] Move this plan to `docs/plans/completed/`.
- [x] Close Kata issue `mcsf` after the plan is moved to completed, including implementation evidence and manual command names but not benchmark results unless the user provided them.
