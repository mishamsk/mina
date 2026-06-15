Review testing only. First read and internalize `docs/TESTING.md`.

Use `app-tests` and `e2e-tests` in review comments.

Flag problems when:

- Behavior-changing diffs lack targeted, scenario-based coverage for a realistic failure mode.
- New or changed tests violate `docs/TESTING.md`, especially by coupling `app-tests` to SQL, database schema, stores, services, routers, handlers, or private helpers.
- `e2e-tests` cover scenarios that can be moved to `app-tests` or dropped, including duplicate REST endpoint, domain validation, provider edge-case, or app scenario coverage.
- `e2e-tests` contain validation matrices, exhaustive flag/config combinations, or library-owned CLI parsing coverage instead of launched-command, CLI/config/env, true-network REST, or IO/process-boundary smoke.
- Test-client-only helpers are one-off, expose internals, or hide behavior that should be a user-visible REST API.

Avoid generic requests for more tests, branch coverage, exhaustive cases, or more integration coverage. Prefer a small number of helpful client-driven scenarios that verify user-visible behavior. Prefer "move this to `app-tests`" or "drop this coverage" when an `e2e-test` is too broad.

Report problems only - no positive observations.
