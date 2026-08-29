package runtime_test

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestEntityPickerAPIBoundaries(t *testing.T) {
	t.Run("category ranking and hierarchy", testCategoryPickerRankingAndHierarchy)
	t.Run("entity contexts and hidden selections", testEntityPickerContextsAndHiddenSelections)
	t.Run("bulk account contexts", testBulkAccountPickerContexts)
	t.Run("standard errors", testEntityPickerErrors)
}

func testCategoryPickerRankingAndHierarchy(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	create := func(fqn string, label string) int64 {
		t.Helper()
		response, err := client.REST().CreateCategoryWithResponse(ctx, httpclient.CreateCategoryRequest{
			Fqn: fqn, DisplayLabel: &label, EconomicIntent: httpclient.CategoryEconomicIntentExpense,
		})
		requireClientResponse(t, "create ranked category", err, response.StatusCode(), http.StatusCreated, response.Body)
		return response.JSON201.CategoryId
	}

	create("rank:a-exact", "alpha")
	create("rank:b-exact", "alpha")
	create("rank:a-prefix", "alphabet")
	create("rank:b-prefix", "alphabet")
	create("rank:substring", "xxalphaxx")
	create("rank:one-edit", "alphx")
	create("rank:two-edits", "alpzz")
	create("rank:subsequence", "a1l2p3h4a")
	shortOneEditID := create("adaptive-short:a", "wxyq")
	create("adaptive-short:b", "wxqq")
	create("adaptive-long:a", "abcdefghx")
	create("adaptive-long:b", "abcdefgxx")
	create("adaptive-long:c", "abcdefxxx")
	create("adaptive-long:d", "abcdexxxx")
	create("adaptive-long:e", "a0b0c0d0e0f0g0h0i")
	orderedTokenID := create("ordered-token:Childcare:Nanny", "Caregiver")
	create("tree:branch:leaf", "Unrelated")
	groceriesID := create("level:food:gro-2024", "Groceries")
	longFQN := "long:" + strings.Repeat("picker-segment", 20)
	longFQNID := create(longFQN, "Long exact picker path")
	exactFQNID := create("leaf", "leaf")
	for index := range 20 {
		create(fmt.Sprintf("exact-fqn-crowd:%02d:leaf", index), "leaf")
	}
	for index := range 21 {
		create("bounded:item:"+string(rune('A'+index)), "Bounded")
	}

	query := "  AlPhA  "
	response, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment,
		Q:       &query,
	})
	requireClientResponse(t, "rank categories", err, response.StatusCode(), http.StatusOK, response.Body)
	gotTitles := make([]string, 0, len(response.JSON200.Items))
	gotFQNs := make([]string, 0, len(response.JSON200.Items))
	for _, item := range response.JSON200.Items {
		if item.Kind != httpclient.CategoryPickerItemKindLeaf {
			continue
		}
		gotTitles = append(gotTitles, item.Title)
		gotFQNs = append(gotFQNs, item.Fqn)
	}
	wantTitles := []string{"alpha", "alpha", "alphabet", "alphabet", "xxalphaxx", "alphx", "alpzz", "a1l2p3h4a"}
	if !reflect.DeepEqual(gotTitles, wantTitles) {
		t.Fatalf("ranked titles = %v, want %v", gotTitles, wantTitles)
	}
	wantFQNs := []string{"rank:a-exact", "rank:b-exact", "rank:a-prefix", "rank:b-prefix", "rank:substring", "rank:one-edit", "rank:two-edits", "rank:subsequence"}
	if !reflect.DeepEqual(gotFQNs, wantFQNs) {
		t.Fatalf("ranked FQNs = %v, want %v", gotFQNs, wantFQNs)
	}

	shortQuery := "wxyz"
	shortResponse, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment,
		Q:       &shortQuery,
	})
	requireClientResponse(t, "rank short-query typo tolerance", err, shortResponse.StatusCode(), http.StatusOK, shortResponse.Body)
	assertPickerLeafIDs(t, "short-query typo tolerance", categoryPickerLeafIDs(shortResponse.JSON200.Items), []int64{shortOneEditID})

	longQuery := "abcdefghi"
	longResponse, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment,
		Q:       &longQuery,
	})
	requireClientResponse(t, "rank long-query typo tolerance", err, longResponse.StatusCode(), http.StatusOK, longResponse.Body)
	longFQNs := make([]string, 0, len(longResponse.JSON200.Items))
	for _, item := range longResponse.JSON200.Items {
		if item.Kind == httpclient.CategoryPickerItemKindLeaf {
			longFQNs = append(longFQNs, item.Fqn)
		}
	}
	wantLongFQNs := []string{"adaptive-long:a", "adaptive-long:b", "adaptive-long:c", "adaptive-long:e"}
	if !reflect.DeepEqual(longFQNs, wantLongFQNs) {
		t.Fatalf("long-query ranked FQNs = %v, want %v", longFQNs, wantLongFQNs)
	}

	orderedQuery := "chi nan"
	orderedResponse, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment,
		Q:       &orderedQuery,
	})
	requireClientResponse(t, "rank ordered FQN terms", err, orderedResponse.StatusCode(), http.StatusOK, orderedResponse.Body)
	assertContainsPickerID(t, "ordered FQN terms", categoryPickerLeafIDs(orderedResponse.JSON200.Items), orderedTokenID)

	reversedQuery := "nan chi"
	reversedResponse, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment,
		Q:       &reversedQuery,
	})
	requireClientResponse(t, "reject reversed FQN terms", err, reversedResponse.StatusCode(), http.StatusOK, reversedResponse.Body)
	if containsPickerID(categoryPickerLeafIDs(reversedResponse.JSON200.Items), orderedTokenID) {
		t.Fatalf("reversed FQN terms unexpectedly include category %d", orderedTokenID)
	}

	longExact, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment,
		Q:       &longFQN,
	})
	requireClientResponse(t, "pick category by long exact FQN", err, longExact.StatusCode(), http.StatusOK, longExact.Body)
	assertPickerLeafIDs(t, "long exact FQN", categoryPickerLeafIDs(longExact.JSON200.Items), []int64{longFQNID})

	exactFQNQuery := "leaf"
	exactFQN, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment,
		Q:       &exactFQNQuery,
	})
	requireClientResponse(t, "pick category from crowded exact tier", err, exactFQN.StatusCode(), http.StatusOK, exactFQN.Body)
	assertContainsPickerID(t, "crowded exact FQN", categoryPickerLeafIDs(exactFQN.JSON200.Items), exactFQNID)

	segmentQuery := "one-edit"
	segment, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment,
		Q:       &segmentQuery,
	})
	requireClientResponse(t, "rank category FQN segment", err, segment.StatusCode(), http.StatusOK, segment.Body)
	if len(segment.JSON200.Items) == 0 || segment.JSON200.Items[0].Fqn != "rank:one-edit" {
		t.Fatalf("segment-ranked first item = %+v, want rank:one-edit", segment.JSON200.Items)
	}

	parent := "tree"
	group, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context:   httpclient.PickCategoriesParamsContextRecordAssignment,
		ParentFqn: &parent,
	})
	requireClientResponse(t, "browse category group", err, group.StatusCode(), http.StatusOK, group.Body)
	if len(group.JSON200.Items) != 1 || group.JSON200.Items[0].Kind != httpclient.CategoryPickerItemKindGroup || group.JSON200.Items[0].Fqn != "tree:branch" || group.JSON200.Items[0].CategoryId != nil {
		t.Fatalf("category group rows = %+v, want one navigation-only tree:branch group", group.JSON200.Items)
	}
	foodParent := "level:food"
	foodQuery := "level:food:Groc"
	food, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment, ParentFqn: &foodParent, Q: &foodQuery,
	})
	requireClientResponse(t, "browse categories by display title", err, food.StatusCode(), http.StatusOK, food.Body)
	assertPickerLeafIDs(t, "level display-title match", categoryPickerLeafIDs(food.JSON200.Items), []int64{groceriesID})
	all, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{Context: httpclient.PickCategoriesParamsContextRecordAssignment})
	requireClientResponse(t, "bounded categories", err, all.StatusCode(), http.StatusOK, all.Body)
	if len(all.JSON200.Items) != 20 {
		t.Fatalf("bounded category item count = %d, want 20", len(all.JSON200.Items))
	}
	selectedBounded, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment, SelectedIds: &[]int64{exactFQNID},
	})
	requireClientResponse(t, "bounded categories with selection", err, selectedBounded.StatusCode(), http.StatusOK, selectedBounded.Body)
	if len(selectedBounded.JSON200.Items) != 20 || containsPickerID(categoryPickerLeafIDs(selectedBounded.JSON200.Items), exactFQNID) {
		t.Fatalf("bounded selected category items = %+v, want 20 unselected rows", selectedBounded.JSON200.Items)
	}
	assertPickerLeafIDs(t, "bounded category selected items", categoryPickerLeafIDs(selectedBounded.JSON200.SelectedItems), []int64{exactFQNID})
	creatable := "new:picker:category"
	creation, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{Context: httpclient.PickCategoriesParamsContextShorthandExpense, Q: &creatable})
	requireClientResponse(t, "category creation eligibility", err, creation.StatusCode(), http.StatusOK, creation.Body)
	if !creation.JSON200.CanCreate {
		t.Fatal("new category can_create = false, want true")
	}
	collision := "rank:a-exact"
	colliding, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment, Q: &collision,
	})
	requireClientResponse(t, "category creation collision", err, colliding.StatusCode(), http.StatusOK, colliding.Body)
	if colliding.JSON200.CanCreate {
		t.Fatal("conflicting category can_create = true, want false")
	}
	prohibited, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{
		Context: httpclient.PickTagsParamsContextTransactionFilter, Q: &creatable,
	})
	requireClientResponse(t, "prohibited tag creation context", err, prohibited.StatusCode(), http.StatusOK, prohibited.Body)
	if prohibited.JSON200.CanCreate {
		t.Fatal("transaction-filter tag can_create = true, want false")
	}
	tagCreatable := "new:picker:tag"
	tagCreation, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{
		Context: httpclient.PickTagsParamsContextRecordAssignment, Q: &tagCreatable,
	})
	requireClientResponse(t, "tag creation eligibility", err, tagCreation.StatusCode(), http.StatusOK, tagCreation.Body)
	if !tagCreation.JSON200.CanCreate {
		t.Fatal("new tag can_create = false, want true")
	}
	accountCreatable := "new:picker:flow"
	accountCreation, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context: httpclient.PickAccountsParamsContextShorthandFlow, Q: &accountCreatable,
	})
	requireClientResponse(t, "account creation eligibility", err, accountCreation.StatusCode(), http.StatusOK, accountCreation.Body)
	if !accountCreation.JSON200.CanCreate {
		t.Fatal("new flow account can_create = false, want true")
	}
	systemPath := "system:picker"
	system, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context: httpclient.PickAccountsParamsContextShorthandFlow, Q: &systemPath,
	})
	requireClientResponse(t, "system account creation path", err, system.StatusCode(), http.StatusOK, system.Body)
	if system.JSON200.CanCreate {
		t.Fatal("system account can_create = true, want false")
	}
}

func testEntityPickerContextsAndHiddenSelections(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	scenario := client.Scenario()

	usd := "USD"
	eur := "EUR"
	hidden := true
	balanceUSD := scenario.AccountWithCurrency("picker:balance:usd", usd)
	balanceEUR := scenario.AccountWithCurrency("picker:balance:eur", eur)
	flow := scenario.AccountWithType("picker:flow:merchant", httpclient.WritableAccountTypeFlow)
	hiddenAccountTitle := "Hidden balance"
	hiddenAccountResponse, err := client.REST().CreateAccountWithResponse(ctx, httpclient.CreateAccountRequest{
		Fqn: "picker:hidden:balance", DisplayLabel: &hiddenAccountTitle, AccountType: httpclient.WritableAccountTypeOwned, IsHidden: &hidden,
	})
	requireClientResponse(t, "create hidden account", err, hiddenAccountResponse.StatusCode(), http.StatusCreated, hiddenAccountResponse.Body)
	hiddenAccount := hiddenAccountResponse.JSON201
	hiddenAccountQuery := hiddenAccount.Fqn
	hiddenAccountParent := "picker:hidden"
	hiddenAccountPick, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context:   httpclient.PickAccountsParamsContextRecordAssignment,
		ParentFqn: &hiddenAccountParent,
		Q:         &hiddenAccountQuery,
	})
	requireClientResponse(t, "pick hidden account by exact FQN", err, hiddenAccountPick.StatusCode(), http.StatusOK, hiddenAccountPick.Body)
	assertPickerLeafIDs(t, "exact hidden account", accountPickerLeafIDs(hiddenAccountPick.JSON200.Items), []int64{hiddenAccount.AccountId})
	hiddenAccountItem := requireAccountPickerLeaf(t, hiddenAccountPick.JSON200.Items, hiddenAccount.AccountId)
	if hiddenAccountItem.Title != hiddenAccountTitle || !hiddenAccountItem.IsHidden {
		t.Fatalf("hidden account presentation = %+v, want title %q and hidden", hiddenAccountItem, hiddenAccountTitle)
	}
	hiddenAccountSearch := "balance"
	defaultAccountPick, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context: httpclient.PickAccountsParamsContextRecordAssignment, Q: &hiddenAccountSearch,
	})
	requireClientResponse(t, "exclude unselected hidden account", err, defaultAccountPick.StatusCode(), http.StatusOK, defaultAccountPick.Body)
	if containsPickerID(accountPickerLeafIDs(defaultAccountPick.JSON200.Items), hiddenAccount.AccountId) {
		t.Fatalf("default account picker unexpectedly includes hidden account %d", hiddenAccount.AccountId)
	}
	includedHiddenAccount, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context: httpclient.PickAccountsParamsContextRecordAssignment, ParentFqn: &hiddenAccountParent, IncludeHidden: &hidden,
	})
	requireClientResponse(t, "include hidden account", err, includedHiddenAccount.StatusCode(), http.StatusOK, includedHiddenAccount.Body)
	assertContainsPickerID(t, "included hidden account", accountPickerLeafIDs(includedHiddenAccount.JSON200.Items), hiddenAccount.AccountId)

	flowPick, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{Context: httpclient.PickAccountsParamsContextShorthandFlow})
	requireClientResponse(t, "pick flow accounts", err, flowPick.StatusCode(), http.StatusOK, flowPick.Body)
	assertPickerLeafIDs(t, "flow accounts", accountPickerLeafIDs(flowPick.JSON200.Items), []int64{flow.AccountId})
	balancePick, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{Context: httpclient.PickAccountsParamsContextShorthandBalance})
	requireClientResponse(t, "pick balance accounts", err, balancePick.StatusCode(), http.StatusOK, balancePick.Body)
	balanceIDs := accountPickerLeafIDs(balancePick.JSON200.Items)
	assertContainsPickerID(t, "USD balance account", balanceIDs, balanceUSD.AccountId)
	assertContainsPickerID(t, "EUR balance account", balanceIDs, balanceEUR.AccountId)
	balanceUSDItem := requireAccountPickerLeaf(t, balancePick.JSON200.Items, balanceUSD.AccountId)
	if balanceUSDItem.AccountType == nil || *balanceUSDItem.AccountType != httpclient.AccountTypeOwned || balanceUSDItem.Currency == nil || *balanceUSDItem.Currency != usd {
		t.Fatalf("USD balance account metadata = %+v, want owned and USD", balanceUSDItem)
	}
	if containsPickerID(balanceIDs, flow.AccountId) {
		t.Fatalf("balance IDs = %v, unexpectedly include flow account", balanceIDs)
	}

	exchangePick, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context:          httpclient.PickAccountsParamsContextExchange,
		ExcludedCurrency: &usd,
		SelectedIds:      &[]int64{balanceUSD.AccountId, hiddenAccount.AccountId},
	})
	requireClientResponse(t, "pick exchange accounts", err, exchangePick.StatusCode(), http.StatusOK, exchangePick.Body)
	exchangeIDs := accountPickerLeafIDs(exchangePick.JSON200.Items)
	assertPickerLeafIDs(t, "exchange selected items", accountPickerLeafIDs(exchangePick.JSON200.SelectedItems), []int64{balanceUSD.AccountId, hiddenAccount.AccountId})
	if containsPickerID(exchangeIDs, balanceUSD.AccountId) || containsPickerID(exchangeIDs, hiddenAccount.AccountId) {
		t.Fatalf("exchange IDs = %v, unexpectedly duplicate selected accounts", exchangeIDs)
	}
	assertContainsPickerID(t, "exchange includes different currency", exchangeIDs, balanceEUR.AccountId)
	if containsPickerID(exchangeIDs, flow.AccountId) {
		t.Fatalf("exchange IDs = %v, unexpectedly include flow account", exchangeIDs)
	}
	accountParent := "picker"
	accountGroups, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context: httpclient.PickAccountsParamsContextRecordAssignment, ParentFqn: &accountParent, IncludeHidden: &hidden,
	})
	requireClientResponse(t, "browse account groups", err, accountGroups.StatusCode(), http.StatusOK, accountGroups.Body)
	if !accountPickerHasGroup(accountGroups.JSON200.Items, "picker:balance") || !accountPickerHasGroup(accountGroups.JSON200.Items, "picker:flow") {
		t.Fatalf("account groups = %+v, want picker:balance and picker:flow", accountGroups.JSON200.Items)
	}

	expense := scenario.Category("picker:category:expense")
	income := scenario.CategoryWithIntent("picker:category:income", httpclient.CategoryEconomicIntentIncome)
	hiddenCategory := scenario.CategoryWithHidden("picker:category:hidden", true)
	hiddenCategoryQuery := hiddenCategory.Fqn
	hiddenCategoryParent := "picker:category"
	hiddenCategoryPick, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context:   httpclient.PickCategoriesParamsContextRecordAssignment,
		ParentFqn: &hiddenCategoryParent,
		Q:         &hiddenCategoryQuery,
	})
	requireClientResponse(t, "pick hidden category by exact FQN", err, hiddenCategoryPick.StatusCode(), http.StatusOK, hiddenCategoryPick.Body)
	assertPickerLeafIDs(t, "exact hidden category", categoryPickerLeafIDs(hiddenCategoryPick.JSON200.Items), []int64{hiddenCategory.CategoryId})
	hiddenCategorySearch := "hidden"
	defaultCategoryPick, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment, Q: &hiddenCategorySearch,
	})
	requireClientResponse(t, "exclude unselected hidden category", err, defaultCategoryPick.StatusCode(), http.StatusOK, defaultCategoryPick.Body)
	if containsPickerID(categoryPickerLeafIDs(defaultCategoryPick.JSON200.Items), hiddenCategory.CategoryId) {
		t.Fatalf("default category picker unexpectedly includes hidden category %d", hiddenCategory.CategoryId)
	}
	includedHiddenCategory, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextRecordAssignment, ParentFqn: &hiddenCategoryParent, IncludeHidden: &hidden,
	})
	requireClientResponse(t, "include hidden category", err, includedHiddenCategory.StatusCode(), http.StatusOK, includedHiddenCategory.Body)
	assertContainsPickerID(t, "included hidden category", categoryPickerLeafIDs(includedHiddenCategory.JSON200.Items), hiddenCategory.CategoryId)
	expensePick, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context:     httpclient.PickCategoriesParamsContextShorthandExpense,
		SelectedIds: &[]int64{hiddenCategory.CategoryId},
	})
	requireClientResponse(t, "pick expense categories", err, expensePick.StatusCode(), http.StatusOK, expensePick.Body)
	categoryIDs := categoryPickerLeafIDs(expensePick.JSON200.Items)
	assertPickerLeafIDs(t, "category selected items", categoryPickerLeafIDs(expensePick.JSON200.SelectedItems), []int64{hiddenCategory.CategoryId})
	assertContainsPickerID(t, "expense category", categoryIDs, expense.CategoryId)
	if containsPickerID(categoryIDs, hiddenCategory.CategoryId) {
		t.Fatalf("expense category IDs = %v, unexpectedly duplicate selected category", categoryIDs)
	}
	if containsPickerID(categoryIDs, income.CategoryId) {
		t.Fatalf("expense category IDs = %v, unexpectedly include income", categoryIDs)
	}
	incomePick, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextShorthandIncome,
	})
	requireClientResponse(t, "pick income categories", err, incomePick.StatusCode(), http.StatusOK, incomePick.Body)
	incomeIDs := categoryPickerLeafIDs(incomePick.JSON200.Items)
	assertContainsPickerID(t, "income category", incomeIDs, income.CategoryId)
	if containsPickerID(incomeIDs, expense.CategoryId) {
		t.Fatalf("income category IDs = %v, unexpectedly include expense", incomeIDs)
	}

	tag := scenario.Tag("picker:tag:visible")
	hiddenTagTitle := "Hidden picker tag"
	hiddenTagResponse, err := client.REST().CreateTagWithResponse(ctx, httpclient.CreateTagRequest{Fqn: "picker:tag:hidden", DisplayLabel: &hiddenTagTitle, IsHidden: &hidden})
	requireClientResponse(t, "create hidden tag", err, hiddenTagResponse.StatusCode(), http.StatusCreated, hiddenTagResponse.Body)
	hiddenTagQuery := hiddenTagResponse.JSON201.Fqn
	hiddenTagParent := "picker:tag"
	hiddenTagPick, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{
		Context:   httpclient.PickTagsParamsContextRecordAssignment,
		ParentFqn: &hiddenTagParent,
		Q:         &hiddenTagQuery,
	})
	requireClientResponse(t, "pick hidden tag by exact FQN", err, hiddenTagPick.StatusCode(), http.StatusOK, hiddenTagPick.Body)
	assertPickerLeafIDs(t, "exact hidden tag", tagPickerLeafIDs(hiddenTagPick.JSON200.Items), []int64{hiddenTagResponse.JSON201.TagId})
	hiddenTagItem := requireTagPickerLeaf(t, hiddenTagPick.JSON200.Items, hiddenTagResponse.JSON201.TagId)
	if hiddenTagItem.Title != hiddenTagTitle || !hiddenTagItem.IsHidden {
		t.Fatalf("hidden tag presentation = %+v, want title %q and hidden", hiddenTagItem, hiddenTagTitle)
	}
	hiddenTagSearch := "hidden"
	defaultTagPick, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{
		Context: httpclient.PickTagsParamsContextRecordAssignment, Q: &hiddenTagSearch,
	})
	requireClientResponse(t, "exclude unselected hidden tag", err, defaultTagPick.StatusCode(), http.StatusOK, defaultTagPick.Body)
	if containsPickerID(tagPickerLeafIDs(defaultTagPick.JSON200.Items), hiddenTagResponse.JSON201.TagId) {
		t.Fatalf("default tag picker unexpectedly includes hidden tag %d", hiddenTagResponse.JSON201.TagId)
	}
	includedHiddenTag, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{
		Context: httpclient.PickTagsParamsContextRecordAssignment, ParentFqn: &hiddenTagParent, IncludeHidden: &hidden,
	})
	requireClientResponse(t, "include hidden tag", err, includedHiddenTag.StatusCode(), http.StatusOK, includedHiddenTag.Body)
	assertContainsPickerID(t, "included hidden tag", tagPickerLeafIDs(includedHiddenTag.JSON200.Items), hiddenTagResponse.JSON201.TagId)
	tagPick, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{
		Context:     httpclient.PickTagsParamsContextRecordAssignment,
		SelectedIds: &[]int64{hiddenTagResponse.JSON201.TagId},
	})
	requireClientResponse(t, "pick tags", err, tagPick.StatusCode(), http.StatusOK, tagPick.Body)
	tagIDs := tagPickerLeafIDs(tagPick.JSON200.Items)
	assertPickerLeafIDs(t, "tag selected items", tagPickerLeafIDs(tagPick.JSON200.SelectedItems), []int64{hiddenTagResponse.JSON201.TagId})
	assertContainsPickerID(t, "visible tag", tagIDs, tag.TagId)
	if containsPickerID(tagIDs, hiddenTagResponse.JSON201.TagId) {
		t.Fatalf("tag IDs = %v, unexpectedly duplicate selected tag", tagIDs)
	}
	tagParent := "picker"
	tagGroups, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{
		Context: httpclient.PickTagsParamsContextRecordAssignment, ParentFqn: &tagParent, IncludeHidden: &hidden,
	})
	requireClientResponse(t, "browse tag groups", err, tagGroups.StatusCode(), http.StatusOK, tagGroups.Body)
	if !tagPickerHasGroup(tagGroups.JSON200.Items, "picker:tag") {
		t.Fatalf("tag groups = %+v, want picker:tag", tagGroups.JSON200.Items)
	}

	member := scenario.Member("Picker Visible")
	hiddenMember := scenario.Member("Picker Hidden")
	hiddenMemberResponse, err := client.REST().UpdateMemberHiddenWithResponse(ctx, hiddenMember.MemberId, httpclient.UpdateMemberHiddenRequest{IsHidden: true})
	requireClientResponse(t, "hide member", err, hiddenMemberResponse.StatusCode(), http.StatusOK, hiddenMemberResponse.Body)
	hiddenMemberSearch := hiddenMember.Name
	defaultMemberPick, err := client.REST().PickMembersWithResponse(ctx, &httpclient.PickMembersParams{
		Context: httpclient.PickMembersParamsContextRecordAssignment, Q: &hiddenMemberSearch,
	})
	requireClientResponse(t, "exclude unselected hidden member", err, defaultMemberPick.StatusCode(), http.StatusOK, defaultMemberPick.Body)
	if len(defaultMemberPick.JSON200.Items) != 0 {
		t.Fatalf("default member picker items = %+v, want no hidden member", defaultMemberPick.JSON200.Items)
	}
	includedHiddenMember, err := client.REST().PickMembersWithResponse(ctx, &httpclient.PickMembersParams{
		Context: httpclient.PickMembersParamsContextRecordAssignment, IncludeHidden: &hidden,
	})
	requireClientResponse(t, "include hidden member", err, includedHiddenMember.StatusCode(), http.StatusOK, includedHiddenMember.Body)
	includedHiddenMemberIDs := make([]int64, len(includedHiddenMember.JSON200.Items))
	for index, item := range includedHiddenMember.JSON200.Items {
		includedHiddenMemberIDs[index] = item.MemberId
	}
	assertContainsPickerID(t, "included hidden member", includedHiddenMemberIDs, hiddenMember.MemberId)
	hiddenMemberItem := requireMemberPickerItem(t, includedHiddenMember.JSON200.Items, hiddenMember.MemberId)
	if hiddenMemberItem.Title != hiddenMember.Name || !hiddenMemberItem.IsHidden {
		t.Fatalf("hidden member presentation = %+v, want title %q and hidden", hiddenMemberItem, hiddenMember.Name)
	}
	memberPick, err := client.REST().PickMembersWithResponse(ctx, &httpclient.PickMembersParams{
		Context:     httpclient.PickMembersParamsContextRecordAssignment,
		SelectedIds: &[]int64{hiddenMember.MemberId},
	})
	requireClientResponse(t, "pick members", err, memberPick.StatusCode(), http.StatusOK, memberPick.Body)
	memberIDs := make([]int64, len(memberPick.JSON200.Items))
	for index, item := range memberPick.JSON200.Items {
		memberIDs[index] = item.MemberId
	}
	if len(memberPick.JSON200.SelectedItems) != 1 || memberPick.JSON200.SelectedItems[0].MemberId != hiddenMember.MemberId {
		t.Fatalf("member selected items = %+v, want hidden member %d", memberPick.JSON200.SelectedItems, hiddenMember.MemberId)
	}
	assertContainsPickerID(t, "visible member", memberIDs, member.MemberId)
	if containsPickerID(memberIDs, hiddenMember.MemberId) {
		t.Fatalf("member IDs = %v, unexpectedly duplicate selected member", memberIDs)
	}

	accountFilterQuery := flow.Fqn
	accountFilter, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context: httpclient.PickAccountsParamsContextTransactionFilter, Q: &accountFilterQuery,
	})
	requireClientResponse(t, "pick transaction-filter account", err, accountFilter.StatusCode(), http.StatusOK, accountFilter.Body)
	accountFilterItem := requireAccountPickerLeaf(t, accountFilter.JSON200.Items, flow.AccountId)
	if accountFilter.JSON200.CanCreate || accountFilterItem.Fqn != flow.Fqn || accountFilterItem.AccountType == nil {
		t.Fatalf("transaction-filter account = %+v, can_create = %t", accountFilterItem, accountFilter.JSON200.CanCreate)
	}
	categoryFilterQuery := expense.Fqn
	categoryFilter, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{
		Context: httpclient.PickCategoriesParamsContextTransactionFilter, Q: &categoryFilterQuery,
	})
	requireClientResponse(t, "pick transaction-filter category", err, categoryFilter.StatusCode(), http.StatusOK, categoryFilter.Body)
	assertPickerLeafIDs(t, "transaction-filter category", categoryPickerLeafIDs(categoryFilter.JSON200.Items), []int64{expense.CategoryId})
	if categoryFilter.JSON200.CanCreate {
		t.Fatal("transaction-filter category can_create = true, want false")
	}
	tagFilterQuery := tag.Fqn
	tagFilter, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{
		Context: httpclient.PickTagsParamsContextTransactionFilter, Q: &tagFilterQuery,
	})
	requireClientResponse(t, "pick transaction-filter tag", err, tagFilter.StatusCode(), http.StatusOK, tagFilter.Body)
	assertPickerLeafIDs(t, "transaction-filter tag", tagPickerLeafIDs(tagFilter.JSON200.Items), []int64{tag.TagId})
	if tagFilter.JSON200.CanCreate {
		t.Fatal("transaction-filter tag can_create = true, want false")
	}
	memberFilterQuery := member.Name
	memberFilter, err := client.REST().PickMembersWithResponse(ctx, &httpclient.PickMembersParams{
		Context: httpclient.PickMembersParamsContextTransactionFilter, Q: &memberFilterQuery,
	})
	requireClientResponse(t, "pick transaction-filter member", err, memberFilter.StatusCode(), http.StatusOK, memberFilter.Body)
	if len(memberFilter.JSON200.Items) != 1 || memberFilter.JSON200.Items[0].MemberId != member.MemberId || memberFilter.JSON200.Items[0].Title != member.Name {
		t.Fatalf("transaction-filter members = %+v, want member %d", memberFilter.JSON200.Items, member.MemberId)
	}
}

func testBulkAccountPickerContexts(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	scenario := client.Scenario()
	source := scenario.AccountWithCurrency("picker:bulk:source", "USD")
	destinationOne := scenario.AccountWithCurrency("picker:bulk:destination-one", "USD")
	destinationTwo := scenario.AccountWithCurrency("picker:bulk:destination-two", "USD")
	replacement := scenario.AccountWithCurrency("picker:bulk:replacement", "USD")
	wrongCurrency := scenario.AccountWithCurrency("picker:bulk:wrong-currency", "EUR")
	wrongType := scenario.AccountWithType("picker:bulk:flow", httpclient.WritableAccountTypeFlow)

	createTransfer := func(destinationID int64, date string) int64 {
		t.Helper()
		response, err := client.REST().CreateTransferTransactionWithResponse(ctx, httpclient.CreateTransferTransactionRequest{
			Amount: "1.00", Currency: "USD", DestinationAccountId: destinationID, InitiatedDate: apptest.Date(date), SourceAccountId: source.AccountId,
		})
		requireClientResponse(t, "create bulk picker transfer", err, response.StatusCode(), http.StatusCreated, response.Body)
		return response.JSON201.TransactionId
	}
	transactionIDs := []int64{createTransfer(destinationOne.AccountId, "2026-01-01"), createTransfer(destinationTwo.AccountId, "2026-01-02")}

	sourcePick, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context:        httpclient.PickAccountsParamsContextBulkSource,
		TransactionIds: &transactionIDs,
	})
	requireClientResponse(t, "pick bulk source", err, sourcePick.StatusCode(), http.StatusOK, sourcePick.Body)
	assertPickerLeafIDs(t, "bulk source", accountPickerLeafIDs(sourcePick.JSON200.Items), []int64{source.AccountId})
	if sourcePick.JSON200.EligibleCount != 1 {
		t.Fatalf("bulk source eligible_count = %d, want 1", sourcePick.JSON200.EligibleCount)
	}
	noSourceMatch := "no-such-bulk-source"
	filteredSourcePick, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context:        httpclient.PickAccountsParamsContextBulkSource,
		Q:              &noSourceMatch,
		TransactionIds: &transactionIDs,
	})
	requireClientResponse(t, "search bulk source", err, filteredSourcePick.StatusCode(), http.StatusOK, filteredSourcePick.Body)
	if len(accountPickerLeafIDs(filteredSourcePick.JSON200.Items)) != 0 || filteredSourcePick.JSON200.EligibleCount != 1 {
		t.Fatalf("searched bulk source items = %+v, eligible_count = %d; want no items and count 1", filteredSourcePick.JSON200.Items, filteredSourcePick.JSON200.EligibleCount)
	}

	replacementPick, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{
		Context:         httpclient.PickAccountsParamsContextBulkReplacement,
		TransactionIds:  &transactionIDs,
		SourceAccountId: &source.AccountId,
	})
	requireClientResponse(t, "pick bulk replacement", err, replacementPick.StatusCode(), http.StatusOK, replacementPick.Body)
	replacementIDs := accountPickerLeafIDs(replacementPick.JSON200.Items)
	assertContainsPickerID(t, "compatible replacement", replacementIDs, replacement.AccountId)
	if containsPickerID(replacementIDs, source.AccountId) || containsPickerID(replacementIDs, wrongCurrency.AccountId) || containsPickerID(replacementIDs, wrongType.AccountId) {
		t.Fatalf("bulk replacement IDs = %v, include source or incompatible accounts", replacementIDs)
	}
}

func testEntityPickerErrors(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	invalidContext := httpclient.PickTagsParamsContext("invalid")
	invalid, err := client.REST().PickTagsWithResponse(ctx, &httpclient.PickTagsParams{Context: invalidContext})
	requireClientResponse(t, "invalid tag picker context", err, invalid.StatusCode(), http.StatusBadRequest, invalid.Body)
	assertPickerInvalidRequest(t, "invalid tag picker context", invalid.JSON400, invalid.Body)

	invalidCategoryContext := httpclient.PickCategoriesParamsContext("invalid")
	invalidCategory, err := client.REST().PickCategoriesWithResponse(ctx, &httpclient.PickCategoriesParams{Context: invalidCategoryContext})
	requireClientResponse(t, "invalid category picker context", err, invalidCategory.StatusCode(), http.StatusBadRequest, invalidCategory.Body)
	assertPickerInvalidRequest(t, "invalid category picker context", invalidCategory.JSON400, invalidCategory.Body)

	missingSelected := []int64{999999}
	missing, err := client.REST().PickMembersWithResponse(ctx, &httpclient.PickMembersParams{
		Context:     httpclient.PickMembersParamsContextRecordAssignment,
		SelectedIds: &missingSelected,
	})
	requireClientResponse(t, "missing selected member", err, missing.StatusCode(), http.StatusBadRequest, missing.Body)
	assertPickerInvalidRequest(t, "missing selected member", missing.JSON400, missing.Body)

	bulkWithoutTransactions, err := client.REST().PickAccountsWithResponse(ctx, &httpclient.PickAccountsParams{Context: httpclient.PickAccountsParamsContextBulkSource})
	requireClientResponse(t, "bulk source without transactions", err, bulkWithoutTransactions.StatusCode(), http.StatusBadRequest, bulkWithoutTransactions.Body)
	assertPickerInvalidRequest(t, "bulk source without transactions", bulkWithoutTransactions.JSON400, bulkWithoutTransactions.Body)
}

func accountPickerLeafIDs(items []httpclient.AccountPickerItem) []int64 {
	ids := []int64{}
	for _, item := range items {
		if item.Kind == httpclient.AccountPickerItemKindLeaf && item.AccountId != nil {
			ids = append(ids, *item.AccountId)
		}
	}
	return ids
}

func categoryPickerLeafIDs(items []httpclient.CategoryPickerItem) []int64 {
	ids := []int64{}
	for _, item := range items {
		if item.Kind == httpclient.CategoryPickerItemKindLeaf && item.CategoryId != nil {
			ids = append(ids, *item.CategoryId)
		}
	}
	return ids
}

func tagPickerLeafIDs(items []httpclient.TagPickerItem) []int64 {
	ids := []int64{}
	for _, item := range items {
		if item.Kind == httpclient.TagPickerItemKindLeaf && item.TagId != nil {
			ids = append(ids, *item.TagId)
		}
	}
	return ids
}

func accountPickerHasGroup(items []httpclient.AccountPickerItem, fqn string) bool {
	for _, item := range items {
		if item.Kind == httpclient.AccountPickerItemKindGroup && item.Fqn == fqn && item.AccountId == nil {
			return true
		}
	}
	return false
}

func tagPickerHasGroup(items []httpclient.TagPickerItem, fqn string) bool {
	for _, item := range items {
		if item.Kind == httpclient.TagPickerItemKindGroup && item.Fqn == fqn && item.TagId == nil {
			return true
		}
	}
	return false
}

func requireAccountPickerLeaf(t *testing.T, items []httpclient.AccountPickerItem, id int64) httpclient.AccountPickerItem {
	t.Helper()
	for _, item := range items {
		if item.AccountId != nil && *item.AccountId == id {
			return item
		}
	}
	t.Fatalf("account picker items = %+v, want leaf %d", items, id)
	return httpclient.AccountPickerItem{}
}

func requireTagPickerLeaf(t *testing.T, items []httpclient.TagPickerItem, id int64) httpclient.TagPickerItem {
	t.Helper()
	for _, item := range items {
		if item.TagId != nil && *item.TagId == id {
			return item
		}
	}
	t.Fatalf("tag picker items = %+v, want leaf %d", items, id)
	return httpclient.TagPickerItem{}
}

func requireMemberPickerItem(t *testing.T, items []httpclient.MemberPickerItem, id int64) httpclient.MemberPickerItem {
	t.Helper()
	for _, item := range items {
		if item.MemberId == id {
			return item
		}
	}
	t.Fatalf("member picker items = %+v, want item %d", items, id)
	return httpclient.MemberPickerItem{}
}

func assertPickerInvalidRequest(t *testing.T, label string, response *httpclient.ErrorResponse, body []byte) {
	t.Helper()
	if response == nil || response.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("%s error = %+v, want invalid_request; body %s", label, response, body)
	}
}

func assertPickerLeafIDs(t *testing.T, label string, got []int64, want []int64) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s IDs = %v, want %v", label, got, want)
	}
}

func assertContainsPickerID(t *testing.T, label string, values []int64, want int64) {
	t.Helper()
	if !containsPickerID(values, want) {
		t.Fatalf("%s IDs = %v, want %d", label, values, want)
	}
}

func containsPickerID(values []int64, want int64) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
