package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAccountCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	currency := "USD"
	externalID := "acct-123"
	externalSystem := "plaid"
	created, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:            "checking:Chase:Primary",
		Currency:       &currency,
		ExternalId:     &externalID,
		ExternalSystem: &externalSystem,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertAccountHierarchy(t, *created.JSON201, "checking", "checking:Chase", "Primary", 2)
	if created.JSON201.Currency == nil || *created.JSON201.Currency != "USD" {
		t.Fatalf("currency = %v, want USD", created.JSON201.Currency)
	}

	read, err := client.REST().GetAccountWithResponse(context.Background(), created.JSON201.AccountId, nil)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.AccountId != created.JSON201.AccountId {
		t.Fatalf("read account id = %d, want %d", read.JSON200.AccountId, created.JSON201.AccountId)
	}

	hiddenValue := true
	hidden, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "credit:Amex:Blue",
		IsHidden: &hiddenValue,
		Currency: &currency,
	})
	if err != nil {
		t.Fatalf("hidden create request: %v", err)
	}
	if hidden.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden create status = %d, want %d; body %s", hidden.StatusCode(), http.StatusCreated, hidden.Body)
	}

	defaultList, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default list request: %v", err)
	}
	if defaultList.StatusCode() != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode(), http.StatusOK, defaultList.Body)
	}
	assertAccountIDs(t, defaultList.JSON200.Accounts, []int64{created.JSON201.AccountId})

	includeHidden, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{IncludeHidden: &hiddenValue})
	if err != nil {
		t.Fatalf("include hidden request: %v", err)
	}
	if includeHidden.StatusCode() != http.StatusOK {
		t.Fatalf("include hidden status = %d, want %d; body %s", includeHidden.StatusCode(), http.StatusOK, includeHidden.Body)
	}
	assertAccountIDs(t, includeHidden.JSON200.Accounts, []int64{created.JSON201.AccountId, hidden.JSON201.AccountId})

	updatedExternalID := "acct-456"
	updatedExternalSystem := "manual"
	updated, err := client.REST().UpdateAccountWithResponse(context.Background(), created.JSON201.AccountId, httpclient.UpdateAccountRequest{
		IsHidden:       true,
		ExternalId:     &updatedExternalID,
		ExternalSystem: &updatedExternalSystem,
	})
	if err != nil {
		t.Fatalf("update request: %v", err)
	}
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if !updated.JSON200.IsHidden {
		t.Fatal("updated account hidden = false, want true")
	}
	if updated.JSON200.ExternalId == nil || *updated.JSON200.ExternalId != "acct-456" {
		t.Fatalf("external_id = %v, want acct-456", updated.JSON200.ExternalId)
	}
	if updated.JSON200.ExternalSystem == nil || *updated.JSON200.ExternalSystem != "manual" {
		t.Fatalf("external_system = %v, want manual", updated.JSON200.ExternalSystem)
	}

	afterHide, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("after hide list request: %v", err)
	}
	if afterHide.StatusCode() != http.StatusOK {
		t.Fatalf("after hide list status = %d, want %d; body %s", afterHide.StatusCode(), http.StatusOK, afterHide.Body)
	}
	assertAccountIDs(t, afterHide.JSON200.Accounts, nil)

	visibleDeleted, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "savings:Ally:Reserve",
		Currency: &currency,
	})
	if err != nil {
		t.Fatalf("visible delete create request: %v", err)
	}
	if visibleDeleted.StatusCode() != http.StatusCreated {
		t.Fatalf("visible delete create status = %d, want %d; body %s", visibleDeleted.StatusCode(), http.StatusCreated, visibleDeleted.Body)
	}
	visibleDelete, err := client.REST().DeleteAccountWithResponse(context.Background(), visibleDeleted.JSON201.AccountId)
	if err != nil {
		t.Fatalf("visible delete request: %v", err)
	}
	if visibleDelete.StatusCode() != http.StatusNoContent {
		t.Fatalf("visible delete status = %d, want %d; body %s", visibleDelete.StatusCode(), http.StatusNoContent, visibleDelete.Body)
	}
	defaultAfterVisibleDelete, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default after visible delete request: %v", err)
	}
	if defaultAfterVisibleDelete.StatusCode() != http.StatusOK {
		t.Fatalf("default after visible delete status = %d, want %d; body %s", defaultAfterVisibleDelete.StatusCode(), http.StatusOK, defaultAfterVisibleDelete.Body)
	}
	assertAccountIDs(t, defaultAfterVisibleDelete.JSON200.Accounts, nil)

	deleted, err := client.REST().DeleteAccountWithResponse(context.Background(), hidden.JSON201.AccountId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	missing, err := client.REST().GetAccountWithResponse(context.Background(), hidden.JSON201.AccountId, nil)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	includeTombstoned := true
	deletedRead, err := client.REST().GetAccountWithResponse(context.Background(), hidden.JSON201.AccountId, &httpclient.GetAccountParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("get deleted with tombstones request: %v", err)
	}
	if deletedRead.StatusCode() != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode(), http.StatusOK, deletedRead.Body)
	}
	if deletedRead.JSON200.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}

	withTombstones, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{
		IncludeHidden:     &hiddenValue,
		IncludeTombstoned: &includeTombstoned,
	})
	if err != nil {
		t.Fatalf("include tombstones request: %v", err)
	}
	if withTombstones.StatusCode() != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode(), http.StatusOK, withTombstones.Body)
	}
	assertAccountIDs(t, withTombstones.JSON200.Accounts, []int64{created.JSON201.AccountId, hidden.JSON201.AccountId, visibleDeleted.JSON201.AccountId})
}

func TestAccountRejectsDuplicateActiveFQN(t *testing.T) {
	client := newSharedClient(t)

	currency := "USD"
	first, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "cash:Wallet",
		Currency: &currency,
	})
	if err != nil {
		t.Fatalf("first create request: %v", err)
	}
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	duplicate, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "cash:Wallet",
		Currency: &currency,
	})
	if err != nil {
		t.Fatalf("duplicate request: %v", err)
	}
	if duplicate.StatusCode() != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode(), http.StatusConflict, duplicate.Body)
	}
	if duplicate.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}

	deleted, err := client.REST().DeleteAccountWithResponse(context.Background(), first.JSON201.AccountId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	recreated, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "cash:Wallet",
		Currency: &currency,
	})
	if err != nil {
		t.Fatalf("recreate request: %v", err)
	}
	if recreated.StatusCode() != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode(), http.StatusCreated, recreated.Body)
	}
}

func TestAccountAcceptsCryptoCurrencyBoundary(t *testing.T) {
	client := newSharedClient(t)

	currency := "C::ETHEREUM-LONG-TOKEN"
	created, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "crypto:Wallet:Cold",
		Currency: &currency,
	})
	if err != nil {
		t.Fatalf("crypto currency request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("crypto currency status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	if created.JSON201.Currency == nil || *created.JSON201.Currency != currency {
		t.Fatalf("currency = %v, want %s", created.JSON201.Currency, currency)
	}
}

func TestAccountValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	unknownCurrencyValue := "ZZZ"
	unknownCurrency, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "checking:Unknown",
		Currency: &unknownCurrencyValue,
	})
	if err != nil {
		t.Fatalf("unknown currency request: %v", err)
	}
	if unknownCurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unknown currency status = %d, want %d; body %s", unknownCurrency.StatusCode(), http.StatusBadRequest, unknownCurrency.Body)
	}

	invalidCurrencyValue := "usd"
	invalidCurrency, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "checking:Chase",
		Currency: &invalidCurrencyValue,
	})
	if err != nil {
		t.Fatalf("invalid currency request: %v", err)
	}
	if invalidCurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid currency status = %d, want %d; body %s", invalidCurrency.StatusCode(), http.StatusBadRequest, invalidCurrency.Body)
	}
	if invalidCurrency.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid currency code = %q, want %q", invalidCurrency.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}

	nonASCIICurrencyValue := "ÅB"
	nonASCIICurrency, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "checking:CreditUnion",
		Currency: &nonASCIICurrencyValue,
	})
	if err != nil {
		t.Fatalf("non-ASCII currency request: %v", err)
	}
	if nonASCIICurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("non-ASCII currency status = %d, want %d; body %s", nonASCIICurrency.StatusCode(), http.StatusBadRequest, nonASCIICurrency.Body)
	}

	externalID := "acct-123"
	missingExternalSystem, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:        "checking:Chase",
		ExternalId: &externalID,
	})
	if err != nil {
		t.Fatalf("missing external system request: %v", err)
	}
	if missingExternalSystem.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing external system status = %d, want %d; body %s", missingExternalSystem.StatusCode(), http.StatusBadRequest, missingExternalSystem.Body)
	}

	missingHidden, err := client.REST().UpdateAccountWithBodyWithResponse(context.Background(), 1, "application/json", apptest.JSONReader(map[string]any{}))
	if err != nil {
		t.Fatalf("missing hidden request: %v", err)
	}
	if missingHidden.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing hidden status = %d, want %d; body %s", missingHidden.StatusCode(), http.StatusBadRequest, missingHidden.Body)
	}

	badQuery, err := client.REST().ListAccountsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_hidden=maybe"))
	if err != nil {
		t.Fatalf("bad query request: %v", err)
	}
	if badQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode(), http.StatusBadRequest, badQuery.Body)
	}

	extraField, err := client.REST().CreateAccountWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":        "checking:Chase",
		"extraField": true,
	}))
	if err != nil {
		t.Fatalf("extra field request: %v", err)
	}
	if extraField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode(), http.StatusBadRequest, extraField.Body)
	}
}

func assertAccountHierarchy(t *testing.T, account httpclient.Account, kind string, parent string, name string, level int) {
	t.Helper()

	if account.Kind != kind {
		t.Fatalf("kind = %q, want %q", account.Kind, kind)
	}
	if account.ParentFqn == nil || *account.ParentFqn != parent {
		t.Fatalf("parent_fqn = %v, want %q", account.ParentFqn, parent)
	}
	if account.Name != name {
		t.Fatalf("name = %q, want %q", account.Name, name)
	}
	if account.Level != level {
		t.Fatalf("level = %d, want %d", account.Level, level)
	}
}

func assertAccountIDs(t *testing.T, accounts []httpclient.Account, want []int64) {
	t.Helper()

	if len(accounts) != len(want) {
		t.Fatalf("account count = %d, want %d; accounts = %+v", len(accounts), len(want), accounts)
	}
	for i, account := range accounts {
		if account.AccountId != want[i] {
			t.Fatalf("account id at %d = %d, want %d; accounts = %+v", i, account.AccountId, want[i], accounts)
		}
	}
}
