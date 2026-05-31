package runtime_test

import (
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestExchangeRateCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	later := apptest.Decode[models.ExchangeRate](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.08000000",
		EffectiveDate: "2024-02-01",
	})
	if later.StatusCode != http.StatusCreated {
		t.Fatalf("later create status = %d, want %d; body %s", later.StatusCode, http.StatusCreated, later.RawBody)
	}
	if later.Body.FromCurrency != "EUR" || later.Body.ToCurrency != "USD" {
		t.Fatalf("currency pair = %s/%s, want EUR/USD", later.Body.FromCurrency, later.Body.ToCurrency)
	}
	if later.Body.Rate != "1.08000000" {
		t.Fatalf("later rate = %q, want 1.08000000", later.Body.Rate)
	}

	earlier := apptest.Decode[models.ExchangeRate](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.07000000",
		EffectiveDate: "2024-01-01",
	})
	if earlier.StatusCode != http.StatusCreated {
		t.Fatalf("earlier create status = %d, want %d; body %s", earlier.StatusCode, http.StatusCreated, earlier.RawBody)
	}

	other := apptest.Decode[models.ExchangeRate](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "GBP",
		ToCurrency:    "USD",
		Rate:          "1.25000000",
		EffectiveDate: "2024-01-01",
	})
	if other.StatusCode != http.StatusCreated {
		t.Fatalf("other create status = %d, want %d; body %s", other.StatusCode, http.StatusCreated, other.RawBody)
	}

	read := apptest.Decode[models.ExchangeRate](client, http.MethodGet, exchangeRatePath(later.Body.ExchangeRateId), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.ExchangeRateId != later.Body.ExchangeRateId {
		t.Fatalf("read id = %d, want %d", read.Body.ExchangeRateId, later.Body.ExchangeRateId)
	}

	defaultList := apptest.Decode[models.ExchangeRateListResponse](client, http.MethodGet, "/exchange-rates", nil)
	if defaultList.StatusCode != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode, http.StatusOK, defaultList.RawBody)
	}
	assertExchangeRateIDs(t, defaultList.Body.ExchangeRates, []int64{earlier.Body.ExchangeRateId, later.Body.ExchangeRateId, other.Body.ExchangeRateId})

	filteredPair := apptest.Decode[models.ExchangeRateListResponse](client, http.MethodGet, "/exchange-rates?from_currency=EUR&to_currency=USD", nil)
	if filteredPair.StatusCode != http.StatusOK {
		t.Fatalf("filtered pair status = %d, want %d; body %s", filteredPair.StatusCode, http.StatusOK, filteredPair.RawBody)
	}
	assertExchangeRateIDs(t, filteredPair.Body.ExchangeRates, []int64{earlier.Body.ExchangeRateId, later.Body.ExchangeRateId})

	filteredDate := apptest.Decode[models.ExchangeRateListResponse](client, http.MethodGet, "/exchange-rates?from_currency=EUR&to_currency=USD&effective_date=2024-02-01", nil)
	if filteredDate.StatusCode != http.StatusOK {
		t.Fatalf("filtered date status = %d, want %d; body %s", filteredDate.StatusCode, http.StatusOK, filteredDate.RawBody)
	}
	assertExchangeRateIDs(t, filteredDate.Body.ExchangeRates, []int64{later.Body.ExchangeRateId})

	updated := apptest.Decode[models.ExchangeRate](client, http.MethodPatch, exchangeRatePath(later.Body.ExchangeRateId), models.UpdateExchangeRateRequest{
		Rate: "1.09000000",
	})
	if updated.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode, http.StatusOK, updated.RawBody)
	}
	if updated.Body.Rate != "1.09000000" {
		t.Fatalf("updated rate = %q, want 1.09000000", updated.Body.Rate)
	}

	deleted := apptest.Decode[apptest.EmptyJSON](client, http.MethodDelete, exchangeRatePath(earlier.Body.ExchangeRateId), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	missing := apptest.Decode[models.ErrorResponse](client, http.MethodGet, exchangeRatePath(earlier.Body.ExchangeRateId), nil)
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode, http.StatusNotFound, missing.RawBody)
	}

	deletedRead := apptest.Decode[models.ExchangeRate](client, http.MethodGet, exchangeRatePath(earlier.Body.ExchangeRateId)+"?include_tombstoned=true", nil)
	if deletedRead.StatusCode != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode, http.StatusOK, deletedRead.RawBody)
	}
	if deletedRead.Body.TombstonedAt == nil {
		t.Fatal("deleted exchange rate tombstoned_at = nil, want timestamp")
	}

	withTombstones := apptest.Decode[models.ExchangeRateListResponse](client, http.MethodGet, "/exchange-rates?from_currency=EUR&to_currency=USD&include_tombstoned=true", nil)
	if withTombstones.StatusCode != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode, http.StatusOK, withTombstones.RawBody)
	}
	assertExchangeRateIDs(t, withTombstones.Body.ExchangeRates, []int64{earlier.Body.ExchangeRateId, later.Body.ExchangeRateId})
}

func TestExchangeRateRejectsDuplicateActivePairDate(t *testing.T) {
	client := newSharedClient(t)

	first := apptest.Decode[models.ExchangeRate](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.08000000",
		EffectiveDate: "2024-02-01",
	})
	if first.StatusCode != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode, http.StatusCreated, first.RawBody)
	}

	duplicate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.09000000",
		EffectiveDate: "2024-02-01",
	})
	if duplicate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode, http.StatusConflict, duplicate.RawBody)
	}
	if duplicate.Body.Error.Code != models.APIErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.Body.Error.Code, models.APIErrorCodeConflict)
	}

	deleted := apptest.Decode[apptest.EmptyJSON](client, http.MethodDelete, exchangeRatePath(first.Body.ExchangeRateId), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	recreated := apptest.Decode[models.ExchangeRate](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.10000000",
		EffectiveDate: "2024-02-01",
	})
	if recreated.StatusCode != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode, http.StatusCreated, recreated.RawBody)
	}
}

func TestExchangeRateValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	invalidCurrency := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "eur",
		ToCurrency:    "USD",
		Rate:          "1.08000000",
		EffectiveDate: "2024-02-01",
	})
	if invalidCurrency.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid currency status = %d, want %d; body %s", invalidCurrency.StatusCode, http.StatusBadRequest, invalidCurrency.RawBody)
	}

	zeroRate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "0.00000000",
		EffectiveDate: "2024-02-01",
	})
	if zeroRate.StatusCode != http.StatusBadRequest {
		t.Fatalf("zero rate status = %d, want %d; body %s", zeroRate.StatusCode, http.StatusBadRequest, zeroRate.RawBody)
	}

	negativeRate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "-1",
		EffectiveDate: "2024-02-01",
	})
	if negativeRate.StatusCode != http.StatusBadRequest {
		t.Fatalf("negative rate status = %d, want %d; body %s", negativeRate.StatusCode, http.StatusBadRequest, negativeRate.RawBody)
	}

	tooManyIntegerDigits := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "12345678901",
		EffectiveDate: "2024-02-01",
	})
	if tooManyIntegerDigits.StatusCode != http.StatusBadRequest {
		t.Fatalf("too many integer digits status = %d, want %d; body %s", tooManyIntegerDigits.StatusCode, http.StatusBadRequest, tooManyIntegerDigits.RawBody)
	}

	invalidDate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.08000000",
		EffectiveDate: "2024-02-30",
	})
	if invalidDate.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid date status = %d, want %d; body %s", invalidDate.StatusCode, http.StatusBadRequest, invalidDate.RawBody)
	}

	unsupportedFilter := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/exchange-rates?currency=EUR", nil)
	if unsupportedFilter.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsupported filter status = %d, want %d; body %s", unsupportedFilter.StatusCode, http.StatusBadRequest, unsupportedFilter.RawBody)
	}

	invalidFilterCurrency := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/exchange-rates?from_currency=eur", nil)
	if invalidFilterCurrency.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid filter currency status = %d, want %d; body %s", invalidFilterCurrency.StatusCode, http.StatusBadRequest, invalidFilterCurrency.RawBody)
	}

	badQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/exchange-rates?include_tombstoned=", nil)
	if badQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode, http.StatusBadRequest, badQuery.RawBody)
	}

	missingRate := apptest.Decode[models.ErrorResponse](client, http.MethodPatch, "/exchange-rates/1", map[string]any{})
	if missingRate.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing rate status = %d, want %d; body %s", missingRate.StatusCode, http.StatusBadRequest, missingRate.RawBody)
	}

	extraField := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/exchange-rates", map[string]any{
		"from_currency":  "EUR",
		"to_currency":    "USD",
		"rate":           "1.08000000",
		"effective_date": "2024-02-01",
		"extraField":     true,
	})
	if extraField.StatusCode != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode, http.StatusBadRequest, extraField.RawBody)
	}
}

func exchangeRatePath(id int64) string {
	return apptest.IDPath("/exchange-rates", id)
}

func assertExchangeRateIDs(t *testing.T, rates []models.ExchangeRate, want []int64) {
	t.Helper()

	if len(rates) != len(want) {
		t.Fatalf("exchange rate count = %d, want %d; rates = %+v", len(rates), len(want), rates)
	}
	for i, rate := range rates {
		if rate.ExchangeRateId != want[i] {
			t.Fatalf("exchange rate id at %d = %d, want %d; rates = %+v", i, rate.ExchangeRateId, want[i], rates)
		}
	}
}
