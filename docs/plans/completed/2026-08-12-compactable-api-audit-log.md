# Plan: Compactable cross-surface API audit log (Kata 1132)

## Goal

Add a portable, best-effort audit trail for mutating REST work from direct REST, the web UI, CLI, and MCP; make the trail inspectable on the Status page; and bound it through an ordinarily configured, scheduled, and manually runnable audit-log compaction operation.

- Provide a bounded, newest-first REST audit-entry listing exposed through the generated CLI and MCP surfaces.
- Place Background operations and Audit log in two Status-page tabs, and remove the obsolete Details toggle, backend-health-route card, and their persisted UI state.

## Constraints

- Persist audit entries in the portable accounting schema through a new immutable upgrade migration; keep background-operation run envelopes in the disposable runtime schema.
- Implement audit capture once as `internal/httpapi` middleware around matched OpenAPI requests; do not instrument individual strict handlers, services, or client surfaces.
- Audit every matched OpenAPI operation whose HTTP method is not `GET`; exclude `GET`, OpenAPI discovery, and unmatched routes. Apply this blanket rule as new REST operations are added instead of maintaining an operation allowlist.
- Record UTC time, stable operation ID, method, request URI, response status, duration, and client surface as structured columns. Store present request and response JSON in nullable DuckDB `JSON` columns for every audited method and outcome; do not use opaque bytes, base64 transport, or a response allowlist.
- Never persist headers. Capture eligible request and response JSON by default, then omit only fields named by a small static audit denylist owned by `internal/httpapi`; each rule identifies an OpenAPI operation ID, request/response direction, and JSON Pointer. Start with `login` request `/password`, retain the rest of that request and response, and do not treat OpenAPI `writeOnly` as an audit-redaction rule.
- Validate every denylist rule against the resolved OpenAPI operation and payload schema when constructing the HTTP adapter so an unknown operation, inapplicable direction, or stale field path fails explicitly instead of silently retaining a secret. Do not add an operation allowlist or user-configurable redaction policy.
- Use the transport-wide `X-Mina-Client-Surface` contract: absent means `rest`; the only supplied values are `web-ui`, `cli`, and `mcp`. Treat this as caller-declared attribution, not authentication or authorization.
- Make audit insertion best-effort: a persistence failure emits a server diagnostic and never changes or delays the determined API response, including after a mutation has committed.
- Require every interactive user-facing interface that mutates Mina application state to dispatch through the REST handler over HTTP or in process so the audit middleware remains authoritative. Runtime-owned automatic work and offline administrative commands remain outside the API audit trail.
- Implement compaction like exchange-rate loading and database backup: one concrete named operation with ordinary app config, settings metadata, schedule registration, manual trigger, status, typed run detail, and shared run envelopes. Do not add generic operation dispatch, a generic frontend fallback, or an audit-specific runner path.
- Put only one concise audit ownership/policy line in `docs/architecture.md` plus ordinary affected `PACKAGE.md` contracts; do not create a standalone audit semantic document.
- Follow `docs/TESTING.md`: backend behavior and REST scenarios belong in app-tests. Add at most one launched-process CLI attribution smoke and one launched-process MCP attribution smoke; keep frontend e2e to the smallest Status-page wiring flow and do not duplicate REST scenarios there.
- Before each application-code commit, run `just test` and `just pre-commit`; also run `just test-integration` for REST/client-surface changes and `just test-frontend-e2e` for frontend runtime changes.

## Success Criteria

- [x] Each matched non-`GET` operation records its structured request/outcome metadata and any present valid JSON request and response bodies, while `GET` requests create no audit entries and no per-operation capture allowlist exists.
- [x] Authentication mutations are audited without storing the login password, authorization header, session cookie, or response headers; the login email and eligible success/error response JSON remain visible.
- [x] Audit JSON capture defaults to allow, the field denylist initially contains only `login` request `/password`, and invalid or stale denylist rules fail HTTP-adapter construction.
- [x] The audit API provides bounded, newest-first paging and method, operation, and client-surface filters; app-tests prove direct-REST attribution, validated surface values, JSON capture/omission rules, and upgrade-safe persistence.
- [x] Shared client wiring records `web-ui`, `cli`, and `mcp` without changing authentication behavior; launched-process coverage contains no more than one CLI identity case and one MCP identity case.
- [x] `[audit_log]` settings expose positive `retention_months` defaulting to `6` and `compaction_schedule_utc` defaulting to `0 0 1 * *`; overrides retain normal source attribution and ordinary five-field UTC schedule validation.
- [x] Manual and scheduled `audit-log-compaction` runs delete only entries strictly older than the calendar-month cutoff and are discoverable through concrete REST, CLI, MCP, and Background operations UI flows.
- [x] The shared background runner waits on a cancelable clock deadline until the next scheduled operation, wakes deterministic fake clocks when advanced, and cancels and joins a far-future wait promptly without polling or changing existing exchange-rate and backup behavior.
- [x] Status retains its health cards, exposes URL-addressable Background operations and Audit log tabs, renders paged audit metadata and formatted JSON detail, and no longer contains or persists the Details toggle or backend-health-route disclosure.
- [x] Architecture requires future interactive user-facing mutations to pass through the REST handler while explicitly leaving runtime-owned automatic work and offline administration outside the API audit trail; current surfaces require no refactor to comply.
- [x] `just accounting-schema-check`, `just test`, `just test-integration`, `just test-frontend-e2e`, and `just pre-commit` pass.
- [x] From a clean worktree, run `just review-loop --plan "docs/plans/2026-08-12-compactable-api-audit-log.md"` once, resolve its findings, and rerun affected validation. Do not run review-loop more than once; report any remaining findings.
- [x] Close Kata issue `1132` with the commits and validation evidence.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Deliver the method-driven portable audit trail

Add an `internal/services/apiaudit` service/repository contract, its `internal/store` implementation and timestamp index, the next migration and regenerated target DDL, and a paged `/api/audit-log/entries` contract. At the HTTP boundary, derive inclusion from the matched method, apply the validated field denylist to otherwise fully captured JSON, validate client-surface attribution, and report insert failures diagnostically without affecting responses. Keep list and compaction decisions in the service and SQL in the store.

- [x] App-tests prove the blanket non-`GET` inclusion rule, `GET` exclusion, request and success/error response JSON capture, structured outcome fields, login-password omission with email and response preservation, direct-REST attribution, surface-header validation, newest-first paging and filters, and observable reads without table access; normal app construction exercises denylist validation.
- [x] Migration evidence opens every earlier `main` schema through the real upgrade path with household data preserved, and `internal/services/accountingschema/schema.sql` is regenerated from the full migration chain.
- [x] Update `api/openapi.yaml`, `api/client-surfaces.yaml`, generated Go/frontend clients, `PROJECT_STATE.md`, and affected package docs using `write-package-docs`; do not add `docs/api-audit-log.md`.
- [x] Commit as `feat: add portable API audit trail`.

### Task 2: Attribute the shared REST clients

Add reusable client-surface request editing in `internal/httpclient`; apply `cli` to local and remote CLI sessions and `mcp` to stdio and embedded MCP REST dispatch. Set `web-ui` in the configured browser API client while preserving its authentication-generation interceptor behavior. Keep the common editor/configuration path authoritative so transport variants do not need duplicate attribution logic.

- [x] App-tests continue to exercise absent-header `rest` and supplied surface values; one launched-process CLI case and one launched-process MCP case confirm only that each client's mutation is recorded with its identity through the supported audit API.
- [x] Update affected HTTP client, CLI, MCP, frontend API, and app-test package docs using `write-package-docs`.
- [x] Commit as `feat: attribute audit clients across surfaces`.

### Task 3: Add ordinary audit-log compaction

Add `[audit_log].retention_months` and `[audit_log].compaction_schedule_utc` through appconfig, settings presentation, runtime validation, and test options. Implement calendar-month cutoff deletion in `apiaudit`/`store`; register `audit-log-compaction` with the background runner; and extend `operationruns`, OpenAPI, client-surface metadata, and generated clients with its concrete status, start, and typed run-detail APIs.

Replace the runner's capped one-second schedule rechecks with a shared cancelable clock-deadline wait. Extend the runtime system clock and app-test fake clock so advancing time wakes due operations deterministically; this is background-runner infrastructure used equally by audit compaction, exchange-rate loading, and backups.

Add the typed compaction module to the compile-time-complete Status operation registry in the same commit as the generated operation-ID change, using the existing shared operation selector, run table, and detail frame.

- [x] App-tests prove defaults, overrides and source attribution, positive retention and cron validation, cutoff-boundary preservation, idempotent manual compaction, scheduled execution, shared run-envelope discovery, and concrete run/status links.
- [x] App-test runner coverage proves one pending deadline wait while idle, execution after fake-clock advancement, no periodic wakeups, and prompt close before a far-future deadline without regressions for existing operations.
- [x] Update affected config, background, operation-run, runtime, store, HTTP, service, app-test, generated API, and Status package docs using `write-package-docs`.
- [x] Commit as `feat: compact API audit history`.

### Task 4: Add the Status audit-log tab and remove Details

Keep health and database cards at the top of Status, then add URL-addressable Background operations and Audit log tabs. Preserve the existing operation browser in the first tab. In the second, render the audit API's newest-first paged rows with timestamp, surface, method, operation/request URI, status, and duration; selecting a row reveals formatted request and response JSON or a clear absent-body state. Keep tab, filters, paging, and selected-entry state in the URL.

Delete the Details checkbox and backend-health-route card together with their obsolete Zustand model, bootstrap hydration, IndexedDB accessors, exports, and persistence test; do not add a browser-state migration solely to remove already-unused local data.

- [x] One focused frontend e2e flow proves tab navigation, audit-row/detail rendering from a real UI mutation recorded as `web-ui`, the compaction module in Background operations, URL state, and absence of Details; REST policy and compaction matrices remain app-test-only.
- [x] Update the Status rules in `docs/webui-design.md`, finish `PROJECT_STATE.md`, update affected frontend page, feature, model, store, service, and API package docs using `write-package-docs`, and run `just prose-fmt`.
- [x] Commit as `feat: browse API audit history in Status`.

### Task 5: Lock future interactive mutations behind REST

After the current implementation is complete, add the single concise audit ownership/policy line to `docs/architecture.md`: every interactive user-facing interface that mutates Mina application state must use the REST handler over HTTP or in process, while runtime-owned automatic work and offline administrative commands remain outside the API audit trail. Existing REST, web UI, CLI, and MCP paths already satisfy this boundary; do not refactor them for this documentation-only task.

- [x] The evergreen architecture rule keeps future interfaces, including the planned TUI, behind the audit middleware without claiming that automatic or offline work is API-audited.
- [x] Commit as `docs: keep interactive mutations behind REST`.
