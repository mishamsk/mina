# Frontend Testing

Read [Testing](TESTING.md) first for shared rules and test-class navigation.

## Frontend-E2E-Tests

`frontend-e2e-tests` run only through Playwright and are not run by default. They are a deliberately small set of essential user-visible checks for the embedded browser UI, not a second application suite.

Use them for core browser journeys and material frontend-owned or frontend-wired safeguards that make those journeys usable and safe, including browser rendering, the built `mina` binary, embedded Vite assets, local listener wiring, and UI-only browser persistence.

An eligible frontend e2e test must satisfy every condition:

- It proves essential user-visible behavior that needs a real browser.
- The behavior under test uses normal browser controls and asserts visible UI state, a visible result, or URL navigation.
- It is short, focused, and does not duplicate an existing frontend e2e journey or safeguard.

Cover ordinary positive journeys and important browser safeguards such as action eligibility, disabled states and their reasons, contextual picker filtering, and special read-only UI. Prefer one complete journey plus shallow representative checks across important types or states over repeated full journeys or exhaustive matrices.

Representative tooltip and responsive-layout checks are valid when discoverability or layout is material product behavior. At representative widths, assert coarse usability such as reachable content and actions, intentional collapse or ordering, and no unintended overflow; do not assert exact pixel ratios, coordinate sweeps, or incidental geometry.

Concise API setup and cleanup may arrange test-owned state when it keeps an otherwise eligible journey short and isolated. Fixture plumbing may fail on an unsuccessful request and retain identifiers needed for cleanup, but it must not assert response semantics or payload shape, synchronize the journey on request activity, or serve as the action or evidence under test.

Do not use `frontend-e2e-tests` for:

- REST capability, response, validation, backend-only accounting semantics, domain data-state, or backend error-path coverage; `app-tests` own this coverage, including exhaustive cases and concurrency.
- Direct REST calls for the action or verification under test, REST contract assertions beyond fixture success guards, or API verification.
- Route interception except as a last resort to make an otherwise eligible browser test stable and non-flaky when normal browser behavior cannot do so. It must not assert REST behavior or turn the test into a REST, failure, timing, or concurrency scenario.
- Polling, waiting for requests or responses, fixed delays, or other synchronization on implementation activity; use Playwright's web-first assertions for the visible result.
- Artificial latency, injected failures, retries, rapid typing, rapid repeated actions, multi-tab behavior, races, concurrency, or other unrealistic timing scenarios for Mina's local single-household use.
- Injected error, race, stale-state, or timing matrices; exhaustive frontend combinations; and targeted tests for isolated regressions or implementation details that do not protect material recurring browser behavior or safeguards.
- Direct database, service, store, handler, or private-helper assertions.

Frontend e2e tests prove a few essential browser experiences and safeguards. Keep the suite and every spec intentionally small: add a test only for uncovered material browser behavior, and use only the visible assertions needed to establish it.

- A frontend e2e spec file must not contain more than 25 tests; split growing suites by user workflow.
