# Plan: Focused concurrent REST race coverage

## Goal

Add a small app-test concurrency slice that exercises Mina's shared in-process
service state through overlapping REST calls, then run only that slice with the
Go race detector while retaining the same tests in the normal suite.

## Constraints

- Add exactly three top-level `TestConcurrent*` functions in
  `internal/apptest/runtime/concurrency_test.go`; keep them untagged and included
  in normal `just test` execution.
- Keep each test a short user scenario using one isolated `newSharedClient` and
  the generated REST client. Setup and assertions stay REST-only per
  `docs/TESTING.md`; do not call services, stores, SQL, handlers, or cache APIs.
- Exercise service/cache synchronization, not database load: use a small fixed
  number of goroutines and bounded start-barrier waves, with no throughput,
  latency, pool-parallelism, or benchmark assertions.
- Do not duplicate existing endpoint validation matrices. Assert only successful
  concurrent responses or the explicitly allowed race outcomes, plus the
  minimal final REST state needed to prove consistency.
- Do not add sleeps, timing-sensitive hooks, mocks, new production APIs, broad
  `t.Parallel` use, build tags, or integration-test coverage.
- Worker goroutines must use a generated REST client captured before launch,
  return results for assertion on the test goroutine, and finish before client
  cleanup; do not call fatal-capable apptest helpers from workers.
- No Kata issue owns this work; do not create, claim, update, or close one.

## Success Criteria

- [x] Three concise `TestConcurrent*` app tests cover concurrent cold reference
  reads, reads overlapping a reference mutation, and dependent creation racing
  reference deletion without re-testing the full behavior of the underlying
  endpoints.
- [x] Default `just test` continues to run the three concurrency tests normally.
- [x] `just test-race-concurrency` instruments
  `internal/apptest/runtime` with `-race` but executes only `TestConcurrent*`.
- [x] CI runs the focused race recipe without adding frontend setup or expanding
  the existing full test job.
- [x] `docs/TESTING.md` briefly owns the concurrent-test naming and focused-race
  execution contract; no product, API, package, or project-state docs change.
- [x] `just test`, `just test-race-concurrency`, `just workflow-check`, and
  `just pre-commit` pass.
- [x] From a clean worktree, run
  `just review-loop --plan "docs/plans/2026-08-05-concurrent-rest-race-tests.md"`
  once, resolve its findings, and rerun affected validation. Do not run
  review-loop more than once; report any remaining findings.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the
  worktree clean.

## Tasks

### Task 1: Exercise shared service state with three concurrent REST scenarios

Create `internal/apptest/runtime/concurrency_test.go` with exactly these focused
top-level scenarios:

1. Concurrent filtered transaction reads begin against cold account, category,
   tag, and member reference caches; every request succeeds and observes the one
   shared fixture.
2. Warm filtered reads overlap one reference mutation that updates or invalidates
   its reference cache; concurrent responses remain valid and one final REST read
   observes the completed mutation.
3. Creation of one dependent resource races deletion of its reference; accept
   either legal ordering, but prove through REST that the final state cannot
   contain an active dependent referencing a deleted resource.

Use existing fixture/request builders where they keep the scenarios readable.
Keep concurrency orchestration local unless at least two tests genuinely benefit
from one small REST-oriented helper under `internal/apptest`.

- [x] The tests overlap calls within each test function without `t.Parallel`,
  sleeps, test-only internals, or leaked goroutines.
- [x] Assertions are limited to the concurrency invariant and minimal final
  state, rather than repeating existing CRUD, filtering, hidden-state, or delete
  guard coverage.
- [x] Commit as `test(apptest): exercise concurrent REST service state`.

### Task 2: Add focused race execution to developer and CI workflows

Add a Justfile recipe that runs only the `TestConcurrent*` convention under
`-race` for `internal/apptest/runtime`, while leaving `just test` unchanged. Add
the recipe as a backend-only CI matrix entry and record the convention briefly
in `docs/TESTING.md`.

- [x] The focused recipe uses repository-owned Go test invocation, disables test
  result reuse, and does not run unrelated app or integration tests.
- [x] The CI entry installs no frontend dependencies and uses the same repository
  tool setup as the existing Go test job.
- [x] Commit as `test(tooling): add focused concurrent race checks`.
