package runtime_test

import (
	"context"
	"net/http"
	"sort"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
	"github.com/oapi-codegen/nullable"
)

func TestFixedSystemAccountCatalogAndProtection(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	systemType := httpclient.AccountTypeSystem

	listed, err := client.REST().ListAccountsWithResponse(ctx, &httpclient.ListAccountsParams{
		AccountType: accountTypes(systemType),
	})
	requireClientResponse(t, "list fixed system accounts", err, listed.StatusCode(), http.StatusOK, listed.Body)
	gotFQNs := make([]string, 0, len(listed.JSON200.Accounts))
	for _, account := range listed.JSON200.Accounts {
		gotFQNs = append(gotFQNs, account.Fqn)
		if account.AccountType != httpclient.AccountTypeSystem {
			t.Fatalf("fixed account %q type = %q, want system", account.Fqn, account.AccountType)
		}
		if account.Deletable == nil || *account.Deletable {
			t.Fatalf("fixed account %q deletable = %v, want false", account.Fqn, account.Deletable)
		}
		read, readErr := client.REST().GetAccountWithResponse(ctx, account.AccountId, nil)
		requireClientResponse(t, "get fixed system account", readErr, read.StatusCode(), http.StatusOK, read.Body)
	}
	sort.Strings(gotFQNs)
	wantFQNs := []string{
		"system:correction",
		"system:exchange",
		"system:opening_balance",
		"system:suspense",
	}
	if len(gotFQNs) != len(wantFQNs) {
		t.Fatalf("fixed system accounts = %v, want %v", gotFQNs, wantFQNs)
	}
	for index := range wantFQNs {
		if gotFQNs[index] != wantFQNs[index] {
			t.Fatalf("fixed system accounts = %v, want %v", gotFQNs, wantFQNs)
		}
	}

	reserved, err := client.REST().CreateAccountWithResponse(ctx, httpclient.CreateAccountRequest{
		Fqn:         "system:user_defined",
		AccountType: httpclient.WritableAccountTypeOwned,
		Currency:    apptest.StringPtr("USD"),
	})
	requireClientResponse(t, "reject reserved system namespace", err, reserved.StatusCode(), http.StatusBadRequest, reserved.Body)

	systemAccount := fixedSystemAccounts(t, client)["system:correction"]
	ownedType := httpclient.WritableAccountTypeOwned
	trueValue := true
	for _, testCase := range []struct {
		name    string
		request httpclient.UpdateAccountRequest
	}{
		{name: "type", request: httpclient.UpdateAccountRequest{AccountType: &ownedType}},
		{name: "currency", request: httpclient.UpdateAccountRequest{Currency: nullable.NewNullableWithValue("USD")}},
		{name: "hidden", request: httpclient.UpdateAccountRequest{IsHidden: &trueValue}},
		{name: "featured", request: httpclient.UpdateAccountRequest{IsFeatured: &trueValue}},
		{name: "external id", request: httpclient.UpdateAccountRequest{ExternalId: nullable.NewNullableWithValue("external-id")}},
		{name: "external system", request: httpclient.UpdateAccountRequest{ExternalSystem: nullable.NewNullableWithValue("provider")}},
	} {
		t.Run("reject update "+testCase.name, func(t *testing.T) {
			response, updateErr := client.REST().UpdateAccountWithResponse(ctx, systemAccount.AccountId, testCase.request)
			requireClientResponse(t, "reject fixed system account update", updateErr, response.StatusCode(), http.StatusBadRequest, response.Body)
		})
	}

	deleted, err := client.REST().DeleteAccountWithResponse(ctx, systemAccount.AccountId)
	requireClientResponse(t, "reject fixed system account delete", err, deleted.StatusCode(), http.StatusBadRequest, deleted.Body)

	restructured, err := client.REST().RestructureAccountsWithResponse(ctx, httpclient.RestructureRequest{
		FromFqn: "system:correction",
		ToFqn:   "adjustments:correction",
	})
	requireClientResponse(t, "reject restructure from fixed namespace", err, restructured.StatusCode(), http.StatusBadRequest, restructured.Body)

	userAccount := client.Scenario().AccountWithCurrency("accounts:RestructureIntoSystem", "USD")
	intoSystem, err := client.REST().RestructureAccountsWithResponse(ctx, httpclient.RestructureRequest{
		FromFqn: userAccount.Fqn,
		ToFqn:   "system:moved",
	})
	requireClientResponse(t, "reject restructure into fixed namespace", err, intoSystem.StatusCode(), http.StatusBadRequest, intoSystem.Body)

	pathHidden, err := client.REST().SetAccountHiddenByPathWithResponse(ctx, httpclient.SetHiddenByPathRequest{
		PathFqn:  "system",
		IsHidden: true,
	})
	requireClientResponse(t, "reject fixed system path mutation", err, pathHidden.StatusCode(), http.StatusBadRequest, pathHidden.Body)
}
