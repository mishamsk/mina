package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestCreditLimitHistoryCreateReadListDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	account := createCreditLimitAccount(t, client)
	later, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "5000.00",
		EffectiveDate: apptest.Date("2024-02-01"),
	})
	if err != nil {
		t.Fatalf("later create request: %v", err)
	}
	if later.StatusCode() != http.StatusCreated {
		t.Fatalf("later create status = %d, want %d; body %s", later.StatusCode(), http.StatusCreated, later.Body)
	}
	if later.JSON201.AccountId != account.AccountId {
		t.Fatalf("later account_id = %d, want %d", later.JSON201.AccountId, account.AccountId)
	}
	if later.JSON201.CreditLimit != "5000.00000000" {
		t.Fatalf("later credit_limit = %q, want 5000.00000000", later.JSON201.CreditLimit)
	}

	earlier, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "4000",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("earlier create request: %v", err)
	}
	if earlier.StatusCode() != http.StatusCreated {
		t.Fatalf("earlier create status = %d, want %d; body %s", earlier.StatusCode(), http.StatusCreated, earlier.Body)
	}

	read, err := client.REST().GetCreditLimitHistoryWithResponse(context.Background(), later.JSON201.CreditLimitHistoryId, nil)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.CreditLimitHistoryId != later.JSON201.CreditLimitHistoryId {
		t.Fatalf("read id = %d, want %d", read.JSON200.CreditLimitHistoryId, later.JSON201.CreditLimitHistoryId)
	}

	list, err := client.REST().ListCreditLimitHistoryWithResponse(context.Background(), account.AccountId, nil)
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	assertCreditLimitHistoryIDs(t, list.JSON200.CreditLimitHistory, []int64{earlier.JSON201.CreditLimitHistoryId, later.JSON201.CreditLimitHistoryId})

	limitOne := 1
	offsetOne := 1
	page, err := client.REST().ListCreditLimitHistoryWithResponse(context.Background(), account.AccountId, &httpclient.ListCreditLimitHistoryParams{
		Limit:  &limitOne,
		Offset: &offsetOne,
	})
	if err != nil {
		t.Fatalf("page request: %v", err)
	}
	if page.StatusCode() != http.StatusOK {
		t.Fatalf("page status = %d, want %d; body %s", page.StatusCode(), http.StatusOK, page.Body)
	}
	assertCreditLimitHistoryIDs(t, page.JSON200.CreditLimitHistory, []int64{later.JSON201.CreditLimitHistoryId})

	deleted, err := client.REST().DeleteCreditLimitHistoryWithResponse(context.Background(), earlier.JSON201.CreditLimitHistoryId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	missing, err := client.REST().GetCreditLimitHistoryWithResponse(context.Background(), earlier.JSON201.CreditLimitHistoryId, nil)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	includeTombstoned := true
	deletedRead, err := client.REST().GetCreditLimitHistoryWithResponse(context.Background(), earlier.JSON201.CreditLimitHistoryId, &httpclient.GetCreditLimitHistoryParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("get deleted with tombstones request: %v", err)
	}
	if deletedRead.StatusCode() != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode(), http.StatusOK, deletedRead.Body)
	}
	if deletedRead.JSON200.TombstonedAt == nil {
		t.Fatal("deleted credit limit history tombstoned_at = nil, want timestamp")
	}

	recreated, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "4500",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("recreate request: %v", err)
	}
	if recreated.StatusCode() != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode(), http.StatusCreated, recreated.Body)
	}

	defaultAfterRecreate, err := client.REST().ListCreditLimitHistoryWithResponse(context.Background(), account.AccountId, nil)
	if err != nil {
		t.Fatalf("default after recreate request: %v", err)
	}
	if defaultAfterRecreate.StatusCode() != http.StatusOK {
		t.Fatalf("default after recreate status = %d, want %d; body %s", defaultAfterRecreate.StatusCode(), http.StatusOK, defaultAfterRecreate.Body)
	}
	assertCreditLimitHistoryIDs(t, defaultAfterRecreate.JSON200.CreditLimitHistory, []int64{recreated.JSON201.CreditLimitHistoryId, later.JSON201.CreditLimitHistoryId})

	withTombstones, err := client.REST().ListCreditLimitHistoryWithResponse(context.Background(), account.AccountId, &httpclient.ListCreditLimitHistoryParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("include tombstones request: %v", err)
	}
	if withTombstones.StatusCode() != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode(), http.StatusOK, withTombstones.Body)
	}
	assertCreditLimitHistoryIDs(t, withTombstones.JSON200.CreditLimitHistory, []int64{earlier.JSON201.CreditLimitHistoryId, recreated.JSON201.CreditLimitHistoryId, later.JSON201.CreditLimitHistoryId})
}

func TestCreditLimitHistoryRejectsDuplicateActiveAccountDate(t *testing.T) {
	client := newSharedClient(t)
	account := createCreditLimitAccount(t, client)

	first, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "10000",
		EffectiveDate: apptest.Date("2024-03-01"),
	})
	if err != nil {
		t.Fatalf("first create request: %v", err)
	}
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	duplicate, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "11000",
		EffectiveDate: apptest.Date("2024-03-01"),
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
}

func TestCreditLimitHistoryValidationErrors(t *testing.T) {
	client := newSharedClient(t)
	account := createCreditLimitAccount(t, client)

	missingAccount, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), 999, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "10000",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("missing account request: %v", err)
	}
	if missingAccount.StatusCode() != http.StatusNotFound {
		t.Fatalf("missing account status = %d, want %d; body %s", missingAccount.StatusCode(), http.StatusNotFound, missingAccount.Body)
	}

	missingAccountList, err := client.REST().ListCreditLimitHistoryWithResponse(context.Background(), 999, nil)
	if err != nil {
		t.Fatalf("missing account list request: %v", err)
	}
	if missingAccountList.StatusCode() != http.StatusNotFound {
		t.Fatalf("missing account list status = %d, want %d; body %s", missingAccountList.StatusCode(), http.StatusNotFound, missingAccountList.Body)
	}

	tombstonedAccount := client.Scenario().AccountWithCurrency("credit:TombstonedLimitAccount", "USD")
	deleteAccount(t, client, tombstonedAccount.AccountId)
	tombstonedAccountCreate, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), tombstonedAccount.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "10000",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("tombstoned account create request: %v", err)
	}
	if tombstonedAccountCreate.StatusCode() != http.StatusNotFound {
		t.Fatalf("tombstoned account create status = %d, want %d; body %s", tombstonedAccountCreate.StatusCode(), http.StatusNotFound, tombstonedAccountCreate.Body)
	}
	if tombstonedAccountCreate.JSON404 == nil || tombstonedAccountCreate.JSON404.Error.Code != httpclient.APIErrorCodeNotFound {
		t.Fatalf("tombstoned account create error = %+v, want not_found; body %s", tombstonedAccountCreate.JSON404, tombstonedAccountCreate.Body)
	}

	tombstonedAccountList, err := client.REST().ListCreditLimitHistoryWithResponse(context.Background(), tombstonedAccount.AccountId, nil)
	if err != nil {
		t.Fatalf("tombstoned account list request: %v", err)
	}
	if tombstonedAccountList.StatusCode() != http.StatusNotFound {
		t.Fatalf("tombstoned account list status = %d, want %d; body %s", tombstonedAccountList.StatusCode(), http.StatusNotFound, tombstonedAccountList.Body)
	}
	if tombstonedAccountList.JSON404 == nil || tombstonedAccountList.JSON404.Error.Code != httpclient.APIErrorCodeNotFound {
		t.Fatalf("tombstoned account list error = %+v, want not_found; body %s", tombstonedAccountList.JSON404, tombstonedAccountList.Body)
	}

	invalidDate, err := client.REST().CreateCreditLimitHistoryWithBodyWithResponse(context.Background(), account.AccountId, "application/json", apptest.JSONReader(map[string]any{
		"credit_limit":   "10000",
		"effective_date": "2024-02-30",
	}))
	if err != nil {
		t.Fatalf("invalid date request: %v", err)
	}
	if invalidDate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid date status = %d, want %d; body %s", invalidDate.StatusCode(), http.StatusBadRequest, invalidDate.Body)
	}

	negativeLimit, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "-1",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("negative limit request: %v", err)
	}
	if negativeLimit.StatusCode() != http.StatusBadRequest {
		t.Fatalf("negative limit status = %d, want %d; body %s", negativeLimit.StatusCode(), http.StatusBadRequest, negativeLimit.Body)
	}

	tooPrecise, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "1.123456789",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("too precise request: %v", err)
	}
	if tooPrecise.StatusCode() != http.StatusBadRequest {
		t.Fatalf("too precise status = %d, want %d; body %s", tooPrecise.StatusCode(), http.StatusBadRequest, tooPrecise.Body)
	}

	tooManyDigits, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "1234567890123456789",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("too many digits request: %v", err)
	}
	if tooManyDigits.StatusCode() != http.StatusBadRequest {
		t.Fatalf("too many digits status = %d, want %d; body %s", tooManyDigits.StatusCode(), http.StatusBadRequest, tooManyDigits.Body)
	}

	tooManyIntegerDigits, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
		CreditLimit:   "12345678901",
		EffectiveDate: apptest.Date("2024-01-01"),
	})
	if err != nil {
		t.Fatalf("too many integer digits request: %v", err)
	}
	if tooManyIntegerDigits.StatusCode() != http.StatusBadRequest {
		t.Fatalf("too many integer digits status = %d, want %d; body %s", tooManyIntegerDigits.StatusCode(), http.StatusBadRequest, tooManyIntegerDigits.Body)
	}

	badQuery, err := client.REST().ListCreditLimitHistoryWithResponse(context.Background(), account.AccountId, nil, apptest.ReplaceRawQuery("include_tombstoned="))
	if err != nil {
		t.Fatalf("bad query request: %v", err)
	}
	if badQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode(), http.StatusBadRequest, badQuery.Body)
	}

	extraField, err := client.REST().CreateCreditLimitHistoryWithBodyWithResponse(context.Background(), account.AccountId, "application/json", apptest.JSONReader(map[string]any{
		"credit_limit":   "10000",
		"effective_date": "2024-01-01",
		"extraField":     true,
	}))
	if err != nil {
		t.Fatalf("extra field request: %v", err)
	}
	if extraField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode(), http.StatusBadRequest, extraField.Body)
	}
}

func createCreditLimitAccount(t *testing.T, client *apptest.Client) httpclient.Account {
	t.Helper()

	return client.Scenario().AccountWithCurrency("credit:Visa:Rewards", "USD")
}

func assertCreditLimitHistoryIDs(t *testing.T, history []httpclient.CreditLimitHistory, want []int64) {
	t.Helper()

	if len(history) != len(want) {
		t.Fatalf("credit limit history count = %d, want %d; history = %+v", len(history), len(want), history)
	}
	for i, entry := range history {
		if entry.CreditLimitHistoryId != want[i] {
			t.Fatalf("credit limit history id at %d = %d, want %d; history = %+v", i, entry.CreditLimitHistoryId, want[i], history)
		}
	}
}
