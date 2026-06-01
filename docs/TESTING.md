# Testing

Mina has only two app test classes:

- Normal in-process end-to-end app tests in `internal/apptest/runtime`.
- Testscript-driven end-to-end integration tests in `cmd/mina/testdata/script`, driven by `cmd/mina/cli_smoke_test.go`.
- No unit tests and no other app test locations.

## Normal Tests

Normal tests are the default and should be about 90% of the test suite.

- Bypass CLI parsing and network listeners.
- Exercise app behavior through the apptest in-process generated REST client, in-memory DuckDB, and per-test schemas.
- Use `internal/apptest` for reusable harness code.
- Obtain the generated REST client from `internal/apptest`.
- Use the generated REST client for fixture setup, actions, and assertions.
- Set up fixtures through REST APIs exposed by the client.
- Assert observable state through REST APIs exposed by the client.
- Keep test bodies readable as user scenarios, not setup plumbing.
- Do not call stores, services, repositories, handlers, routers, or private helpers.
- Do not run SQL or inspect database tables from normal test functions.
- Do not mock controllers, services, or stores.

## Coupling Rule

A normal test must not need changes when any of these change:

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
- For normal tests, compose REST client calls through the apptest in-process generated REST client.
- Do not run SQL, call services, or call stores from normal-test helpers.
- Do not add one-off helpers for a single test.

If the missing operation is useful to a user or external tool, prefer adding a small
user-visible REST API instead of reaching through internals. This can be valid even
when tests are the first consumer. Own it as a production API and OpenAPI contract.
Do not add fake production APIs that expose raw test hooks or storage details.

## Bad Examples

Examples are pseudocode.

Bad: a normal test writes fixtures with SQL and asserts table state.

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

Bad: a normal test bypasses the app boundary and couples to service methods.

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

## Integration Tests

Integration tests run only through testscript and are not run by default.

Use them for process-boundary and IO-bound checks only:

- CLI parsing, help, config, prompts, and exit behavior.
- A small number of true-network REST smoke tests.
- Basic database-file open/create/migrate behavior.
- Basic correctness checks for external IO, such as not destroying an existing user database.
- Later TUI process behavior.

Do not duplicate normal-test scenario coverage in integration tests. Integration
tests prove wiring and external boundaries; normal tests prove app behavior.
