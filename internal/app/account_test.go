package app_test

import (
	"net/http"
	"strconv"
	"testing"

	"mina.local/mina/internal/apptest"
	"mina.local/mina/internal/models"
)

func TestAccountCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := apptest.New(t)

	created := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:            "checking:Chase:Primary",
		Currency:       stringPtr("USD"),
		ExternalID:     stringPtr("acct-123"),
		ExternalSystem: stringPtr("plaid"),
	})
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	assertAccountHierarchy(t, created.Body, "checking", "checking:Chase", "Primary", 2)
	if created.Body.Currency == nil || *created.Body.Currency != "USD" {
		t.Fatalf("currency = %v, want USD", created.Body.Currency)
	}

	read := apptest.Decode[models.Account](client, http.MethodGet, accountPath(created.Body.ID), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.ID != created.Body.ID {
		t.Fatalf("read account id = %d, want %d", read.Body.ID, created.Body.ID)
	}

	hidden := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "credit:Amex:Blue",
		IsHidden: boolPtr(true),
		Currency: stringPtr("USD"),
	})
	if hidden.StatusCode != http.StatusCreated {
		t.Fatalf("hidden create status = %d, want %d; body %s", hidden.StatusCode, http.StatusCreated, hidden.RawBody)
	}

	defaultList := apptest.Decode[models.AccountListResponse](client, http.MethodGet, "/accounts", nil)
	if defaultList.StatusCode != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode, http.StatusOK, defaultList.RawBody)
	}
	assertAccountIDs(t, defaultList.Body.Accounts, []int64{created.Body.ID})

	includeHidden := apptest.Decode[models.AccountListResponse](client, http.MethodGet, "/accounts?include_hidden=true", nil)
	if includeHidden.StatusCode != http.StatusOK {
		t.Fatalf("include hidden status = %d, want %d; body %s", includeHidden.StatusCode, http.StatusOK, includeHidden.RawBody)
	}
	assertAccountIDs(t, includeHidden.Body.Accounts, []int64{created.Body.ID, hidden.Body.ID})

	updated := apptest.Decode[models.Account](client, http.MethodPatch, accountPath(created.Body.ID), models.UpdateAccountRequest{
		IsHidden:       boolPtr(true),
		ExternalID:     stringPtr("acct-456"),
		ExternalSystem: stringPtr("manual"),
	})
	if updated.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode, http.StatusOK, updated.RawBody)
	}
	if !updated.Body.IsHidden {
		t.Fatal("updated account hidden = false, want true")
	}
	if updated.Body.ExternalID == nil || *updated.Body.ExternalID != "acct-456" {
		t.Fatalf("external_id = %v, want acct-456", updated.Body.ExternalID)
	}
	if updated.Body.ExternalSystem == nil || *updated.Body.ExternalSystem != "manual" {
		t.Fatalf("external_system = %v, want manual", updated.Body.ExternalSystem)
	}

	afterHide := apptest.Decode[models.AccountListResponse](client, http.MethodGet, "/accounts", nil)
	if afterHide.StatusCode != http.StatusOK {
		t.Fatalf("after hide list status = %d, want %d; body %s", afterHide.StatusCode, http.StatusOK, afterHide.RawBody)
	}
	assertAccountIDs(t, afterHide.Body.Accounts, nil)

	visibleDeleted := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "savings:Ally:Reserve",
		Currency: stringPtr("USD"),
	})
	if visibleDeleted.StatusCode != http.StatusCreated {
		t.Fatalf("visible delete create status = %d, want %d; body %s", visibleDeleted.StatusCode, http.StatusCreated, visibleDeleted.RawBody)
	}
	visibleDelete := apptest.Decode[jsonBody](client, http.MethodDelete, accountPath(visibleDeleted.Body.ID), nil)
	if visibleDelete.StatusCode != http.StatusNoContent {
		t.Fatalf("visible delete status = %d, want %d; body %s", visibleDelete.StatusCode, http.StatusNoContent, visibleDelete.RawBody)
	}
	defaultAfterVisibleDelete := apptest.Decode[models.AccountListResponse](client, http.MethodGet, "/accounts", nil)
	if defaultAfterVisibleDelete.StatusCode != http.StatusOK {
		t.Fatalf("default after visible delete status = %d, want %d; body %s", defaultAfterVisibleDelete.StatusCode, http.StatusOK, defaultAfterVisibleDelete.RawBody)
	}
	assertAccountIDs(t, defaultAfterVisibleDelete.Body.Accounts, nil)

	deleted := apptest.Decode[jsonBody](client, http.MethodDelete, accountPath(hidden.Body.ID), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	missing := apptest.Decode[models.ErrorResponse](client, http.MethodGet, accountPath(hidden.Body.ID), nil)
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode, http.StatusNotFound, missing.RawBody)
	}

	deletedRead := apptest.Decode[models.Account](client, http.MethodGet, accountPath(hidden.Body.ID)+"?include_tombstoned=true", nil)
	if deletedRead.StatusCode != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode, http.StatusOK, deletedRead.RawBody)
	}
	if deletedRead.Body.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}

	withTombstones := apptest.Decode[models.AccountListResponse](client, http.MethodGet, "/accounts?include_hidden=true&include_tombstoned=true", nil)
	if withTombstones.StatusCode != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode, http.StatusOK, withTombstones.RawBody)
	}
	assertAccountIDs(t, withTombstones.Body.Accounts, []int64{created.Body.ID, hidden.Body.ID, visibleDeleted.Body.ID})
}

func TestAccountRejectsDuplicateActiveFQN(t *testing.T) {
	client := apptest.New(t)

	first := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "cash:Wallet",
		Currency: stringPtr("USD"),
	})
	if first.StatusCode != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode, http.StatusCreated, first.RawBody)
	}

	duplicate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "cash:Wallet",
		Currency: stringPtr("USD"),
	})
	if duplicate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode, http.StatusConflict, duplicate.RawBody)
	}
	if duplicate.Body.Error.Code != models.ErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.Body.Error.Code, models.ErrorCodeConflict)
	}

	deleted := apptest.Decode[jsonBody](client, http.MethodDelete, accountPath(first.Body.ID), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	recreated := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "cash:Wallet",
		Currency: stringPtr("USD"),
	})
	if recreated.StatusCode != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode, http.StatusCreated, recreated.RawBody)
	}
}

func TestAccountValidationErrors(t *testing.T) {
	client := apptest.New(t)

	invalidCurrency := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "checking:Chase",
		Currency: stringPtr("usd"),
	})
	if invalidCurrency.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid currency status = %d, want %d; body %s", invalidCurrency.StatusCode, http.StatusBadRequest, invalidCurrency.RawBody)
	}
	if invalidCurrency.Body.Error.Code != models.ErrorCodeInvalidRequest {
		t.Fatalf("invalid currency code = %q, want %q", invalidCurrency.Body.Error.Code, models.ErrorCodeInvalidRequest)
	}

	nonASCIICurrency := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "checking:CreditUnion",
		Currency: stringPtr("ÅB"),
	})
	if nonASCIICurrency.StatusCode != http.StatusBadRequest {
		t.Fatalf("non-ASCII currency status = %d, want %d; body %s", nonASCIICurrency.StatusCode, http.StatusBadRequest, nonASCIICurrency.RawBody)
	}

	missingExternalSystem := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:        "checking:Chase",
		ExternalID: stringPtr("acct-123"),
	})
	if missingExternalSystem.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing external system status = %d, want %d; body %s", missingExternalSystem.StatusCode, http.StatusBadRequest, missingExternalSystem.RawBody)
	}

	missingHidden := apptest.Decode[models.ErrorResponse](client, http.MethodPatch, "/accounts/1", map[string]any{})
	if missingHidden.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing hidden status = %d, want %d; body %s", missingHidden.StatusCode, http.StatusBadRequest, missingHidden.RawBody)
	}

	badQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/accounts?include_hidden=maybe", nil)
	if badQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode, http.StatusBadRequest, badQuery.RawBody)
	}

	extraField := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/accounts", map[string]any{
		"fqn":        "checking:Chase",
		"extraField": true,
	})
	if extraField.StatusCode != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode, http.StatusBadRequest, extraField.RawBody)
	}
}

func accountPath(id int64) string {
	return "/accounts/" + strconv.FormatInt(id, 10)
}

func assertAccountHierarchy(t *testing.T, account models.Account, kind string, parent string, name string, level int) {
	t.Helper()

	if account.Kind != kind {
		t.Fatalf("kind = %q, want %q", account.Kind, kind)
	}
	if account.ParentFQN == nil || *account.ParentFQN != parent {
		t.Fatalf("parent_fqn = %v, want %q", account.ParentFQN, parent)
	}
	if account.Name != name {
		t.Fatalf("name = %q, want %q", account.Name, name)
	}
	if account.Level != level {
		t.Fatalf("level = %d, want %d", account.Level, level)
	}
}

func assertAccountIDs(t *testing.T, accounts []models.Account, want []int64) {
	t.Helper()

	if len(accounts) != len(want) {
		t.Fatalf("account count = %d, want %d; accounts = %+v", len(accounts), len(want), accounts)
	}
	for i, account := range accounts {
		if account.ID != want[i] {
			t.Fatalf("account id at %d = %d, want %d; accounts = %+v", i, account.ID, want[i], accounts)
		}
	}
}

func stringPtr(value string) *string {
	return &value
}
