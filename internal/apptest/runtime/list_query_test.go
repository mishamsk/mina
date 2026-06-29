package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestSharedListQueryRejectsUnsupportedFiltersAndSorts(t *testing.T) {
	client := newSharedClient(t)

	unsupportedFilter, err := client.REST().ListCategoriesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("fqn=Food"))
	if err != nil {
		t.Fatalf("unsupported filter request: %v", err)
	}
	if unsupportedFilter.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unsupported filter status = %d, want %d; body %s", unsupportedFilter.StatusCode(), http.StatusBadRequest, unsupportedFilter.Body)
	}

	unsupportedSort, err := client.REST().ListCategoriesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("sort=name"))
	if err != nil {
		t.Fatalf("unsupported sort request: %v", err)
	}
	if unsupportedSort.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unsupported sort status = %d, want %d; body %s", unsupportedSort.StatusCode(), http.StatusBadRequest, unsupportedSort.Body)
	}

	unsupportedHidden, err := client.REST().ListMembersWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_hidden=true"))
	if err != nil {
		t.Fatalf("unsupported hidden request: %v", err)
	}
	if unsupportedHidden.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unsupported hidden status = %d, want %d; body %s", unsupportedHidden.StatusCode(), http.StatusBadRequest, unsupportedHidden.Body)
	}

	badLimit, err := client.REST().ListCategoriesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("limit=0"))
	if err != nil {
		t.Fatalf("bad limit request: %v", err)
	}
	if badLimit.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad limit status = %d, want %d; body %s", badLimit.StatusCode(), http.StatusBadRequest, badLimit.Body)
	}
}

func TestSharedListQueryHiddenDefaultAndPagination(t *testing.T) {
	client := newSharedClient(t)

	alpha := createListQueryCategory(t, client, "Budget:Alpha", false)
	beta := createListQueryCategory(t, client, "Budget:Beta", false)
	gamma := createListQueryCategory(t, client, "Budget:Gamma", false)
	hidden := createListQueryCategory(t, client, "Budget:Hidden", true)

	defaultList, err := client.REST().ListCategoriesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default list request: %v", err)
	}
	if defaultList.StatusCode() != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode(), http.StatusOK, defaultList.Body)
	}
	assertCategoryIDs(t, defaultList.JSON200.Categories, []int64{alpha.CategoryId, beta.CategoryId, gamma.CategoryId})

	includeHidden := true
	withHidden, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{IncludeHidden: &includeHidden})
	if err != nil {
		t.Fatalf("with hidden request: %v", err)
	}
	if withHidden.StatusCode() != http.StatusOK {
		t.Fatalf("with hidden status = %d, want %d; body %s", withHidden.StatusCode(), http.StatusOK, withHidden.Body)
	}
	assertCategoryIDs(t, withHidden.JSON200.Categories, []int64{alpha.CategoryId, beta.CategoryId, gamma.CategoryId, hidden.CategoryId})

	sortFQN := httpclient.ListCategoriesParamsSortFqn
	limitTwo := 2
	offsetOne := 1
	page, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{
		Sort:   &sortFQN,
		Limit:  &limitTwo,
		Offset: &offsetOne,
	})
	if err != nil {
		t.Fatalf("page request: %v", err)
	}
	if page.StatusCode() != http.StatusOK {
		t.Fatalf("page status = %d, want %d; body %s", page.StatusCode(), http.StatusOK, page.Body)
	}
	assertCategoryIDs(t, page.JSON200.Categories, []int64{beta.CategoryId, gamma.CategoryId})

	desc := httpclient.ListCategoriesParamsSortDirDesc
	descPage, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{
		Sort:    &sortFQN,
		SortDir: &desc,
		Limit:   &limitTwo,
	})
	if err != nil {
		t.Fatalf("desc page request: %v", err)
	}
	if descPage.StatusCode() != http.StatusOK {
		t.Fatalf("desc page status = %d, want %d; body %s", descPage.StatusCode(), http.StatusOK, descPage.Body)
	}
	assertCategoryIDs(t, descPage.JSON200.Categories, []int64{gamma.CategoryId, beta.CategoryId})
}

func TestSharedListQueryCompositeSortDirection(t *testing.T) {
	client := newSharedClient(t)

	eurEarly := createListQueryExchangeRate(t, client, "EUR", "USD", "2024-01-01T00:00:00Z")
	eurLate := createListQueryExchangeRate(t, client, "EUR", "USD", "2024-02-01T00:00:00Z")
	gbpEarly := createListQueryExchangeRate(t, client, "GBP", "USD", "2024-01-01T00:00:00Z")

	sortCurrencyPair := httpclient.ListExchangeRatesParamsSortCurrencyPair
	descSort := httpclient.ListExchangeRatesParamsSortDirDesc
	desc, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{
		Sort:    &sortCurrencyPair,
		SortDir: &descSort,
	})
	if err != nil {
		t.Fatalf("exchange rate desc request: %v", err)
	}
	if desc.StatusCode() != http.StatusOK {
		t.Fatalf("exchange rate desc status = %d, want %d; body %s", desc.StatusCode(), http.StatusOK, desc.Body)
	}
	assertExchangeRateIDs(t, desc.JSON200.ExchangeRates, []int64{gbpEarly.ExchangeRateId, eurLate.ExchangeRateId, eurEarly.ExchangeRateId})

	limitOne := 1
	offsetOne := 1
	page, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{
		Limit:  &limitOne,
		Offset: &offsetOne,
	})
	if err != nil {
		t.Fatalf("exchange rate page request: %v", err)
	}
	if page.StatusCode() != http.StatusOK {
		t.Fatalf("exchange rate page status = %d, want %d; body %s", page.StatusCode(), http.StatusOK, page.Body)
	}
	assertExchangeRateIDs(t, page.JSON200.ExchangeRates, []int64{eurLate.ExchangeRateId})

	offsetPage, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{Offset: &offsetOne})
	if err != nil {
		t.Fatalf("exchange rate offset page request: %v", err)
	}
	if offsetPage.StatusCode() != http.StatusOK {
		t.Fatalf("exchange rate offset page status = %d, want %d; body %s", offsetPage.StatusCode(), http.StatusOK, offsetPage.Body)
	}
	assertExchangeRateIDs(t, offsetPage.JSON200.ExchangeRates, []int64{eurLate.ExchangeRateId, gbpEarly.ExchangeRateId})
}

func createListQueryCategory(t *testing.T, client *apptest.Client, fqn string, hidden bool) httpclient.Category {
	t.Helper()

	return client.Scenario().CategoryWithHidden(fqn, hidden)
}

func createListQueryExchangeRate(t *testing.T, client *apptest.Client, fromCurrency string, toCurrency string, effectiveDate string) httpclient.ExchangeRate {
	t.Helper()

	return client.Scenario().ExchangeRate(fromCurrency, toCurrency, effectiveDate)
}
