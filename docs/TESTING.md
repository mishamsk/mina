# Testing

Mina has exactly two app test classes. Both exercise Mina at a high-level app
boundary:

- `app-tests`: normal in-process app tests in `internal/apptest/runtime`.
- `e2e-tests`: testscript-driven launched-process tests in `cmd/mina/testdata/script`, driven by `cmd/mina/cli_smoke_test.go`.
- No unit tests and no other app test locations.
- No test code under `internal/tools/**`; validate tool changes with manual smoke checks, `just pre-commit`, and review.

## App-Tests

`app-tests` are the default for app behavior and user-visible REST scenarios.
They should be the vast majority of the test suite.

- Bypass CLI parsing and network listeners.
- Exercise app behavior through the apptest in-process generated REST client, in-memory DuckDB, and per-test schemas.
- Use `internal/apptest` for reusable harness code.
- Obtain the generated REST client from `internal/apptest`.
- Use the generated REST client for fixture setup, actions, and assertions.
- Set up fixtures through REST APIs exposed by the client.
- Assert observable state through REST APIs exposed by the client.
- Use only in-memory app state and test-owned temp IO.
- Do not read or write host user cache, config, or data locations.
- Keep test bodies readable as user scenarios, not setup plumbing.
- Do not call stores, services, repositories, handlers, routers, or private helpers.
- Do not run SQL or inspect database tables from `app-test` functions.
- Do not mock controllers, services, or stores.

## Coupling Rule

An `app-test` must not need changes when any of these change:

- Database schema.
- Store query shape.
- Service API.
- Router internals.
- Internal business logic ordering.

If a test would change for one of those reasons, it is testing below the app boundary.
Worst case, only an `internal/apptest` client helper should change.

## Test Client APIs

Add a test-client-only API when at least two tests need the same setup or assertion
and the raw client calls would hide the scenario intent.

- Put it in `internal/apptest`.
- Name it in user/domain terms.
- For `app-tests`, compose REST client calls through the apptest in-process generated REST client.
- Do not run SQL, call services, or call stores from `app-test` helpers.
- Do not add one-off helpers for a single test.

If the missing operation is useful to a user or external tool, prefer adding a small
user-visible REST API instead of reaching through internals. This can be valid even
when tests are the first consumer. Own it as a production API and OpenAPI contract.
Do not add fake production APIs that expose raw test hooks or storage details.

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
- Later local web UI and TUI process behavior.

Do not use `e2e-tests` for:

- Every flag spelling or CLI argument combination.
- Config precedence matrices beyond a representative wiring smoke.
- REST endpoint, domain validation, provider edge-case, or app scenario coverage
  that can be tested as `app-tests`.
- Exhaustive coverage.

Do not duplicate `app-test` scenario coverage in `e2e-tests`. `e2e-tests`
prove wiring and external boundaries; `app-tests` prove app behavior.
