package runtime_test

import (
	"net/http"
	"testing"

	"mina.local/mina/internal/apptest"
	"mina.local/mina/internal/models"
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
	assertCategoryIDs(t, defaultList.Body.Categories, []int64{alpha.ID, beta.ID, gamma.ID})

	withHidden := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories?include_hidden=true", nil)
	if withHidden.StatusCode != http.StatusOK {
		t.Fatalf("with hidden status = %d, want %d; body %s", withHidden.StatusCode, http.StatusOK, withHidden.RawBody)
	}
	assertCategoryIDs(t, withHidden.Body.Categories, []int64{alpha.ID, beta.ID, gamma.ID, hidden.ID})

	page := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories?sort=fqn&limit=2&offset=1", nil)
	if page.StatusCode != http.StatusOK {
		t.Fatalf("page status = %d, want %d; body %s", page.StatusCode, http.StatusOK, page.RawBody)
	}
	assertCategoryIDs(t, page.Body.Categories, []int64{beta.ID, gamma.ID})

	descPage := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories?sort=fqn&sort_dir=desc&limit=2", nil)
	if descPage.StatusCode != http.StatusOK {
		t.Fatalf("desc page status = %d, want %d; body %s", descPage.StatusCode, http.StatusOK, descPage.RawBody)
	}
	assertCategoryIDs(t, descPage.Body.Categories, []int64{gamma.ID, beta.ID})
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
	assertExchangeRateIDs(t, desc.Body.ExchangeRates, []int64{gbpEarly.ID, eurLate.ID, eurEarly.ID})
}

func createListQueryCategory(t *testing.T, client *apptest.Client, fqn string, hidden bool) models.Category {
	t.Helper()

	category := apptest.Decode[models.Category](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		FQN:      fqn,
		IsHidden: boolPtr(hidden),
	})
	if category.StatusCode != http.StatusCreated {
		t.Fatalf("create category %q status = %d, want %d; body %s", fqn, category.StatusCode, http.StatusCreated, category.RawBody)
	}

	return category.Body
}

func createListQueryExchangeRate(t *testing.T, client *apptest.Client, fromCurrency string, toCurrency string, effectiveDate string) models.ExchangeRate {
	t.Helper()

	rate := apptest.Decode[models.ExchangeRate](client, http.MethodPost, "/exchange-rates", models.CreateExchangeRateRequest{
		FromCurrency:  fromCurrency,
		ToCurrency:    toCurrency,
		Rate:          "1.10000000",
		EffectiveDate: effectiveDate,
	})
	if rate.StatusCode != http.StatusCreated {
		t.Fatalf("create exchange rate %s/%s %s status = %d, want %d; body %s", fromCurrency, toCurrency, effectiveDate, rate.StatusCode, http.StatusCreated, rate.RawBody)
	}

	return rate.Body
}
