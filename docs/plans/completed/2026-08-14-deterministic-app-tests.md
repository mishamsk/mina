# Plan: Make app-tests deterministic by construction

## Goal

Remove the low-value flaky categories retry frontend e2e test and make app-tests use shared deterministic time, schema, and asynchronous-state helpers, with architecture lint preventing direct wall-clock waits and nondeterministic fixture sources from returning.

## Constraints

- App-test bodies under `internal/apptest/runtime` must not use wall time, timeout polling, random values, or UUIDs.
- `internal/apptest` may use a generous real-time watchdog only to diagnose a hung test; watchdog expiry must fail, never satisfy a passing assertion.
- App-test behavior remains observable through the generated in-process REST client; helpers must not inspect stores, services, SQL, or runtime internals.
- Keep fake clocks and synchronization controls test-owned. Do not add production test hooks or duplicate production validation.
- Remove only the approved categories retry-cancellation frontend e2e test; keep the production cache/retry behavior unchanged.

## Success Criteria

- [x] The flaky categories retry-cancellation frontend e2e test is removed and the remaining categories browser scenarios pass.
- [x] `apptest.New` supplies a canonical fake clock by default and the client exposes deterministic current-time and clock-advance helpers; explicit custom clocks remain supported.
- [x] Reopened accounting-state scenarios use a shared test-scoped schema-name helper instead of wall-clock uniqueness.
- [x] Shared REST and fake-side-effect helpers wait for exact observable states or events and use real time only as a diagnostic deadlock watchdog.
- [x] The recurring exchange-rate schedule test proves startup success, scheduler readiness, the exact scheduled successful run, and the resulting rate without revision-only synchronization.
- [x] No app-test body directly uses prohibited wall-clock, timeout, random, or UUID APIs, and `internal/tools/archlint` rejects future uses.
- [x] `docs/TESTING.md` and affected package docs state the deterministic app-test contract without duplicating implementation details.
- [x] `just prose-fmt`, `just test`, `just pre-commit`, and `just test-frontend-e2e tests/e2e/categories-page.spec.ts` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-14-deterministic-app-tests.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.

## Tasks

### Task 1: Centralize deterministic app-test primitives

Add the canonical fake clock, client time controls, deterministic test-scoped accounting schema names, exact REST-state waits, fake deadline readiness, and controlled side-effect barriers to `internal/apptest`. Keep a single private watchdog implementation for hang diagnostics.

- [x] Existing app-test setup can express all current time, cross-client schema, and asynchronous-operation scenarios without direct nondeterministic APIs.

### Task 2: Migrate every app-test body

Replace business-time reads with the client fake clock, wall-clock schema suffixes with the shared schema helper, polling loops with typed REST waits, and channel timeouts with controlled fake events. Rewrite negative timing assertions as event/state ordering.

- [x] The recurring schedule regression synchronizes on startup completion and installed schedule wait before advancing time, then asserts a successful scheduled run by identity and trigger.
- [x] `rg` finds no prohibited wall-clock, timeout, random, or UUID calls under `internal/apptest/runtime`.

### Task 3: Enforce and document the rule

Extend `internal/tools/archlint` with AST-based checks scoped to app-test files, document the deterministic testing rule, and update affected package contracts. Remove the approved frontend e2e scenario without changing frontend runtime code.

- [x] A manual archlint smoke fixture demonstrates a prohibited call is rejected, while repository lint and relevant tests pass.
