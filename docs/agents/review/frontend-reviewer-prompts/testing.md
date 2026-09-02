Review only changed `frontend/tests/e2e` browser-test code. First read and internalize `docs/TESTING.md` and `docs/FRONTEND-TESTING.md`.

Flag problems when:

- A frontend e2e test does not prove one short, uncovered essential browser journey or material frontend-owned or frontend-wired safeguard using normal controls and visible UI state, a visible result, or URL navigation.
- A frontend e2e test duplicates existing coverage or repeats a full journey where one complete journey plus shallow representative checks across important types or states would suffice.
- A frontend e2e test covers REST capability, validation, backend-only accounting semantics, domain data states, backend errors, retries, or concurrency; `app-tests` own application behavior, including exhaustive coverage and concurrency.
- A frontend e2e test calls REST for its action or verification, asserts REST contracts, verifies through the API, waits for requests or responses, polls implementation activity, or uses fixed delays. Concise API setup and cleanup may fail on unsuccessful requests and retain fixture identifiers, but is otherwise allowed only to keep an eligible journey short and isolated.
- A frontend e2e test simulates artificial latency, failures, rapid typing, rapid repeated actions, races, or multi-tab behavior.
- A frontend e2e test uses route interception without documenting why normal browser behavior cannot produce a stable, non-flaky version of the same eligible journey. Interception must not assert REST behavior or turn the test into a REST, failure, timing, or concurrency scenario.
- A frontend e2e test builds injected error, race, stale-state, or timing matrices; exhaustive frontend combinations; or assertions around incidental implementation details.
- A responsive test asserts exact pixel ratios, coordinate sweeps, or incidental geometry instead of coarse usability at representative widths: reachable content and actions, intentional collapse or ordering, and no unintended overflow.
- A frontend e2e spec has more than 25 tests.

Preserve ordinary positive journeys and important browser safeguards such as action eligibility, disabled states and their reasons, contextual picker filtering, special read-only UI, and representative tooltip discoverability or responsive usability. Do not reject material browser behavior merely because it is not a happy-path mutation. Prefer moving backend behavior coverage to `app-tests` and keep frontend variants shallow rather than exhaustive.

Report problems only - no positive observations.
