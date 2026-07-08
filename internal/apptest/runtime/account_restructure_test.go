package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAccountRestructureRenameMoveAndLeafToGroup(t *testing.T) {
	client := newSharedClient(t)

	renamed := createAccountForRestructure(t, client, "restructure:Accounts:Old", httpclient.Flow, false, nil)
	rename := restructureAccounts(t, client, "restructure:Accounts:Old", "restructure:Accounts:New")
	if rename.JSON200.MovedCount != 1 {
		t.Fatalf("rename moved_count = %d, want 1", rename.JSON200.MovedCount)
	}
	assertAccountFQN(t, client, renamed.AccountId, "restructure:Accounts:New")

	currency := "USD"
	checking := createAccountForRestructure(t, client, "restructure:Bank:Old:Checking", httpclient.Balance, false, &currency)
	hiddenSavings := createAccountForRestructure(t, client, "restructure:Bank:Old:Savings", httpclient.Balance, true, &currency)
	move := restructureAccounts(t, client, "restructure:Bank:Old", "restructure:Bank:New")
	if move.JSON200.MovedCount != 2 {
		t.Fatalf("move moved_count = %d, want 2", move.JSON200.MovedCount)
	}
	assertAccountFQN(t, client, checking.AccountId, "restructure:Bank:New:Checking")
	assertAccountFQN(t, client, hiddenSavings.AccountId, "restructure:Bank:New:Savings")
	assertAccountHidden(t, client, hiddenSavings.AccountId, true)

	leaf := createAccountForRestructure(t, client, "restructure:LeafGroup", httpclient.Flow, false, nil)
	leafToGroup := restructureAccounts(t, client, "restructure:LeafGroup", "restructure:LeafGroup:Other")
	if leafToGroup.JSON200.MovedCount != 1 {
		t.Fatalf("leaf-to-group moved_count = %d, want 1", leafToGroup.JSON200.MovedCount)
	}
	assertAccountFQN(t, client, leaf.AccountId, "restructure:LeafGroup:Other")
}

func TestAccountRestructureValidationAndConflicts(t *testing.T) {
	client := newSharedClient(t)

	createAccountForRestructure(t, client, "restructure:OwnSubtree:One", httpclient.Flow, false, nil)
	createAccountForRestructure(t, client, "restructure:OwnSubtree:Two", httpclient.Flow, false, nil)
	assertRestructureAccountStatus(t, client, "restructure:OwnSubtree", "restructure:OwnSubtree:Moved", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureAccountStatus(t, client, "restructure:OwnSubtree", "restructure:OwnSubtree", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureAccountStatus(t, client, ":invalid", "restructure:Invalid:To", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureAccountStatus(t, client, "restructure:OwnSubtree", "restructure::Invalid", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureAccountStatus(t, client, "restructure:Missing", "restructure:Missing:New", http.StatusNotFound, httpclient.APIErrorCodeNotFound)
	assertAccountFQN(t, client, accountIDByFQNForRestructure(t, client, "restructure:OwnSubtree:One"), "restructure:OwnSubtree:One")

	sourceAtDestination := createAccountForRestructure(t, client, "restructure:Destination:Source:Leaf", httpclient.Flow, false, nil)
	occupiedUnderDestination := createAccountForRestructure(t, client, "restructure:Destination:Target:Occupied", httpclient.Flow, false, nil)
	assertRestructureAccountStatus(t, client, "restructure:Destination:Source", "restructure:Destination:Target", http.StatusConflict, httpclient.APIErrorCodeConflict)
	assertAccountFQN(t, client, sourceAtDestination.AccountId, "restructure:Destination:Source:Leaf")
	assertAccountFQN(t, client, occupiedUnderDestination.AccountId, "restructure:Destination:Target:Occupied")

	sourcePrefixedDestination := createAccountForRestructure(t, client, "restructure:PrefixDestination:Source", httpclient.Flow, false, nil)
	prefixOfDestination := createAccountForRestructure(t, client, "restructure:PrefixDestination:Target", httpclient.Flow, false, nil)
	assertRestructureAccountStatus(t, client, "restructure:PrefixDestination:Source", "restructure:PrefixDestination:Target:Child", http.StatusConflict, httpclient.APIErrorCodeConflict)
	assertAccountFQN(t, client, sourcePrefixedDestination.AccountId, "restructure:PrefixDestination:Source")
	assertAccountFQN(t, client, prefixOfDestination.AccountId, "restructure:PrefixDestination:Target")
}

func TestAccountRestructureLeavesTombstonedFQNsAndKeepsReferencesReachable(t *testing.T) {
	client := newSharedClient(t)

	tombstoned := createAccountForRestructure(t, client, "restructure:Tombstone:Old:Closed", httpclient.Flow, false, nil)
	deleteAccount(t, client, tombstoned.AccountId)
	active := createAccountForRestructure(t, client, "restructure:Tombstone:Old:Active", httpclient.Flow, false, nil)
	restructureAccounts(t, client, "restructure:Tombstone:Old", "restructure:Tombstone:New")
	assertAccountFQN(t, client, active.AccountId, "restructure:Tombstone:New:Active")
	assertTombstonedAccountFQN(t, client, tombstoned.AccountId, "restructure:Tombstone:Old:Closed")

	currency := "USD"
	checking := createAccountForRestructure(t, client, "restructure:Register:Old", httpclient.Balance, false, &currency)
	merchant := createAccountForRestructure(t, client, "restructure:Register:Merchant", httpclient.Flow, false, nil)
	category := client.Scenario().Category("Restructure:Register")
	transaction := createBalanceTransactionWithAmountUSD(t, client, checking.AccountId, merchant.AccountId, category.CategoryId, "USD", "-12.34", "12.34", "-12.34", "12.34", httpclient.PostingStatusPosted)

	restructureAccounts(t, client, "restructure:Register:Old", "restructure:Register:New")
	assertAccountFQN(t, client, checking.AccountId, "restructure:Register:New")

	accountRecords, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), checking.AccountId, nil)
	requireNoTransportError(t, "search restructured account records", err)
	if accountRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search restructured account records status = %d, want %d; body %s", accountRecords.StatusCode(), http.StatusOK, accountRecords.Body)
	}
	assertRecordIDs(t, accountRecords.JSON200.Records, []int64{transaction.JSON201.Records[0].RecordId})

	newPrefix := "restructure:Register:New"
	prefixRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{AccountFqnPrefix: &newPrefix})
	requireNoTransportError(t, "search restructured account prefix records", err)
	if prefixRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search restructured account prefix status = %d, want %d; body %s", prefixRecords.StatusCode(), http.StatusOK, prefixRecords.Body)
	}
	assertRecordIDs(t, prefixRecords.JSON200.Records, []int64{transaction.JSON201.Records[0].RecordId})

	accountIDs := []int64{checking.AccountId}
	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	requireNoTransportError(t, "list restructured account balances", err)
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("list restructured account balances status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: checking.AccountId, currency: "USD", current: "-12.34000000", currentUSD: "-12.34000000", posted: "-12.34000000", unconvertedCount: 0},
	})
}

func createAccountForRestructure(t *testing.T, client *apptest.Client, fqn string, accountType httpclient.AccountType, hidden bool, currency *string) httpclient.Account {
	t.Helper()

	request := httpclient.CreateAccountRequest{
		Fqn:         fqn,
		AccountType: accountType,
		Currency:    currency,
	}
	if hidden {
		request.IsHidden = &hidden
	}
	response, err := client.REST().CreateAccountWithResponse(context.Background(), request)
	requireNoTransportError(t, "create account for restructure", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create account for restructure status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func restructureAccounts(t *testing.T, client *apptest.Client, from string, to string) *httpclient.RestructureAccountsResponse {
	t.Helper()

	response, err := client.REST().RestructureAccountsWithResponse(context.Background(), httpclient.RestructureRequest{
		FromFqn: from,
		ToFqn:   to,
	})
	requireNoTransportError(t, "restructure accounts", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("restructure accounts status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertRestructureAccountStatus(t *testing.T, client *apptest.Client, from string, to string, status int, code httpclient.APIErrorCode) {
	t.Helper()

	response, err := client.REST().RestructureAccountsWithResponse(context.Background(), httpclient.RestructureRequest{
		FromFqn: from,
		ToFqn:   to,
	})
	requireNoTransportError(t, "restructure accounts rejected", err)
	if response.StatusCode() != status {
		t.Fatalf("restructure accounts status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
	assertRestructureAccountErrorCode(t, response, status, code)
}

func assertRestructureAccountErrorCode(t *testing.T, response *httpclient.RestructureAccountsResponse, status int, code httpclient.APIErrorCode) {
	t.Helper()

	switch status {
	case http.StatusBadRequest:
		if response.JSON400 == nil || response.JSON400.Error.Code != code {
			t.Fatalf("400 error = %+v, want code %q; body %s", response.JSON400, code, response.Body)
		}
	case http.StatusNotFound:
		if response.JSON404 == nil || response.JSON404.Error.Code != code {
			t.Fatalf("404 error = %+v, want code %q; body %s", response.JSON404, code, response.Body)
		}
	case http.StatusConflict:
		if response.JSON409 == nil || response.JSON409.Error.Code != code {
			t.Fatalf("409 error = %+v, want code %q; body %s", response.JSON409, code, response.Body)
		}
	default:
		t.Fatalf("unsupported restructure error status %d", status)
	}
}

func assertAccountFQN(t *testing.T, client *apptest.Client, accountID int64, fqn string) {
	t.Helper()

	account := getAccountForRestructure(t, client, accountID, false)
	if account.Fqn != fqn {
		t.Fatalf("account %d fqn = %q, want %q", accountID, account.Fqn, fqn)
	}
}

func assertTombstonedAccountFQN(t *testing.T, client *apptest.Client, accountID int64, fqn string) {
	t.Helper()

	account := getAccountForRestructure(t, client, accountID, true)
	if account.Fqn != fqn {
		t.Fatalf("tombstoned account %d fqn = %q, want %q", accountID, account.Fqn, fqn)
	}
	if account.TombstonedAt == nil {
		t.Fatalf("account %d tombstoned_at = nil, want timestamp", accountID)
	}
}

func assertAccountHidden(t *testing.T, client *apptest.Client, accountID int64, hidden bool) {
	t.Helper()

	account := getAccountForRestructure(t, client, accountID, false)
	if account.IsHidden != hidden {
		t.Fatalf("account %d is_hidden = %t, want %t", accountID, account.IsHidden, hidden)
	}
}

func getAccountForRestructure(t *testing.T, client *apptest.Client, accountID int64, includeTombstoned bool) httpclient.Account {
	t.Helper()

	response, err := client.REST().GetAccountWithResponse(context.Background(), accountID, &httpclient.GetAccountParams{IncludeTombstoned: &includeTombstoned})
	requireNoTransportError(t, "get account for restructure", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get account for restructure status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return *response.JSON200
}

func accountIDByFQNForRestructure(t *testing.T, client *apptest.Client, fqn string) int64 {
	t.Helper()

	includeHidden := true
	response, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{IncludeHidden: &includeHidden})
	requireNoTransportError(t, "list accounts by fqn", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list accounts by fqn status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	for _, account := range response.JSON200.Accounts {
		if account.Fqn == fqn {
			return account.AccountId
		}
	}

	t.Fatalf("account fqn %q not found in %+v", fqn, response.JSON200.Accounts)
	return 0
}
