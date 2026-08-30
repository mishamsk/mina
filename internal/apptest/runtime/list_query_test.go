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
	if defaultList.JSON200.TotalCount != 3 {
		t.Fatalf("default list total_count = %d, want 3", defaultList.JSON200.TotalCount)
	}

	includeHidden := true
	withHidden, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{IncludeHidden: &includeHidden})
	if err != nil {
		t.Fatalf("with hidden request: %v", err)
	}
	if withHidden.StatusCode() != http.StatusOK {
		t.Fatalf("with hidden status = %d, want %d; body %s", withHidden.StatusCode(), http.StatusOK, withHidden.Body)
	}
	assertCategoryIDs(t, withHidden.JSON200.Categories, []int64{alpha.CategoryId, beta.CategoryId, gamma.CategoryId, hidden.CategoryId})
	if withHidden.JSON200.TotalCount != 4 {
		t.Fatalf("with hidden total_count = %d, want 4", withHidden.JSON200.TotalCount)
	}

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
	if page.JSON200.TotalCount != 3 {
		t.Fatalf("page total_count = %d, want 3", page.JSON200.TotalCount)
	}

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
	if descPage.JSON200.TotalCount != 3 {
		t.Fatalf("desc page total_count = %d, want 3", descPage.JSON200.TotalCount)
	}
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

func TestEntityListsUseSharedMembershipBeforeCanonicalPagination(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()

	client.Scenario().Category("Household:Transportation:Rail")
	road := client.Scenario().Category("Household:Transportation:Road")
	hidden := true
	hiddenIncome, err := client.REST().CreateCategoryWithResponse(ctx, httpclient.CreateCategoryRequest{
		Fqn: "Household:Transportation:Air", EconomicIntent: httpclient.CategoryEconomicIntentIncome, IsHidden: &hidden,
	})
	requireClientResponse(t, "create hidden income category", err, hiddenIncome.StatusCode(), http.StatusCreated, hiddenIncome.Body)
	label := "Favorite fare"
	labeled, err := client.REST().CreateCategoryWithResponse(ctx, httpclient.CreateCategoryRequest{
		Fqn: "Household:Food:Dining", DisplayLabel: &label, EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	requireClientResponse(t, "create labeled category", err, labeled.StatusCode(), http.StatusCreated, labeled.Body)
	archived := client.Scenario().Category("Archived:Nested:Leaf")
	deleted, err := client.REST().DeleteCategoryWithResponse(ctx, archived.CategoryId)
	requireClientResponse(t, "delete archived category", err, deleted.StatusCode(), http.StatusNoContent, deleted.Body)

	query := "Household:Transportatio"
	expense := []httpclient.CategoryEconomicIntent{httpclient.CategoryEconomicIntentExpense}
	limit := 1
	offset := 1
	page, err := client.REST().ListCategoriesWithResponse(ctx, &httpclient.ListCategoriesParams{
		Q: &query, EconomicIntent: &expense, Limit: &limit, Offset: &offset,
	})
	requireClientResponse(t, "filter categories by implicit group", err, page.StatusCode(), http.StatusOK, page.Body)
	assertCategoryIDs(t, page.JSON200.Categories, []int64{road.CategoryId})
	if page.JSON200.TotalCount != 2 {
		t.Fatalf("group-filtered total_count = %d, want 2", page.JSON200.TotalCount)
	}

	desc := httpclient.ListCategoriesParamsSortDirDesc
	descPage, err := client.REST().ListCategoriesWithResponse(ctx, &httpclient.ListCategoriesParams{
		Q: &query, EconomicIntent: &expense, SortDir: &desc, Limit: &limit,
	})
	requireClientResponse(t, "filter categories descending", err, descPage.StatusCode(), http.StatusOK, descPage.Body)
	assertCategoryIDs(t, descPage.JSON200.Categories, []int64{road.CategoryId})

	titleQuery := "favorite"
	titleMatch, err := client.REST().ListCategoriesWithResponse(ctx, &httpclient.ListCategoriesParams{Q: &titleQuery})
	requireClientResponse(t, "filter categories by effective title", err, titleMatch.StatusCode(), http.StatusOK, titleMatch.Body)
	assertCategoryIDs(t, titleMatch.JSON200.Categories, []int64{labeled.JSON201.CategoryId})

	income := []httpclient.CategoryEconomicIntent{httpclient.CategoryEconomicIntentIncome}
	hiddenExcluded, err := client.REST().ListCategoriesWithResponse(ctx, &httpclient.ListCategoriesParams{Q: &query, EconomicIntent: &income})
	requireClientResponse(t, "intersect category query with visibility", err, hiddenExcluded.StatusCode(), http.StatusOK, hiddenExcluded.Body)
	assertCategoryIDs(t, hiddenExcluded.JSON200.Categories, nil)
	includeHidden := true
	hiddenIncluded, err := client.REST().ListCategoriesWithResponse(ctx, &httpclient.ListCategoriesParams{
		Q: &query, EconomicIntent: &income, IncludeHidden: &includeHidden,
	})
	requireClientResponse(t, "include hidden category query", err, hiddenIncluded.StatusCode(), http.StatusOK, hiddenIncluded.Body)
	assertCategoryIDs(t, hiddenIncluded.JSON200.Categories, []int64{hiddenIncome.JSON201.CategoryId})

	includeTombstoned := true
	archivedGroupQuery := "Xrchived:Nested"
	tombstoneMatch, err := client.REST().ListCategoriesWithResponse(ctx, &httpclient.ListCategoriesParams{
		Q: &archivedGroupQuery, IncludeTombstoned: &includeTombstoned,
	})
	requireClientResponse(t, "exclude tombstone-derived group expansion", err, tombstoneMatch.StatusCode(), http.StatusOK, tombstoneMatch.Body)
	assertCategoryIDs(t, tombstoneMatch.JSON200.Categories, nil)
}

func TestEntityListMembershipIntersectsEntityFilters(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()

	owned := client.Scenario().AccountWithType("Shared:Wallet", httpclient.WritableAccountTypeOwned)
	flow := client.Scenario().AccountWithType("Shared:Expense", httpclient.WritableAccountTypeFlow)
	client.Scenario().AccountWithType("Other:Party", httpclient.WritableAccountTypeParty)
	query := "shared"
	types := []httpclient.AccountType{httpclient.AccountTypeOwned, httpclient.AccountTypeFlow}
	accounts, err := client.REST().ListAccountsWithResponse(ctx, &httpclient.ListAccountsParams{Q: &query, AccountType: &types})
	requireClientResponse(t, "filter multiple account types", err, accounts.StatusCode(), http.StatusOK, accounts.Body)
	assertAccountIDs(t, accounts.JSON200.Accounts, []int64{flow.AccountId, owned.AccountId})
	if accounts.JSON200.TotalCount != 2 {
		t.Fatalf("filtered account total_count = %d, want 2", accounts.JSON200.TotalCount)
	}

	tag := client.Scenario().Tag("Trips:Summer")
	tagQuery := "sumer"
	tags, err := client.REST().ListTagsWithResponse(ctx, &httpclient.ListTagsParams{Q: &tagQuery})
	requireClientResponse(t, "filter tags by shared typo membership", err, tags.StatusCode(), http.StatusOK, tags.Body)
	assertTagIDs(t, tags.JSON200.Tags, []int64{tag.TagId})

	member := client.Scenario().Member("Alexandra")
	client.Scenario().Member("Blair")
	memberQuery := "alex"
	members, err := client.REST().ListMembersWithResponse(ctx, &httpclient.ListMembersParams{Q: &memberQuery})
	requireClientResponse(t, "filter members by shared name membership", err, members.StatusCode(), http.StatusOK, members.Body)
	assertMemberIDs(t, members.JSON200.Members, []int64{member.MemberId})
}

func createListQueryCategory(t *testing.T, client *apptest.Client, fqn string, hidden bool) httpclient.Category {
	t.Helper()

	return client.Scenario().CategoryWithHidden(fqn, hidden)
}

func createListQueryExchangeRate(t *testing.T, client *apptest.Client, fromCurrency string, toCurrency string, effectiveDate string) httpclient.ExchangeRate {
	t.Helper()

	return client.Scenario().ExchangeRate(fromCurrency, toCurrency, effectiveDate)
}
