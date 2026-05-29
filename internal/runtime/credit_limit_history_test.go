package runtime_test

import (
	"net/http"
	"strconv"
	"testing"

	"mina.local/mina/internal/apptest"
	"mina.local/mina/internal/models"
)

func TestCreditLimitHistoryCreateReadListDeleteBoundary(t *testing.T) {
	client := apptest.New(t)

	account := createCreditLimitAccount(t, client)
	later := apptest.Decode[models.CreditLimitHistory](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "5000.00",
		EffectiveDate: "2024-02-01",
	})
	if later.StatusCode != http.StatusCreated {
		t.Fatalf("later create status = %d, want %d; body %s", later.StatusCode, http.StatusCreated, later.RawBody)
	}
	if later.Body.AccountID != account.ID {
		t.Fatalf("later account_id = %d, want %d", later.Body.AccountID, account.ID)
	}
	if later.Body.CreditLimit != "5000.00000000" {
		t.Fatalf("later credit_limit = %q, want 5000.00000000", later.Body.CreditLimit)
	}

	earlier := apptest.Decode[models.CreditLimitHistory](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "4000",
		EffectiveDate: "2024-01-01",
	})
	if earlier.StatusCode != http.StatusCreated {
		t.Fatalf("earlier create status = %d, want %d; body %s", earlier.StatusCode, http.StatusCreated, earlier.RawBody)
	}

	read := apptest.Decode[models.CreditLimitHistory](client, http.MethodGet, creditLimitHistoryPath(later.Body.ID), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.ID != later.Body.ID {
		t.Fatalf("read id = %d, want %d", read.Body.ID, later.Body.ID)
	}

	list := apptest.Decode[models.CreditLimitHistoryListResponse](client, http.MethodGet, accountCreditLimitHistoryPath(account.ID), nil)
	if list.StatusCode != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode, http.StatusOK, list.RawBody)
	}
	assertCreditLimitHistoryIDs(t, list.Body.CreditLimitHistory, []int64{earlier.Body.ID, later.Body.ID})

	deleted := apptest.Decode[jsonBody](client, http.MethodDelete, creditLimitHistoryPath(earlier.Body.ID), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	missing := apptest.Decode[models.ErrorResponse](client, http.MethodGet, creditLimitHistoryPath(earlier.Body.ID), nil)
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode, http.StatusNotFound, missing.RawBody)
	}

	deletedRead := apptest.Decode[models.CreditLimitHistory](client, http.MethodGet, creditLimitHistoryPath(earlier.Body.ID)+"?include_tombstoned=true", nil)
	if deletedRead.StatusCode != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode, http.StatusOK, deletedRead.RawBody)
	}
	if deletedRead.Body.TombstonedAt == nil {
		t.Fatal("deleted credit limit history tombstoned_at = nil, want timestamp")
	}

	recreated := apptest.Decode[models.CreditLimitHistory](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "4500",
		EffectiveDate: "2024-01-01",
	})
	if recreated.StatusCode != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode, http.StatusCreated, recreated.RawBody)
	}

	defaultAfterRecreate := apptest.Decode[models.CreditLimitHistoryListResponse](client, http.MethodGet, accountCreditLimitHistoryPath(account.ID), nil)
	if defaultAfterRecreate.StatusCode != http.StatusOK {
		t.Fatalf("default after recreate status = %d, want %d; body %s", defaultAfterRecreate.StatusCode, http.StatusOK, defaultAfterRecreate.RawBody)
	}
	assertCreditLimitHistoryIDs(t, defaultAfterRecreate.Body.CreditLimitHistory, []int64{recreated.Body.ID, later.Body.ID})

	withTombstones := apptest.Decode[models.CreditLimitHistoryListResponse](client, http.MethodGet, accountCreditLimitHistoryPath(account.ID)+"?include_tombstoned=true", nil)
	if withTombstones.StatusCode != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode, http.StatusOK, withTombstones.RawBody)
	}
	assertCreditLimitHistoryIDs(t, withTombstones.Body.CreditLimitHistory, []int64{earlier.Body.ID, recreated.Body.ID, later.Body.ID})
}

func TestCreditLimitHistoryRejectsDuplicateActiveAccountDate(t *testing.T) {
	client := apptest.New(t)
	account := createCreditLimitAccount(t, client)

	first := apptest.Decode[models.CreditLimitHistory](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "10000",
		EffectiveDate: "2024-03-01",
	})
	if first.StatusCode != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode, http.StatusCreated, first.RawBody)
	}

	duplicate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "11000",
		EffectiveDate: "2024-03-01",
	})
	if duplicate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode, http.StatusConflict, duplicate.RawBody)
	}
	if duplicate.Body.Error.Code != models.ErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.Body.Error.Code, models.ErrorCodeConflict)
	}
}

func TestCreditLimitHistoryValidationErrors(t *testing.T) {
	client := apptest.New(t)
	account := createCreditLimitAccount(t, client)

	missingAccount := apptest.Decode[models.ErrorResponse](client, http.MethodPost, accountCreditLimitHistoryPath(999), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "10000",
		EffectiveDate: "2024-01-01",
	})
	if missingAccount.StatusCode != http.StatusNotFound {
		t.Fatalf("missing account status = %d, want %d; body %s", missingAccount.StatusCode, http.StatusNotFound, missingAccount.RawBody)
	}

	missingAccountList := apptest.Decode[models.ErrorResponse](client, http.MethodGet, accountCreditLimitHistoryPath(999), nil)
	if missingAccountList.StatusCode != http.StatusNotFound {
		t.Fatalf("missing account list status = %d, want %d; body %s", missingAccountList.StatusCode, http.StatusNotFound, missingAccountList.RawBody)
	}

	invalidDate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "10000",
		EffectiveDate: "2024-02-30",
	})
	if invalidDate.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid date status = %d, want %d; body %s", invalidDate.StatusCode, http.StatusBadRequest, invalidDate.RawBody)
	}

	negativeLimit := apptest.Decode[models.ErrorResponse](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "-1",
		EffectiveDate: "2024-01-01",
	})
	if negativeLimit.StatusCode != http.StatusBadRequest {
		t.Fatalf("negative limit status = %d, want %d; body %s", negativeLimit.StatusCode, http.StatusBadRequest, negativeLimit.RawBody)
	}

	tooPrecise := apptest.Decode[models.ErrorResponse](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "1.123456789",
		EffectiveDate: "2024-01-01",
	})
	if tooPrecise.StatusCode != http.StatusBadRequest {
		t.Fatalf("too precise status = %d, want %d; body %s", tooPrecise.StatusCode, http.StatusBadRequest, tooPrecise.RawBody)
	}

	tooManyDigits := apptest.Decode[models.ErrorResponse](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "1234567890123456789",
		EffectiveDate: "2024-01-01",
	})
	if tooManyDigits.StatusCode != http.StatusBadRequest {
		t.Fatalf("too many digits status = %d, want %d; body %s", tooManyDigits.StatusCode, http.StatusBadRequest, tooManyDigits.RawBody)
	}

	tooManyIntegerDigits := apptest.Decode[models.ErrorResponse](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), models.CreateCreditLimitHistoryRequest{
		CreditLimit:   "12345678901",
		EffectiveDate: "2024-01-01",
	})
	if tooManyIntegerDigits.StatusCode != http.StatusBadRequest {
		t.Fatalf("too many integer digits status = %d, want %d; body %s", tooManyIntegerDigits.StatusCode, http.StatusBadRequest, tooManyIntegerDigits.RawBody)
	}

	badQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, accountCreditLimitHistoryPath(account.ID)+"?include_tombstoned=", nil)
	if badQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode, http.StatusBadRequest, badQuery.RawBody)
	}

	extraField := apptest.Decode[models.ErrorResponse](client, http.MethodPost, accountCreditLimitHistoryPath(account.ID), map[string]any{
		"credit_limit":   "10000",
		"effective_date": "2024-01-01",
		"extraField":     true,
	})
	if extraField.StatusCode != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode, http.StatusBadRequest, extraField.RawBody)
	}
}

func createCreditLimitAccount(t *testing.T, client *apptest.Client) models.Account {
	t.Helper()

	account := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		FQN:      "credit:Visa:Rewards",
		Currency: stringPtr("USD"),
	})
	if account.StatusCode != http.StatusCreated {
		t.Fatalf("account create status = %d, want %d; body %s", account.StatusCode, http.StatusCreated, account.RawBody)
	}

	return account.Body
}

func creditLimitHistoryPath(id int64) string {
	return "/credit-limit-history/" + strconv.FormatInt(id, 10)
}

func accountCreditLimitHistoryPath(accountID int64) string {
	return "/accounts/" + strconv.FormatInt(accountID, 10) + "/credit-limit-history"
}

func assertCreditLimitHistoryIDs(t *testing.T, history []models.CreditLimitHistory, want []int64) {
	t.Helper()

	if len(history) != len(want) {
		t.Fatalf("credit limit history count = %d, want %d; history = %+v", len(history), len(want), history)
	}
	for i, entry := range history {
		if entry.ID != want[i] {
			t.Fatalf("credit limit history id at %d = %d, want %d; history = %+v", i, entry.ID, want[i], history)
		}
	}
}
