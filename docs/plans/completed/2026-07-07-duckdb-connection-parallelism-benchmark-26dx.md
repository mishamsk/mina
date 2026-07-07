# Plan: DuckDB connection parallelism benchmark (Kata 26dx)

Evaluate whether Mina should use a small fixed DuckDB connection pool. The merge path is either a benchmark-backed fixed pool size, or no merge if parallelism is not clearly faster and correct. Do not add a final user-facing pool-size knob.

## Plan Context

- Kata `26dx` tracks the benchmark and merge decision.
- Required evidence: baseline-vs-candidate Hurl benchmark results, per-API p50/p90/p95/p99 reporting when available from current output, concurrent read/write correctness checks, full `db validate` status, and DuckDB error findings.
- Final code must not add a CLI flag, app config key, config-file field, REST field, documented setting, or permanent env var for DuckDB pool size.
- A temporary direct env override may be wired into code for benchmark development only. Remove it before any final merge commit.
- Candidate pool sizes must stay small: baseline `1`, candidates `2` and `4`. An optional diagnostic probe may use `min(8, runtime.NumCPU())` only to confirm whether higher values saturate; the final fixed size must be `2` or `4`, bounded by `runtime.NumCPU()`.
- Prefer running the existing manual benchmark and preserving enough output under ignored `build/` paths to assess the result. Do not change benchmark scripts unless the current output cannot answer the merge decision.

## Tasks

### Task/Commit 1: Add pool-capable DuckDB opening and safety coverage

Enable the branch to exercise pooled DuckDB connections through normal app/runtime paths. Keep pool mechanics in `internal/store`; keep any pool-size choice as runtime-owned policy rather than app configuration.

- [x] Add a small store-owned open setting that validates `MaxOpenConns >= 1`.
- [x] Replace owned app database opening with `duckdb.NewConnector` plus `sql.OpenDB`, so every pooled connection can run DuckDB initialization before `database/sql` uses it.
- [x] Move file attach/read-only attach for owned `AppDB` handles into per-connection initialization so each pooled connection sees the selected accounting database.
- [x] Preserve close semantics: owned `AppDB` closes the process handle; borrowed `OpenAppDBWithProcessDB` handles detach file-backed accounting state and do not close the borrowed process handle.
- [x] Ensure in-memory accounting state and file-backed accounting state both work with pooled connections.
- [x] Add a temporary benchmark-only pool-size override by reading an env var directly in code, outside `internal/appconfig` and outside CLI parsing. Mark it clearly for removal before final merge.
- [x] Keep `internal/apptest` process-database setup aligned with the store-owned opening path if pooled app-tests need a reusable process handle.
- [x] Add app-tests that run through the generated REST client with a pooled candidate size for both in-memory and file-backed accounting state:
  - [x] concurrent cheap reads can run while an expensive transaction-list request is in flight;
  - [x] concurrent spend writes complete without 5xx responses or DuckDB attach/catalog errors;
  - [x] each successful write is observable afterward through REST list/search behavior, without SQL assertions in app-tests.
- [x] Do not add unit tests or SQL-level app-test assertions.
- [x] Update `internal/store/PACKAGE.md` and `internal/runtime/PACKAGE.md` only if the final pool ownership or side-effect contract is not obvious from exported Go docs. Do not update `internal/appconfig/PACKAGE.md` for pool size because no appconfig contract should exist.
- [x] Verification
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.
  - [x] Update progress in Kata issue `26dx`.
  - [x] Commit changes.

### Task/Commit 2: Run existing benchmark and preserve comparison data

Use the existing manual benchmark first. Keep benchmark mechanics simple and save the raw data needed for assessment under ignored `build/load-tests/` paths.

- [x] Run the existing benchmark recipe or script without changing it, using the temporary env override to select the baseline or candidate pool size.
- [x] Save each run's existing output into a distinct ignored directory such as `build/load-tests/rest-benchmark/duckdb-pool-<size>/`.
- [x] Preserve the existing summary, Hurl JSON or logs, server logs, db-validate output, command line, env values, commit SHA, machine CPU count, and timestamp for every run.
- [x] Compare the saved summaries with a throwaway local command, spreadsheet, shell one-liner, or checked-in script only if a checked-in script is clearly worth keeping.
- [x] Capture baseline, candidate, and percentage delta rows from available current output for at least:
  - [x] `rest-health`
  - [x] `rest-account-get`
  - [x] `rest-accounts-list`
  - [x] `rest-account-balances`
  - [x] `rest-transactions-paged`
  - [x] `rest-transactions-unpaged`
  - [x] `rest-write-spend`
- [x] Use the benchmark's existing post-workload checks, output files, and full `mina db validate --db "$db_path"` result to assess write correctness.
- [x] Capture concurrent read/write failures by preserving Hurl non-2xx counts and scanning saved server stderr for DuckDB conflict, catalog, attach, transaction, or connection errors.
- [x] If existing benchmark output is insufficient for the merge decision, make the smallest possible benchmark script change and keep it manual-only.
- [x] Verification
  - [x] Benchmark artifacts for each run are saved under ignored `build/load-tests/` paths.
  - [x] Comparison notes identify the exact source files used for baseline and candidate rows.
  - [x] Update progress in Kata issue `26dx`.
  - [x] Commit only if a benchmark script, checked-in comparison helper, or docs note changed.

### Task/Commit 3: Run the benchmark matrix and make the merge decision

Use the benchmark suite as the Kata evidence. Compare the one-connection baseline against small candidates on the same benchmark shape before deciding whether any code should be merged.

- [x] Run a baseline benchmark with pool size `1`, using the existing benchmark command and saving the run artifacts.
- [x] Run candidate benchmarks for pool sizes `2` and `4`, using identical benchmark parameters and fresh comparable database fixtures for each run.
- [x] Optionally run one diagnostic upper probe at `min(8, runtime.NumCPU())` if it helps show where benefits stop. Do not choose a final value above `4`.
- [x] Generate or manually capture comparison output under `build/load-tests/rest-benchmark/`, including p50/p90/p95/p99 deltas for the required APIs when those values are present in current benchmark output.
- [x] Inspect raw Hurl output and server stderr for every run; record any DuckDB conflict, catalog, attach, transaction, or connection errors.
- [x] Confirm every run's expected writes are visible afterward and full database validation succeeds.
- [x] Select the smallest candidate that materially improves cheap-read tail latency without meaningful write latency, correctness, or error regression.
- [x] If no candidate is clearly faster and safe, do not keep the pool code as a dormant configurable feature; record the no-merge decision in Kata `26dx` with benchmark evidence and stop.
- [x] If a candidate is clearly faster and safe, continue to the finalization task.
- [x] Verification
  - [x] Update progress in Kata issue `26dx` with command parameters, summary path, observed errors, and the selected merge decision.

### Task/Commit 4: Finalize fixed pool policy if the benchmark wins

This task runs only if benchmark evidence supports merging DuckDB connection parallelism. The final implementation must be fixed and small, not user-configurable.

- [x] Remove the temporary env override and any benchmark script change that only exists to feed it, if such a script change was needed.
- [x] Set the runtime-owned pool policy to `min(<selected fixed size>, runtime.NumCPU())`, where `<selected fixed size>` is `2` or `4`.
- [x] Keep benchmark scripts simple; retain only benchmark changes that are useful without a pool-size runtime knob.
- [x] Update app-tests so they exercise the final fixed policy instead of the temporary env override.
- [x] Update package docs only for non-obvious final ownership, side effects, or invariants.
- [x] Confirm no appconfig, CLI, config-file, REST, or documented setting exposes DuckDB pool size.
- [x] Verification
  - [x] `just test` passes.
  - [x] `just test-integration` passes.
  - [x] `just pre-commit` passes.
  - [x] Update progress in Kata issue `26dx`.
  - [x] Commit changes.

## Final Verification

- [x] If the benchmark did not justify a fixed pool, confirm the branch is not merged and Kata `26dx` records the benchmark-backed no-merge decision.
- [x] If the benchmark justified a fixed pool, confirm `just test`, `just test-integration`, and `just pre-commit` pass after removing temporary benchmark-only configurability.
- [x] Confirm no frontend runtime behavior changed; do not run `just test-frontend-e2e` unless later implementation touches embedded UI or browser behavior.
- [x] Confirm benchmark commands remain manual-only and are not required by tests, pre-commit, CI-style recipes, or agent workflow.
- [x] Confirm benchmark evidence includes available p50/p90/p95/p99 baseline-vs-candidate deltas for the required APIs, write correctness, full db-validate status, and DuckDB error/conflict findings.
- [x] Commit final changes.
- [x] Run `just review-loop "DuckDB connection parallelism benchmark for kata 26dx; final implementation has no user-facing pool-size config; benchmark uses existing manual benchmark where possible; compare one connection against small candidates 2 and 4; merge only if a fixed small pool is measurably faster and correct"`
- [x] Move this plan to `docs/plans/completed/`.
- [x] Close Kata issue `26dx` after the plan is moved to completed, including commit SHA, validation commands, benchmark summary path, and selected default or no-merge decision.
