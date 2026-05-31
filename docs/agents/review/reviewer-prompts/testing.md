Review testing only. First read and internalize `docs/TESTING.md`.

Flag problems when:

- Behavior-changing diffs lack targeted, scenario-based coverage for a realistic failure mode.
- New or changed tests violate `docs/TESTING.md`, especially by coupling normal tests to SQL, database schema, stores, services, routers, handlers, or private helpers.
- Integration tests duplicate normal app scenarios instead of covering CLI, true-network REST smoke, or IO/process-boundary behavior.
- Test-client-only helpers are one-off, expose internals, or hide behavior that should be a user-visible REST API.

Avoid generic requests for more tests, branch coverage, or exhaustive cases. Prefer a small number of helpful client-driven scenarios that verify user-visible behavior.

Report problems only - no positive observations.
