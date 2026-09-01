Review only changed `frontend/tests/e2e` browser-test code. First read and internalize `docs/TESTING.md`.

Flag problems when:

- A frontend e2e test does not prove one short, uncovered core happy-path browser journey whose behavior under test uses normal controls and a visible user result or URL navigation.
- A frontend e2e test duplicates an existing journey or turns one journey into a long checklist, a state or visual-detail matrix, or several workflows.
- A frontend e2e test covers REST capability, validation, domain data states, backend errors, retries, or concurrency; `app-tests` own application behavior, including exhaustive coverage and concurrency.
- A frontend e2e test calls REST for its action or verification, asserts REST contracts, verifies through the API, waits for requests or responses, polls implementation activity, or uses fixed delays. Concise API setup and cleanup may fail on unsuccessful requests and retain fixture identifiers, but is otherwise allowed only to keep an eligible journey short and isolated.
- A frontend e2e test covers browser-only loading, empty, error, focus, or stale-result states that are not indispensable to its selected core journey; omitted browser presentation is an intentional coverage tradeoff and is not covered by `app-tests`.
- A frontend e2e test simulates artificial latency, failures, rapid typing, rapid repeated actions, races, or multi-tab behavior.
- A frontend e2e test uses route interception without documenting why normal browser behavior cannot produce a stable, non-flaky version of the same eligible happy-path journey. Interception must not assert REST behavior or turn the test into a REST, failure, timing, or concurrency scenario.
- A new frontend e2e test is an isolated regression case, edge case, or small behavior check rather than an uncovered core journey.
- A frontend e2e spec has more than 25 tests.

Do not request frontend e2e coverage for ordinary changes, bug fixes, edge cases, or small behavior changes. Prefer moving app behavior coverage to `app-tests` or dropping frontend e2e coverage that does not meet this scope.

Report problems only - no positive observations.
