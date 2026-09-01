# Testing

Mina has exactly four app test classes. All exercise Mina at a high-level app boundary:

- `app-tests`: normal in-process app tests in `internal/apptest/runtime`.
- `e2e-tests`: testscript-driven launched-process tests in `cmd/mina/testdata/script`, driven by `cmd/mina/cli_smoke_test.go`.
- `frontend-e2e-tests`: Playwright-driven embedded UI checks in `frontend/tests/e2e`.
- `docker-lifecycle-tests`: Docker Compose deployment checks in `scripts/docker-service-test.sh`, driven by `just test-docker`.
- No unit tests and no other app test locations.
- No test code under `internal/tools/**`; validate tool changes with manual smoke checks, `just pre-commit`, and review.
- Each new migration carries an app-test that opens an immutable archived pre-migration database through `apptest.NewFromMigrationFixture`; the helper runs the real startup migration and full database validation before the test asserts preserved data and migration-specific transformations through REST.

## App-Tests

`app-tests` are the default for app behavior and user-visible REST scenarios. They should be the vast majority of the test suite.

- Bypass CLI parsing and network listeners.
- Exercise app behavior through the apptest in-process generated REST client, in-memory DuckDB, and per-test schemas.
- Use `internal/apptest` for reusable harness code.
- Obtain the generated REST client from `internal/apptest`.
- Use the generated REST client for fixture setup, actions, and assertions.
- Set up fixtures through REST APIs exposed by the client.
- Assert observable state through REST APIs exposed by the client.
- Use only in-memory app state and test-owned temp IO.
- Do not read or write host user cache, config, or data locations.
- Use the fake clock supplied by `apptest.New` for current time and deadline progression; app-test bodies must not read wall time, wait on real-time deadlines, use host-local time, or generate random or UUID fixtures.
- Synchronize asynchronous scenarios through `internal/apptest` REST-state and controlled-fake helpers. A harness watchdog may fail a hang diagnostically, but elapsed wall time must never establish a passing condition.
- Keep test bodies readable as user scenarios, not setup plumbing.
- Do not call stores, services, repositories, handlers, routers, or private helpers.
- Do not run SQL or inspect database tables from `app-test` functions.
- Do not mock controllers, services, or stores.

Top-level concurrent app tests use the `TestConcurrent*` naming convention. They stay in the normal `just test` suite; `just test-race-concurrency` reruns only that focused slice with the Go race detector and disabled result reuse.

## Coupling Rule

An `app-test` must not need changes when any of these change:

- Database schema.
- Store query shape.
- Service API.
- Router internals.
- Internal business logic ordering.

If a test would change for one of those reasons, it is testing below the app boundary. Worst case, only an `internal/apptest` client helper should change.

## Test Client APIs

Add a test-client-only API when at least two tests need the same setup or assertion and the raw client calls would hide the scenario intent.

- Put it in `internal/apptest`.
- Name it in user/domain terms.
- For `app-tests`, compose REST client calls through the apptest in-process generated REST client.
- Do not run SQL, call services, or call stores from `app-test` helpers.
- Do not add one-off helpers for a single test.

If the missing operation is useful to a user or external tool, prefer adding a small user-visible REST API instead of reaching through internals. This can be valid even when tests are the first consumer. Own it as a production API and OpenAPI contract. Do not add fake production APIs that expose raw test hooks or storage details.

## Bad Examples

Examples are pseudocode.

Bad: an `app-test` writes fixtures with SQL and asserts table state.

```go
func TestHiddenAccounts(t *testing.T) {
	client := apptest.New(t)

	client.Persistence().Exec(`
		INSERT INTO accounting.accounts (fqn, is_hidden)
		VALUES ('cash:wallet', true)
	`)

	got := client.Persistence().QueryBool(`
		SELECT is_hidden FROM accounting.accounts WHERE fqn = 'cash:wallet'
	`)
	require.True(t, got)
}
```

Bad: an `app-test` bypasses the app boundary and couples to service methods.

```go
func TestCreateAccount(t *testing.T) {
	repo := store.NewAccountRepository(db)
	service := accounts.NewService(repo)

	got, err := service.Create(ctx, accounts.CreateInput{FQN: "cash:wallet"})
	require.NoError(t, err)
	require.Equal(t, "cash:wallet", got.FQN)
}
```

## Good Examples

Good: fixtures and assertions go through REST client behavior.

```go
func TestHiddenAccounts(t *testing.T) {
	client := apptest.New(t)
	account := client.Scenario().HiddenAccount("cash:wallet")

	defaultList := client.Accounts().List()
	require.NotContains(t, accountIDs(defaultList), account.ID)

	withHidden := client.Accounts().List(apptest.IncludeHidden())
	require.Contains(t, accountIDs(withHidden), account.ID)
}
```

Good: repeated setup is hidden behind a test-client-only API.

```go
func TestTransactionSearchByTag(t *testing.T) {
	client := apptest.New(t)
	transaction := client.Scenario().TaggedTransaction("Trips:Summer")

	got := client.Records().Search(apptest.WithTag("Trips:Summer"))

	require.Contains(t, recordTransactionIDs(got), transaction.ID)
}
```

Good: a user-visible API is added when the behavior is real product behavior.

```go
func TestAccountBalance(t *testing.T) {
	client := apptest.New(t)
	account := client.Scenario().CheckingAccount("checking:Chase")
	client.Scenario().PostedTransaction(account, "-12.34")

	balance := client.Accounts().Balance(account.ID)

	require.Equal(t, "-12.34", balance.Amount)
}
```

## E2E-Tests

`e2e-tests` run only through testscript and are not run by default.

Use them as a small smoke suite for process-boundary and IO-bound checks only:

- Launched command behavior.
- CLI/config/env wiring.
- Stdin, stdout, and stderr behavior.
- Signals.
- Real network listeners.
- Database files.
- External IO protection, such as not destroying an existing user database.
- Later TUI process behavior.

Do not use `e2e-tests` for:

- Every flag spelling or CLI argument combination.
- Config precedence matrices beyond a representative wiring smoke.
- REST endpoint, domain validation, provider edge-case, or app scenario coverage that can be tested as `app-tests`.
- Exhaustive coverage.

Do not duplicate `app-test` scenario coverage in `e2e-tests`. `e2e-tests` prove wiring and external boundaries; `app-tests` prove app behavior.

## Frontend-E2E-Tests

`frontend-e2e-tests` run only through Playwright and are not run by default. They are a deliberately small set of happy-path UX smoke tests for the embedded browser UI, not a second application suite.

Use them only for one primary, user-visible journey through a distinct core workflow, including the browser rendering, built `mina` binary, embedded Vite assets, local listener wiring, and UI-only browser persistence that the journey needs.

An eligible frontend e2e test must satisfy every condition:

- It proves a key happy-path user experience that needs a real browser.
- The behavior under test uses normal browser controls and asserts the visible user result or URL navigation.
- It is short, focused on one journey, and does not duplicate an existing frontend e2e journey.

Concise API setup and cleanup may arrange test-owned state when it keeps an otherwise eligible journey short and isolated. Fixture plumbing may fail on an unsuccessful request and retain identifiers needed for cleanup, but it must not assert response semantics or payload shape, synchronize the journey on request activity, or serve as the action or evidence under test.

Do not use `frontend-e2e-tests` for:

- REST capability, response, validation, domain data-state, or backend error-path coverage; `app-tests` own this coverage, including exhaustive cases and concurrency.
- Direct REST calls for the action or verification under test, REST contract assertions beyond fixture success guards, or API verification.
- Route interception except as a last resort to make an otherwise eligible core happy-path browser test stable and non-flaky when normal browser behavior cannot do so. It must not assert REST behavior or turn the test into a REST, failure, timing, or concurrency scenario.
- Polling, waiting for requests or responses, fixed delays, or other synchronization on implementation activity; use Playwright's web-first assertions for the visible result.
- Artificial latency, injected failures, retries, rapid typing, rapid repeated actions, multi-tab behavior, races, concurrency, or other unrealistic timing scenarios for Mina's local single-household use.
- Browser-only loading, empty, error, focus, or stale-result states unless one is indispensable to the selected core journey. `app-tests` cannot cover browser presentation, so omitting these states is an intentional coverage tradeoff rather than transferred coverage.
- Targeted tests for isolated regressions, exhaustive frontend state combinations, visual-detail matrices, or small implementation details.
- Direct database, service, store, handler, or private-helper assertions.

Frontend e2e tests prove a few essential browser experiences. Keep the suite and every spec intentionally small: add a test only when it covers an uncovered core happy-path journey, and use only the few visible outcome assertions needed to establish that the journey succeeded.

- A frontend e2e spec file must not contain more than 25 tests; split growing suites by user workflow.

## Docker-Lifecycle-Tests

`docker-lifecycle-tests` run only through `just test-docker` and are not run by default.

Use them as a small smoke suite for Docker deployment behavior only:

- Real Docker image builds or supplied images.
- Compose service startup, restart, recreation, and replacement.
- Bind-mounted config/backups and named database/cache volumes.
- Real network listener wiring through published ports.
- Database and backup file persistence across supported container lifecycle actions.

Do not use `docker-lifecycle-tests` for:

- REST endpoint, domain validation, provider edge-case, or app scenario coverage that can be tested as `app-tests`.
- Exhaustive unsupported downgrade or deployment-platform matrices.

Docker lifecycle tests prove image and Compose deployment wiring. App behavior coverage belongs in `app-tests`.
