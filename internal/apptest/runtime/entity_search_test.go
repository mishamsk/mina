package runtime_test

import (
	"context"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestEntitySearchAPIBoundaries(t *testing.T) {
	t.Run("ranked hierarchy search", testRankedHierarchySearch)
	t.Run("account exact group ranking", testAccountExactGroupRanking)
	t.Run("tag exact group ranking", testTagExactGroupRanking)
	t.Run("entity contexts and visibility", testEntitySearchContextsAndVisibility)
	t.Run("per-entity advanced policy", testEntitySearchAdvancedPolicy)
	t.Run("bulk account facts", testBulkAccountSearchFacts)
	t.Run("creation availability", testEntityCreationAvailability)
	t.Run("long FQN inputs", testLongEntitySearchInputs)
	t.Run("standard errors", testEntitySearchErrors)
}

func testEntitySearchAdvancedPolicy(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	hidden := true

	accountVisible := client.Scenario().Account("search-policy-account:branch:visible")
	accountHidden, err := client.REST().CreateAccountWithResponse(ctx, httpclient.CreateAccountRequest{
		Fqn: "search-policy-account:branch:hidden", AccountType: httpclient.WritableAccountTypeFlow, IsHidden: &hidden,
	})
	requireClientResponse(t, "create hidden policy account", err, accountHidden.StatusCode(), http.StatusCreated, accountHidden.Body)
	accountParent := "search-policy-account:branch"
	accounts, err := client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextNavigation, Limit: 20, ParentFqn: &accountParent,
	})
	requireClientResponse(t, "search visible policy accounts", err, accounts.StatusCode(), http.StatusOK, accounts.Body)
	assertSearchIDs(t, "visible policy accounts", accountSearchLeafIDs(accounts.JSON200.Items), []int64{accountVisible.AccountId})
	accountExcluded := []int64{accountVisible.AccountId}
	accounts, err = client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextNavigation, Limit: 20, ParentFqn: &accountParent, IncludeHidden: &hidden, ExcludeIds: &accountExcluded,
	})
	requireClientResponse(t, "search hidden policy accounts", err, accounts.StatusCode(), http.StatusOK, accounts.Body)
	assertSearchIDs(t, "hidden policy accounts", accountSearchLeafIDs(accounts.JSON200.Items), []int64{accountHidden.JSON201.AccountId})

	tagVisible := client.Scenario().Tag("search-policy-tag:branch:visible")
	tagHidden, err := client.REST().CreateTagWithResponse(ctx, httpclient.CreateTagRequest{
		Fqn: "search-policy-tag:branch:hidden", IsHidden: &hidden,
	})
	requireClientResponse(t, "create hidden policy tag", err, tagHidden.StatusCode(), http.StatusCreated, tagHidden.Body)
	tagParent := "search-policy-tag:branch"
	tags, err := client.REST().SearchTagsWithResponse(ctx, &httpclient.SearchTagsParams{
		Context: httpclient.SearchTagsParamsContextNavigation, Limit: 20, ParentFqn: &tagParent,
	})
	requireClientResponse(t, "search visible policy tags", err, tags.StatusCode(), http.StatusOK, tags.Body)
	assertSearchIDs(t, "visible policy tags", tagSearchLeafIDs(tags.JSON200.Items), []int64{tagVisible.TagId})
	tagExcluded := []int64{tagVisible.TagId}
	tags, err = client.REST().SearchTagsWithResponse(ctx, &httpclient.SearchTagsParams{
		Context: httpclient.SearchTagsParamsContextNavigation, Limit: 20, ParentFqn: &tagParent, IncludeHidden: &hidden, ExcludeIds: &tagExcluded,
	})
	requireClientResponse(t, "search hidden policy tags", err, tags.StatusCode(), http.StatusOK, tags.Body)
	assertSearchIDs(t, "hidden policy tags", tagSearchLeafIDs(tags.JSON200.Items), []int64{tagHidden.JSON201.TagId})

	memberVisible := client.Scenario().Member("Search Policy Member Visible")
	memberHidden := client.Scenario().Member("Search Policy Member Hidden")
	updatedMember, err := client.REST().UpdateMemberHiddenWithResponse(ctx, memberHidden.MemberId, httpclient.UpdateMemberHiddenRequest{IsHidden: true})
	requireClientResponse(t, "hide policy member", err, updatedMember.StatusCode(), http.StatusOK, updatedMember.Body)
	memberQuery := "Search Policy Member"
	members, err := client.REST().SearchMembersWithResponse(ctx, &httpclient.SearchMembersParams{
		Context: httpclient.SearchMembersParamsContextNavigation, Limit: 20, Q: &memberQuery,
	})
	requireClientResponse(t, "search visible policy members", err, members.StatusCode(), http.StatusOK, members.Body)
	assertSearchIDs(t, "visible policy members", memberSearchLeafIDs(members.JSON200.Items), []int64{memberVisible.MemberId})
	memberExcluded := []int64{memberVisible.MemberId}
	members, err = client.REST().SearchMembersWithResponse(ctx, &httpclient.SearchMembersParams{
		Context: httpclient.SearchMembersParamsContextNavigation, Limit: 20, Q: &memberQuery, IncludeHidden: &hidden, ExcludeIds: &memberExcluded,
	})
	requireClientResponse(t, "search hidden policy members", err, members.StatusCode(), http.StatusOK, members.Body)
	assertSearchIDs(t, "hidden policy members", memberSearchLeafIDs(members.JSON200.Items), []int64{memberHidden.MemberId})
}

func testLongEntitySearchInputs(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	fqn := strings.Repeat("x", 4091)
	created := client.Scenario().Category(fqn)

	listed, err := client.REST().ListCategoriesWithResponse(ctx, &httpclient.ListCategoriesParams{Q: &fqn})
	requireClientResponse(t, "list category by long FQN", err, listed.StatusCode(), http.StatusOK, listed.Body)
	if len(listed.JSON200.Categories) != 1 || listed.JSON200.Categories[0].CategoryId != created.CategoryId {
		t.Fatalf("long-FQN category list = %+v, want category %d", listed.JSON200.Categories, created.CategoryId)
	}

	searched, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextNavigation, Limit: 1, Q: &fqn,
	})
	requireClientResponse(t, "search category by long FQN", err, searched.StatusCode(), http.StatusOK, searched.Body)
	if len(searched.JSON200.Items) != 1 || searched.JSON200.Items[0].CategoryId == nil || *searched.JSON200.Items[0].CategoryId != created.CategoryId {
		t.Fatalf("long-FQN category search = %+v, want category %d", searched.JSON200.Items, created.CategoryId)
	}

	availability, err := client.REST().GetCategoryCreationAvailabilityWithResponse(ctx, &httpclient.GetCategoryCreationAvailabilityParams{Fqn: fqn})
	requireClientResponse(t, "check long FQN availability", err, availability.StatusCode(), http.StatusOK, availability.Body)
	if availability.JSON200.Available || availability.JSON200.Reason == nil || *availability.JSON200.Reason != httpclient.PathConflict {
		t.Fatalf("long-FQN category availability = %+v, want path conflict", availability.JSON200)
	}
}

func testRankedHierarchySearch(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	create := func(fqn, title string, hidden bool) int64 {
		t.Helper()
		response, err := client.REST().CreateCategoryWithResponse(ctx, httpclient.CreateCategoryRequest{
			Fqn: fqn, DisplayLabel: &title, EconomicIntent: httpclient.CategoryEconomicIntentExpense, IsHidden: &hidden,
		})
		requireClientResponse(t, "create search category", err, response.StatusCode(), http.StatusCreated, response.Body)
		return response.JSON201.CategoryId
	}

	first := create("search-rank:a-exact", "abcdefghi", false)
	second := create("search-rank:b-exact", "abcdefghi", false)
	create("search-rank:a-prefix", "abcdefghijk", false)
	create("search-rank:substring", "xxabcdefghixx", false)
	create("search-rank:one-edit", "abcdefghx", false)
	create("search-rank:two-edits", "abcdefgxx", false)
	create("search-rank:three-edits", "abcdefxxx", false)
	create("search-rank:four-edits", "abcdexxxx", false)
	create("search-rank:subsequence", "a1b2c3d4e5f6g7h8i", false)

	query := "  AbCdEfGhI  "
	response, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextRecordAssignment, Limit: 20, Q: &query,
	})
	requireClientResponse(t, "rank categories", err, response.StatusCode(), http.StatusOK, response.Body)
	got := categorySearchFQNs(response.JSON200.Items)
	want := []string{
		"search-rank:a-exact",
		"search-rank:b-exact",
		"search-rank:a-prefix",
		"search-rank:substring",
		"search-rank:one-edit",
		"search-rank:two-edits",
		"search-rank:three-edits",
		"search-rank:subsequence",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ranked category FQNs = %v, want %v", got, want)
	}

	create("search-group-rank:A-exact", "Bank", false)
	create("search-group-rank:Bank:checking", "Z ancestor candidate", false)
	create("search-group-rank:Banking", "A prefix candidate", false)
	create("search-group-rank:other:Bank", "Z exact leaf", false)
	groupQuery := "  bAnK  "
	groupRanked, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextNavigation, Limit: 20, Q: &groupQuery,
	})
	requireClientResponse(t, "rank exact category group", err, groupRanked.StatusCode(), http.StatusOK, groupRanked.Body)
	groupRankedFQNs := make([]string, 0, len(groupRanked.JSON200.Items))
	for _, item := range groupRanked.JSON200.Items {
		groupRankedFQNs = append(groupRankedFQNs, item.Fqn)
	}
	wantGroupRankedFQNs := []string{
		"search-group-rank:A-exact",
		"search-group-rank:Bank",
		"search-group-rank:other:Bank",
		"search-group-rank:Bank:checking",
		"search-group-rank:Banking",
	}
	if !reflect.DeepEqual(groupRankedFQNs, wantGroupRankedFQNs) {
		t.Fatalf("exact-group category FQNs = %v, want %v", groupRankedFQNs, wantGroupRankedFQNs)
	}
	if groupRanked.JSON200.Items[1].Kind != httpclient.CategorySearchItemKindGroup || groupRanked.JSON200.Items[1].CategoryId != nil {
		t.Fatalf("exact category group = %+v, want navigation-only group", groupRanked.JSON200.Items[1])
	}
	create("search-group-rank:full-fqn-competitor", "search-group-rank:Bank", false)
	fullGroupQuery := "  SEARCH-GROUP-RANK:BANK  "
	fullGroupRanked, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextNavigation, Limit: 20, Q: &fullGroupQuery,
	})
	requireClientResponse(t, "rank exact category group FQN", err, fullGroupRanked.StatusCode(), http.StatusOK, fullGroupRanked.Body)
	if len(fullGroupRanked.JSON200.Items) < 2 || fullGroupRanked.JSON200.Items[0].Kind != httpclient.CategorySearchItemKindGroup || fullGroupRanked.JSON200.Items[0].Fqn != "search-group-rank:Bank" || fullGroupRanked.JSON200.Items[1].Fqn != "search-group-rank:full-fqn-competitor" {
		t.Fatalf("exact-FQN category group results = %+v, want navigation group before exact-title leaf", fullGroupRanked.JSON200.Items)
	}

	limited, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextRecordAssignment, Limit: 1, Q: &query,
	})
	requireClientResponse(t, "limit categories", err, limited.StatusCode(), http.StatusOK, limited.Body)
	if !limited.JSON200.HasMore || len(limited.JSON200.Items) != 1 || *limited.JSON200.Items[0].CategoryId != first {
		t.Fatalf("limited categories = %+v, want first leaf and has_more", limited.JSON200)
	}

	excluded := []int64{first}
	excluding, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextRecordAssignment, Limit: 1, Q: &query, ExcludeIds: &excluded,
	})
	requireClientResponse(t, "exclude category", err, excluding.StatusCode(), http.StatusOK, excluding.Body)
	if len(excluding.JSON200.Items) != 1 || *excluding.JSON200.Items[0].CategoryId != second {
		t.Fatalf("excluded category results = %+v, want category %d", excluding.JSON200.Items, second)
	}

	exactFQNID := create("search-exact-fqn", "not the query", false)
	for index := range 4 {
		create("search-exact-crowd:"+string(rune('a'+index)), "search-exact-fqn", false)
	}
	exactQuery := "search-exact-fqn"
	exact, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextRecordAssignment, Limit: 1, Q: &exactQuery,
	})
	requireClientResponse(t, "retain exact FQN", err, exact.StatusCode(), http.StatusOK, exact.Body)
	if len(exact.JSON200.Items) != 1 || exact.JSON200.Items[0].CategoryId == nil || *exact.JSON200.Items[0].CategoryId != exactFQNID {
		t.Fatalf("exact-FQN results = %+v, want category %d", exact.JSON200.Items, exactFQNID)
	}

	childID := create("search-tree:branch:leaf", "unrelated", false)
	hiddenID := create("search-tree:branch:hidden", "hidden leaf", true)
	parent := "search-tree"
	browse, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextNavigation, Limit: 20, ParentFqn: &parent,
	})
	requireClientResponse(t, "browse category group", err, browse.StatusCode(), http.StatusOK, browse.Body)
	if len(browse.JSON200.Items) != 1 || browse.JSON200.Items[0].Kind != httpclient.CategorySearchItemKindGroup || browse.JSON200.Items[0].Fqn != "search-tree:branch" {
		t.Fatalf("category group results = %+v, want search-tree:branch", browse.JSON200.Items)
	}
	branch := "search-tree:branch"
	children, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextNavigation, Limit: 20, ParentFqn: &branch,
	})
	requireClientResponse(t, "browse category leaves", err, children.StatusCode(), http.StatusOK, children.Body)
	assertSearchIDs(t, "visible category children", categorySearchLeafIDs(children.JSON200.Items), []int64{childID})
	includeHidden := true
	children, err = client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextNavigation, Limit: 20, ParentFqn: &branch, IncludeHidden: &includeHidden,
	})
	requireClientResponse(t, "include hidden category", err, children.StatusCode(), http.StatusOK, children.Body)
	assertContainsSearchID(t, "hidden category child", categorySearchLeafIDs(children.JSON200.Items), hiddenID)
}

func testAccountExactGroupRanking(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	client.Scenario().AccountWithDisplayLabel("search-account-group:Bank:checking", "A fuzzy account", httpclient.WritableAccountTypeOwned)

	query := "bank"
	response, err := client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextNavigation, Limit: 20, Q: &query,
	})
	requireClientResponse(t, "rank exact account group", err, response.StatusCode(), http.StatusOK, response.Body)
	if len(response.JSON200.Items) < 2 || response.JSON200.Items[0].Kind != httpclient.AccountSearchItemKindGroup || response.JSON200.Items[0].Fqn != "search-account-group:Bank" || response.JSON200.Items[1].Fqn != "search-account-group:Bank:checking" {
		t.Fatalf("exact-group account results = %+v, want navigation group before fuzzy leaf", response.JSON200.Items)
	}
}

func testTagExactGroupRanking(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	create := func(fqn, title string) {
		t.Helper()
		response, err := client.REST().CreateTagWithResponse(ctx, httpclient.CreateTagRequest{Fqn: fqn, DisplayLabel: &title})
		requireClientResponse(t, "create tag search candidate", err, response.StatusCode(), http.StatusCreated, response.Body)
	}
	create("search-tag-group:A-exact", "Bank")
	create("search-tag-group:Bank:checking", "A fuzzy tag")

	query := "  BANK  "
	response, err := client.REST().SearchTagsWithResponse(ctx, &httpclient.SearchTagsParams{
		Context: httpclient.SearchTagsParamsContextNavigation, Limit: 20, Q: &query,
	})
	requireClientResponse(t, "rank exact tag group", err, response.StatusCode(), http.StatusOK, response.Body)
	if len(response.JSON200.Items) < 3 || response.JSON200.Items[0].Fqn != "search-tag-group:A-exact" || response.JSON200.Items[1].Kind != httpclient.TagSearchItemKindGroup || response.JSON200.Items[1].TagId != nil || response.JSON200.Items[1].Fqn != "search-tag-group:Bank" || response.JSON200.Items[2].Fqn != "search-tag-group:Bank:checking" {
		t.Fatalf("exact-group tag results = %+v, want exact leaf then navigation group before fuzzy leaf", response.JSON200.Items)
	}
}

func testEntitySearchContextsAndVisibility(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	scenario := client.Scenario()
	owned := scenario.AccountWithCurrency("search-context:owned", "USD")
	flow := scenario.AccountWithType("search-context:flow", httpclient.WritableAccountTypeFlow)
	expense := scenario.Category("search-context:expense")
	income := scenario.CategoryWithIntent("search-context:income", httpclient.CategoryEconomicIntentIncome)
	tag := scenario.Tag("search-context:tag")
	member := scenario.Member("Search Context Member")

	accountsResponse, err := client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextShorthandBalance, Limit: 500,
	})
	requireClientResponse(t, "search balance accounts", err, accountsResponse.StatusCode(), http.StatusOK, accountsResponse.Body)
	accountIDs := accountSearchLeafIDs(accountsResponse.JSON200.Items)
	assertContainsSearchID(t, "balance account", accountIDs, owned.AccountId)
	if containsSearchID(accountIDs, flow.AccountId) {
		t.Fatalf("balance search IDs = %v, unexpectedly include flow account", accountIDs)
	}

	accountsResponse, err = client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextShorthandFlow, Limit: 500,
	})
	requireClientResponse(t, "search flow accounts", err, accountsResponse.StatusCode(), http.StatusOK, accountsResponse.Body)
	assertContainsSearchID(t, "flow account", accountSearchLeafIDs(accountsResponse.JSON200.Items), flow.AccountId)

	excludedCurrency := "USD"
	accountsResponse, err = client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextExchange, Limit: 500, ExcludedCurrency: &excludedCurrency,
	})
	requireClientResponse(t, "search exchange accounts", err, accountsResponse.StatusCode(), http.StatusOK, accountsResponse.Body)
	if containsSearchID(accountSearchLeafIDs(accountsResponse.JSON200.Items), owned.AccountId) {
		t.Fatalf("exchange search unexpectedly includes excluded-currency account %d", owned.AccountId)
	}

	expenses, err := client.REST().SearchCategoriesWithResponse(ctx, &httpclient.SearchCategoriesParams{
		Context: httpclient.SearchCategoriesParamsContextShorthandExpense, Limit: 500,
	})
	requireClientResponse(t, "search expense categories", err, expenses.StatusCode(), http.StatusOK, expenses.Body)
	categoryIDs := categorySearchLeafIDs(expenses.JSON200.Items)
	assertContainsSearchID(t, "expense category", categoryIDs, expense.CategoryId)
	if containsSearchID(categoryIDs, income.CategoryId) {
		t.Fatalf("expense search IDs = %v, unexpectedly include income category", categoryIDs)
	}

	tagQuery := tag.Fqn
	tagsResponse, err := client.REST().SearchTagsWithResponse(ctx, &httpclient.SearchTagsParams{
		Context: httpclient.SearchTagsParamsContextTransactionFilter, Limit: 20, Q: &tagQuery,
	})
	requireClientResponse(t, "search transaction-filter tags", err, tagsResponse.StatusCode(), http.StatusOK, tagsResponse.Body)
	assertSearchIDs(t, "transaction-filter tag", tagSearchLeafIDs(tagsResponse.JSON200.Items), []int64{tag.TagId})

	memberQuery := member.Name
	membersResponse, err := client.REST().SearchMembersWithResponse(ctx, &httpclient.SearchMembersParams{
		Context: httpclient.SearchMembersParamsContextNavigation, Limit: 20, Q: &memberQuery,
	})
	requireClientResponse(t, "search members", err, membersResponse.StatusCode(), http.StatusOK, membersResponse.Body)
	if len(membersResponse.JSON200.Items) != 1 || membersResponse.JSON200.Items[0].MemberId != member.MemberId {
		t.Fatalf("member search items = %+v, want member %d", membersResponse.JSON200.Items, member.MemberId)
	}
}

func testBulkAccountSearchFacts(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	scenario := client.Scenario()
	source := scenario.AccountWithCurrency("search-bulk:source", "USD")
	destinationOne := scenario.AccountWithCurrency("search-bulk:destination-one", "USD")
	destinationTwo := scenario.AccountWithCurrency("search-bulk:destination-two", "USD")
	replacement := scenario.AccountWithCurrency("search-bulk:replacement", "USD")
	wrongCurrency := scenario.AccountWithCurrency("search-bulk:wrong-currency", "EUR")
	wrongType := scenario.AccountWithType("search-bulk:flow", httpclient.WritableAccountTypeFlow)
	createTransfer := func(destinationID int64, date string) int64 {
		t.Helper()
		response, err := client.REST().CreateTransferTransactionWithResponse(ctx, httpclient.CreateTransferTransactionRequest{
			Amount: "1.00", Currency: "USD", DestinationAccountId: destinationID, InitiatedDate: apptest.Date(date), SourceAccountId: source.AccountId,
		})
		requireClientResponse(t, "create bulk search transfer", err, response.StatusCode(), http.StatusCreated, response.Body)
		return response.JSON201.TransactionId
	}
	transactionIDs := []int64{createTransfer(destinationOne.AccountId, "2026-02-01"), createTransfer(destinationTwo.AccountId, "2026-02-02")}

	sources, err := client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextBulkSource, Limit: 20, TransactionIds: &transactionIDs,
	})
	requireClientResponse(t, "search bulk source", err, sources.StatusCode(), http.StatusOK, sources.Body)
	assertSearchIDs(t, "bulk source", accountSearchLeafIDs(sources.JSON200.Items), []int64{source.AccountId})

	replacements, err := client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextBulkReplacement, Limit: 500, TransactionIds: &transactionIDs, SourceAccountId: &source.AccountId,
	})
	requireClientResponse(t, "search bulk replacement", err, replacements.StatusCode(), http.StatusOK, replacements.Body)
	ids := accountSearchLeafIDs(replacements.JSON200.Items)
	assertContainsSearchID(t, "compatible replacement", ids, replacement.AccountId)
	for _, excluded := range []int64{source.AccountId, wrongCurrency.AccountId, wrongType.AccountId} {
		if containsSearchID(ids, excluded) {
			t.Fatalf("bulk replacement IDs = %v, unexpectedly include %d", ids, excluded)
		}
	}
}

func testEntityCreationAvailability(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	scenario := client.Scenario()
	existing := scenario.Account("search-availability:existing")

	assertAccountAvailability := func(fqn string, available bool, reason *httpclient.AccountCreationAvailabilityResponseReason) {
		t.Helper()
		response, err := client.REST().GetAccountCreationAvailabilityWithResponse(ctx, &httpclient.GetAccountCreationAvailabilityParams{Fqn: fqn})
		requireClientResponse(t, "get account creation availability", err, response.StatusCode(), http.StatusOK, response.Body)
		if response.JSON200.Available != available || !reflect.DeepEqual(response.JSON200.Reason, reason) {
			t.Fatalf("account availability for %q = %+v, want available=%t reason=%v", fqn, response.JSON200, available, reason)
		}
	}
	accountInvalid := httpclient.AccountInvalidFQN
	accountConflict := httpclient.AccountPathConflict
	reserved := httpclient.AccountReservedNamespace
	assertAccountAvailability("search-availability:new", true, nil)
	assertAccountAvailability("bad::fqn", false, &accountInvalid)
	assertAccountAvailability(existing.Fqn+":child", false, &accountConflict)
	assertAccountAvailability("system:search-availability", false, &reserved)

	validCreate, err := client.REST().CreateAccountWithResponse(ctx, httpclient.CreateAccountRequest{
		Fqn: "search-availability:new", AccountType: httpclient.WritableAccountTypeOwned,
	})
	requireClientResponse(t, "create available account", err, validCreate.StatusCode(), http.StatusCreated, validCreate.Body)
	for label, candidate := range map[string]struct {
		fqn    string
		status int
	}{
		"invalid":     {fqn: "bad::fqn", status: http.StatusBadRequest},
		"conflicting": {fqn: existing.Fqn + ":child", status: http.StatusConflict},
		"reserved":    {fqn: "system:search-availability", status: http.StatusBadRequest},
	} {
		response, createErr := client.REST().CreateAccountWithResponse(ctx, httpclient.CreateAccountRequest{
			Fqn: candidate.fqn, AccountType: httpclient.WritableAccountTypeOwned,
		})
		requireClientResponse(t, "reject "+label+" account", createErr, response.StatusCode(), candidate.status, response.Body)
	}

	existingCategory := scenario.Category("search-availability:existing-category")
	existingTag := scenario.Tag("search-availability:existing-tag")
	invalid := httpclient.InvalidFqn
	conflict := httpclient.PathConflict
	for _, candidate := range []struct {
		conflictFQN string
		name        string
		get         func(string) (*httpclient.CreationAvailabilityResponse, int, error)
	}{
		{name: "category", conflictFQN: existingCategory.Fqn + ":child", get: func(fqn string) (*httpclient.CreationAvailabilityResponse, int, error) {
			response, getErr := client.REST().GetCategoryCreationAvailabilityWithResponse(ctx, &httpclient.GetCategoryCreationAvailabilityParams{Fqn: fqn})
			return response.JSON200, response.StatusCode(), getErr
		}},
		{name: "tag", conflictFQN: existingTag.Fqn + ":child", get: func(fqn string) (*httpclient.CreationAvailabilityResponse, int, error) {
			response, getErr := client.REST().GetTagCreationAvailabilityWithResponse(ctx, &httpclient.GetTagCreationAvailabilityParams{Fqn: fqn})
			return response.JSON200, response.StatusCode(), getErr
		}},
	} {
		for label, expectation := range map[string]struct {
			available bool
			fqn       string
			reason    *httpclient.CreationAvailabilityResponseReason
		}{
			"available": {available: true, fqn: "search-availability:" + candidate.name},
			"conflict":  {fqn: candidate.conflictFQN, reason: &conflict},
			"invalid":   {fqn: "bad::fqn", reason: &invalid},
		} {
			availability, status, getErr := candidate.get(expectation.fqn)
			if getErr != nil || status != http.StatusOK || availability == nil || availability.Available != expectation.available || !reflect.DeepEqual(availability.Reason, expectation.reason) {
				t.Fatalf("%s %s creation availability = %+v status=%d err=%v", candidate.name, label, availability, status, getErr)
			}
		}
	}
}

func testEntitySearchErrors(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	invalidContext := httpclient.SearchTagsParamsContext("invalid")
	invalid, err := client.REST().SearchTagsWithResponse(ctx, &httpclient.SearchTagsParams{Context: invalidContext, Limit: 8})
	requireClientResponse(t, "invalid tag search context", err, invalid.StatusCode(), http.StatusBadRequest, invalid.Body)
	assertSearchInvalidRequest(t, "invalid tag search context", invalid.JSON400, invalid.Body)

	invalidLimit, err := client.REST().SearchMembersWithResponse(ctx, &httpclient.SearchMembersParams{
		Context: httpclient.SearchMembersParamsContextNavigation, Limit: 501,
	})
	requireClientResponse(t, "invalid member search limit", err, invalidLimit.StatusCode(), http.StatusBadRequest, invalidLimit.Body)
	assertSearchInvalidRequest(t, "invalid member search limit", invalidLimit.JSON400, invalidLimit.Body)

	bulkWithoutTransactions, err := client.REST().SearchAccountsWithResponse(ctx, &httpclient.SearchAccountsParams{
		Context: httpclient.SearchAccountsParamsContextBulkSource, Limit: 8,
	})
	requireClientResponse(t, "bulk source without transactions", err, bulkWithoutTransactions.StatusCode(), http.StatusBadRequest, bulkWithoutTransactions.Body)
	assertSearchInvalidRequest(t, "bulk source without transactions", bulkWithoutTransactions.JSON400, bulkWithoutTransactions.Body)
}

func accountSearchLeafIDs(items []httpclient.AccountSearchItem) []int64 {
	ids := []int64{}
	for _, item := range items {
		if item.Kind == httpclient.AccountSearchItemKindLeaf && item.AccountId != nil {
			ids = append(ids, *item.AccountId)
		}
	}
	return ids
}

func categorySearchLeafIDs(items []httpclient.CategorySearchItem) []int64 {
	ids := []int64{}
	for _, item := range items {
		if item.Kind == httpclient.CategorySearchItemKindLeaf && item.CategoryId != nil {
			ids = append(ids, *item.CategoryId)
		}
	}
	return ids
}

func categorySearchFQNs(items []httpclient.CategorySearchItem) []string {
	fqns := make([]string, 0, len(items))
	for _, item := range items {
		if item.Kind == httpclient.CategorySearchItemKindLeaf {
			fqns = append(fqns, item.Fqn)
		}
	}
	return fqns
}

func tagSearchLeafIDs(items []httpclient.TagSearchItem) []int64 {
	ids := []int64{}
	for _, item := range items {
		if item.Kind == httpclient.TagSearchItemKindLeaf && item.TagId != nil {
			ids = append(ids, *item.TagId)
		}
	}
	return ids
}

func memberSearchLeafIDs(items []httpclient.MemberSearchItem) []int64 {
	ids := []int64{}
	for _, item := range items {
		ids = append(ids, item.MemberId)
	}
	return ids
}

func assertSearchInvalidRequest(t *testing.T, label string, response *httpclient.ErrorResponse, body []byte) {
	t.Helper()
	if response == nil || response.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("%s error = %+v, want invalid_request; body %s", label, response, body)
	}
}

func assertSearchIDs(t *testing.T, label string, got, want []int64) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s IDs = %v, want %v", label, got, want)
	}
}

func assertContainsSearchID(t *testing.T, label string, values []int64, want int64) {
	t.Helper()
	if !containsSearchID(values, want) {
		t.Fatalf("%s IDs = %v, want %d", label, values, want)
	}
}

func containsSearchID(values []int64, want int64) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
