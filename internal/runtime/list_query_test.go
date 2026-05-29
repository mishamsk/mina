package runtime_test

import (
	"net/http"
	"testing"

	"mina.local/mina/internal/apptest"
	models "mina.local/mina/internal/httpapi/openapi"
)

func TestSharedListQueryRejectsUnsupportedFiltersAndSorts(t *testing.T) {
	client := apptest.New(t)

	unsupportedFilter := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/categories?fqn=Food", nil)
	if unsupportedFilter.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsupported filter status = %d, want %d; body %s", unsupportedFilter.StatusCode, http.StatusBadRequest, unsupportedFilter.RawBody)
	}

	unsupportedSort := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/categories?sort=name", nil)
	if unsupportedSort.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsupported sort status = %d, want %d; body %s", unsupportedSort.StatusCode, http.StatusBadRequest, unsupportedSort.RawBody)
	}

	unsupportedHidden := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/members?include_hidden=true", nil)
	if unsupportedHidden.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsupported hidden status = %d, want %d; body %s", unsupportedHidden.StatusCode, http.StatusBadRequest, unsupportedHidden.RawBody)
	}

	badLimit := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/categories?limit=0", nil)
	if badLimit.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad limit status = %d, want %d; body %s", badLimit.StatusCode, http.StatusBadRequest, badLimit.RawBody)
	}
}

func TestSharedListQueryHiddenDefaultAndPagination(t *testing.T) {
	client := apptest.New(t)

	alpha := createListQueryCategory(t, client, "Budget:Alpha", false)
	beta := createListQueryCategory(t, client, "Budget:Beta", false)
	gamma := createListQueryCategory(t, client, "Budget:Gamma", false)
	hidden := createListQueryCategory(t, client, "Budget:Hidden", true)

	defaultList := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories", nil)
	if defaultList.StatusCode != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode, http.StatusOK, defaultList.RawBody)
	}
	assertCategoryIDs(t, defaultList.Body.Categories, []int64{alpha.CategoryId, beta.CategoryId, gamma.CategoryId})

	withHidden := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories?include_hidden=true", nil)
	if withHidden.StatusCode != http.StatusOK {
		t.Fatalf("with hidden status = %d, want %d; body %s", withHidden.StatusCode, http.StatusOK, withHidden.RawBody)
	}
	assertCategoryIDs(t, withHidden.Body.Categories, []int64{alpha.CategoryId, beta.CategoryId, gamma.CategoryId, hidden.CategoryId})

	page := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories?sort=fqn&limit=2&offset=1", nil)
	if page.StatusCode != http.StatusOK {
		t.Fatalf("page status = %d, want %d; body %s", page.StatusCode, http.StatusOK, page.RawBody)
	}
	assertCategoryIDs(t, page.Body.Categories, []int64{beta.CategoryId, gamma.CategoryId})

	descPage := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories?sort=fqn&sort_dir=desc&limit=2", nil)
	if descPage.StatusCode != http.StatusOK {
		t.Fatalf("desc page status = %d, want %d; body %s", descPage.StatusCode, http.StatusOK, descPage.RawBody)
	}
	assertCategoryIDs(t, descPage.Body.Categories, []int64{gamma.CategoryId, beta.CategoryId})
}

func TestSharedListQueryCompositeSortDirection(t *testing.T) {
	client := apptest.New(t)

	eurEarly := createListQueryExchangeRate(t, client, "EUR", "USD", "2024-01-01")
	eurLate := createListQueryExchangeRate(t, client, "EUR", "USD", "2024-02-01")
	gbpEarly := createListQueryExchangeRate(t, client, "GBP", "USD", "2024-01-01")

	desc := apptest.Decode[models.ExchangeRateListResponse](client, http.MethodGet, "/exchange-rates?sort=currency_pair&sort_dir=desc", nil)
	if desc.StatusCode != http.StatusOK {
		t.Fatalf("exchange rate desc status = %d, want %d; body %s", desc.StatusCode, http.StatusOK, desc.RawBody)
	}
	assertExchangeRateIDs(t, desc.Body.ExchangeRates, []int64{gbpEarly.ExchangeRateId, eurLate.ExchangeRateId, eurEarly.ExchangeRateId})
}

func createListQueryCategory(t *testing.T, client *apptest.Client, fqn string, hidden bool) models.Category {
	t.Helper()

	return client.Scenario().CategoryWithHidden(fqn, hidden)
}

func createListQueryExchangeRate(t *testing.T, client *apptest.Client, fromCurrency string, toCurrency string, effectiveDate string) models.ExchangeRate {
	t.Helper()

	return client.Scenario().ExchangeRate(fromCurrency, toCurrency, effectiveDate)
}
