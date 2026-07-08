package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestCategoryCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	created, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "Food:Restaurants",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertCategoryHierarchy(t, *created.JSON201, "Food", "Restaurants", 1)
	if created.JSON201.EconomicIntent != httpclient.CategoryEconomicIntentExpense {
		t.Fatalf("economic_intent = %q, want %q", created.JSON201.EconomicIntent, httpclient.CategoryEconomicIntentExpense)
	}

	read, err := client.REST().GetCategoryWithResponse(context.Background(), created.JSON201.CategoryId, nil)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.CategoryId != created.JSON201.CategoryId {
		t.Fatalf("read category id = %d, want %d", read.JSON200.CategoryId, created.JSON201.CategoryId)
	}
	if read.JSON200.EconomicIntent != httpclient.CategoryEconomicIntentExpense {
		t.Fatalf("read economic_intent = %q, want %q", read.JSON200.EconomicIntent, httpclient.CategoryEconomicIntentExpense)
	}

	hiddenValue := true
	hidden, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "Food:Groceries",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
		IsHidden:       &hiddenValue,
	})
	if err != nil {
		t.Fatalf("hidden create request: %v", err)
	}
	if hidden.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden create status = %d, want %d; body %s", hidden.StatusCode(), http.StatusCreated, hidden.Body)
	}

	defaultList, err := client.REST().ListCategoriesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default list request: %v", err)
	}
	if defaultList.StatusCode() != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode(), http.StatusOK, defaultList.Body)
	}
	assertCategoryIDs(t, defaultList.JSON200.Categories, []int64{created.JSON201.CategoryId})
	assertCategoryEconomicIntents(t, defaultList.JSON200.Categories, []httpclient.CategoryEconomicIntent{httpclient.CategoryEconomicIntentExpense})

	includeHidden, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{IncludeHidden: &hiddenValue})
	if err != nil {
		t.Fatalf("include hidden request: %v", err)
	}
	if includeHidden.StatusCode() != http.StatusOK {
		t.Fatalf("include hidden status = %d, want %d; body %s", includeHidden.StatusCode(), http.StatusOK, includeHidden.Body)
	}
	assertCategoryIDs(t, includeHidden.JSON200.Categories, []int64{hidden.JSON201.CategoryId, created.JSON201.CategoryId})
	assertCategoryEconomicIntents(t, includeHidden.JSON200.Categories, []httpclient.CategoryEconomicIntent{httpclient.CategoryEconomicIntentExpense, httpclient.CategoryEconomicIntentExpense})

	updated, err := client.REST().UpdateCategoryWithResponse(context.Background(), created.JSON201.CategoryId, httpclient.UpdateCategoryRequest{
		IsHidden: true,
	})
	if err != nil {
		t.Fatalf("update request: %v", err)
	}
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if !updated.JSON200.IsHidden {
		t.Fatal("updated category hidden = false, want true")
	}
	if updated.JSON200.EconomicIntent != httpclient.CategoryEconomicIntentExpense {
		t.Fatalf("updated economic_intent = %q, want %q", updated.JSON200.EconomicIntent, httpclient.CategoryEconomicIntentExpense)
	}

	afterHide, err := client.REST().ListCategoriesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("after hide list request: %v", err)
	}
	if afterHide.StatusCode() != http.StatusOK {
		t.Fatalf("after hide list status = %d, want %d; body %s", afterHide.StatusCode(), http.StatusOK, afterHide.Body)
	}
	assertCategoryIDs(t, afterHide.JSON200.Categories, nil)

	deleted, err := client.REST().DeleteCategoryWithResponse(context.Background(), hidden.JSON201.CategoryId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	missing, err := client.REST().GetCategoryWithResponse(context.Background(), hidden.JSON201.CategoryId, nil)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	includeTombstoned := true
	deletedRead, err := client.REST().GetCategoryWithResponse(context.Background(), hidden.JSON201.CategoryId, &httpclient.GetCategoryParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("get deleted with tombstones request: %v", err)
	}
	if deletedRead.StatusCode() != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode(), http.StatusOK, deletedRead.Body)
	}
	if deletedRead.JSON200.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}
	if deletedRead.JSON200.EconomicIntent != httpclient.CategoryEconomicIntentExpense {
		t.Fatalf("get deleted with tombstones economic_intent = %q, want %q", deletedRead.JSON200.EconomicIntent, httpclient.CategoryEconomicIntentExpense)
	}

	withTombstones, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{
		IncludeHidden:     &hiddenValue,
		IncludeTombstoned: &includeTombstoned,
	})
	if err != nil {
		t.Fatalf("include tombstones request: %v", err)
	}
	if withTombstones.StatusCode() != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode(), http.StatusOK, withTombstones.Body)
	}
	assertCategoryIDs(t, withTombstones.JSON200.Categories, []int64{hidden.JSON201.CategoryId, created.JSON201.CategoryId})
	assertCategoryEconomicIntents(t, withTombstones.JSON200.Categories, []httpclient.CategoryEconomicIntent{httpclient.CategoryEconomicIntentExpense, httpclient.CategoryEconomicIntentExpense})
	if withTombstones.JSON200.Categories[0].TombstonedAt == nil {
		t.Fatal("deleted category tombstoned_at = nil, want timestamp")
	}
}

func TestCategoryRejectsDuplicateActiveFQN(t *testing.T) {
	client := newSharedClient(t)

	first, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "Bills:Utilities",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("first create request: %v", err)
	}
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	duplicate, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "Bills:Utilities",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
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

	deleted, err := client.REST().DeleteCategoryWithResponse(context.Background(), first.JSON201.CategoryId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	recreated, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "Bills:Utilities",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("recreate request: %v", err)
	}
	if recreated.StatusCode() != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode(), http.StatusCreated, recreated.Body)
	}
}

func TestCategoryRejectsHierarchyFQNConflict(t *testing.T) {
	client := newSharedClient(t)

	leaf, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "HierarchyCategory:Leaf",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("leaf create request: %v", err)
	}
	if leaf.StatusCode() != http.StatusCreated {
		t.Fatalf("leaf create status = %d, want %d; body %s", leaf.StatusCode(), http.StatusCreated, leaf.Body)
	}

	extendsLeaf, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "HierarchyCategory:Leaf:Child",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("extends leaf request: %v", err)
	}
	if extendsLeaf.StatusCode() != http.StatusConflict {
		t.Fatalf("extends leaf status = %d, want %d; body %s", extendsLeaf.StatusCode(), http.StatusConflict, extendsLeaf.Body)
	}
	if extendsLeaf.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("extends leaf code = %q, want %q", extendsLeaf.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}

	child, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "HierarchyCategory:Group:Child",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("child create request: %v", err)
	}
	if child.StatusCode() != http.StatusCreated {
		t.Fatalf("child create status = %d, want %d; body %s", child.StatusCode(), http.StatusCreated, child.Body)
	}

	prefixesChild, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "HierarchyCategory:Group",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("prefixes child request: %v", err)
	}
	if prefixesChild.StatusCode() != http.StatusConflict {
		t.Fatalf("prefixes child status = %d, want %d; body %s", prefixesChild.StatusCode(), http.StatusConflict, prefixesChild.Body)
	}
	if prefixesChild.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("prefixes child code = %q, want %q", prefixesChild.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}
}

func TestCategoryAllowsHierarchyLookalikeBoundary(t *testing.T) {
	client := newSharedClient(t)

	leaf, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "HierarchyCategoryLookalike:Leaf",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("leaf create request: %v", err)
	}
	if leaf.StatusCode() != http.StatusCreated {
		t.Fatalf("leaf create status = %d, want %d; body %s", leaf.StatusCode(), http.StatusCreated, leaf.Body)
	}

	lookalike, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "HierarchyCategoryLookalike:Leafish:Child",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("lookalike create request: %v", err)
	}
	if lookalike.StatusCode() != http.StatusCreated {
		t.Fatalf("lookalike create status = %d, want %d; body %s", lookalike.StatusCode(), http.StatusCreated, lookalike.Body)
	}
}

func TestCategoryAllowsHierarchyPrefixReuseAfterTombstone(t *testing.T) {
	client := newSharedClient(t)

	leaf, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "TombstonedCategoryHierarchy:Leaf",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("leaf create request: %v", err)
	}
	if leaf.StatusCode() != http.StatusCreated {
		t.Fatalf("leaf create status = %d, want %d; body %s", leaf.StatusCode(), http.StatusCreated, leaf.Body)
	}
	deleteCategory(t, client, leaf.JSON201.CategoryId)

	childAfterDeletedLeaf, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "TombstonedCategoryHierarchy:Leaf:Child",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("child after deleted leaf request: %v", err)
	}
	if childAfterDeletedLeaf.StatusCode() != http.StatusCreated {
		t.Fatalf("child after deleted leaf status = %d, want %d; body %s", childAfterDeletedLeaf.StatusCode(), http.StatusCreated, childAfterDeletedLeaf.Body)
	}

	child, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "TombstonedCategoryHierarchy:Group:Child",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("child create request: %v", err)
	}
	if child.StatusCode() != http.StatusCreated {
		t.Fatalf("child create status = %d, want %d; body %s", child.StatusCode(), http.StatusCreated, child.Body)
	}
	deleteCategory(t, client, child.JSON201.CategoryId)

	parentAfterDeletedChild, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "TombstonedCategoryHierarchy:Group",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("parent after deleted child request: %v", err)
	}
	if parentAfterDeletedChild.StatusCode() != http.StatusCreated {
		t.Fatalf("parent after deleted child status = %d, want %d; body %s", parentAfterDeletedChild.StatusCode(), http.StatusCreated, parentAfterDeletedChild.Body)
	}
}

func TestCategoryListFiltersByEconomicIntent(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	hidden := true

	expense := scenario.CategoryWithIntent("FilterIntent:Expense", httpclient.CategoryEconomicIntentExpense)
	fee, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "FilterIntent:FeeHidden",
		EconomicIntent: httpclient.CategoryEconomicIntentFee,
		IsHidden:       &hidden,
	})
	if err != nil {
		t.Fatalf("hidden fee create request: %v", err)
	}
	if fee.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden fee create status = %d, want %d; body %s", fee.StatusCode(), http.StatusCreated, fee.Body)
	}
	income := scenario.CategoryWithIntent("FilterIntent:Income", httpclient.CategoryEconomicIntentIncome)
	refund := scenario.CategoryWithIntent("FilterIntent:Refund", httpclient.CategoryEconomicIntentRefund)

	incomeIntent := []httpclient.CategoryEconomicIntent{httpclient.CategoryEconomicIntentIncome}
	singleIntent, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{
		EconomicIntent: &incomeIntent,
	})
	if err != nil {
		t.Fatalf("single intent list request: %v", err)
	}
	if singleIntent.StatusCode() != http.StatusOK {
		t.Fatalf("single intent list status = %d, want %d; body %s", singleIntent.StatusCode(), http.StatusOK, singleIntent.Body)
	}
	assertCategoryIDs(t, singleIntent.JSON200.Categories, []int64{income.CategoryId})

	expenseOrRefund := []httpclient.CategoryEconomicIntent{
		httpclient.CategoryEconomicIntentExpense,
		httpclient.CategoryEconomicIntentRefund,
	}
	multipleIntents, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{
		EconomicIntent: &expenseOrRefund,
	})
	if err != nil {
		t.Fatalf("multiple intents list request: %v", err)
	}
	if multipleIntents.StatusCode() != http.StatusOK {
		t.Fatalf("multiple intents list status = %d, want %d; body %s", multipleIntents.StatusCode(), http.StatusOK, multipleIntents.Body)
	}
	assertCategoryIDs(t, multipleIntents.JSON200.Categories, []int64{expense.CategoryId, refund.CategoryId})

	feeIntent := []httpclient.CategoryEconomicIntent{httpclient.CategoryEconomicIntentFee}
	feeWithoutHidden, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{
		EconomicIntent: &feeIntent,
	})
	if err != nil {
		t.Fatalf("fee without hidden list request: %v", err)
	}
	if feeWithoutHidden.StatusCode() != http.StatusOK {
		t.Fatalf("fee without hidden list status = %d, want %d; body %s", feeWithoutHidden.StatusCode(), http.StatusOK, feeWithoutHidden.Body)
	}
	assertCategoryIDs(t, feeWithoutHidden.JSON200.Categories, nil)

	feeWithHidden, err := client.REST().ListCategoriesWithResponse(context.Background(), &httpclient.ListCategoriesParams{
		EconomicIntent: &feeIntent,
		IncludeHidden:  &hidden,
	})
	if err != nil {
		t.Fatalf("fee with hidden list request: %v", err)
	}
	if feeWithHidden.StatusCode() != http.StatusOK {
		t.Fatalf("fee with hidden list status = %d, want %d; body %s", feeWithHidden.StatusCode(), http.StatusOK, feeWithHidden.Body)
	}
	assertCategoryIDs(t, feeWithHidden.JSON200.Categories, []int64{fee.JSON201.CategoryId})

	invalidIntent, err := client.REST().ListCategoriesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("economic_intent=unknown"))
	if err != nil {
		t.Fatalf("invalid intent list request: %v", err)
	}
	if invalidIntent.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid intent list status = %d, want %d; body %s", invalidIntent.StatusCode(), http.StatusBadRequest, invalidIntent.Body)
	}
	if invalidIntent.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid intent code = %q, want %q", invalidIntent.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
}

func TestCategoryValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	invalid, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            "Food::Restaurants",
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
	})
	if err != nil {
		t.Fatalf("invalid request: %v", err)
	}
	if invalid.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid status = %d, want %d; body %s", invalid.StatusCode(), http.StatusBadRequest, invalid.Body)
	}
	if invalid.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid code = %q, want %q", invalid.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}

	missingEconomicIntent, err := client.REST().CreateCategoryWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn": "Food:MissingIntent",
	}))
	if err != nil {
		t.Fatalf("missing economic intent request: %v", err)
	}
	if missingEconomicIntent.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing economic intent status = %d, want %d; body %s", missingEconomicIntent.StatusCode(), http.StatusBadRequest, missingEconomicIntent.Body)
	}

	invalidEconomicIntent, err := client.REST().CreateCategoryWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":             "Food:InvalidIntent",
		"economic_intent": "unknown",
	}))
	if err != nil {
		t.Fatalf("invalid economic intent request: %v", err)
	}
	if invalidEconomicIntent.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid economic intent status = %d, want %d; body %s", invalidEconomicIntent.StatusCode(), http.StatusBadRequest, invalidEconomicIntent.Body)
	}

	badQuery, err := client.REST().ListCategoriesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_hidden=maybe"))
	if err != nil {
		t.Fatalf("bad query request: %v", err)
	}
	if badQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode(), http.StatusBadRequest, badQuery.Body)
	}

	missingRequired, err := client.REST().UpdateCategoryWithBodyWithResponse(context.Background(), 1, "application/json", apptest.JSONReader(map[string]any{}))
	if err != nil {
		t.Fatalf("missing required request: %v", err)
	}
	if missingRequired.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing required status = %d, want %d; body %s", missingRequired.StatusCode(), http.StatusBadRequest, missingRequired.Body)
	}

	missingHidden, err := client.REST().UpdateCategoryWithBodyWithResponse(context.Background(), 1, "application/json", apptest.JSONReader(map[string]string{
		"fqn": "Other",
	}))
	if err != nil {
		t.Fatalf("missing hidden request: %v", err)
	}
	if missingHidden.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing hidden status = %d, want %d; body %s", missingHidden.StatusCode(), http.StatusBadRequest, missingHidden.Body)
	}

	extraField, err := client.REST().CreateCategoryWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":             "Food:Restaurants",
		"economic_intent": "expense",
		"extraField":      true,
	}))
	if err != nil {
		t.Fatalf("extra field request: %v", err)
	}
	if extraField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode(), http.StatusBadRequest, extraField.Body)
	}
}

func assertCategoryHierarchy(t *testing.T, category httpclient.Category, parent string, name string, level int) {
	t.Helper()

	if category.ParentFqn == nil || *category.ParentFqn != parent {
		t.Fatalf("parent_fqn = %v, want %q", category.ParentFqn, parent)
	}
	if category.Name != name {
		t.Fatalf("name = %q, want %q", category.Name, name)
	}
	if category.Level != level {
		t.Fatalf("level = %d, want %d", category.Level, level)
	}
}

func assertCategoryIDs(t *testing.T, categories []httpclient.Category, want []int64) {
	t.Helper()

	if len(categories) != len(want) {
		t.Fatalf("category count = %d, want %d; categories = %+v", len(categories), len(want), categories)
	}
	for i, category := range categories {
		if category.CategoryId != want[i] {
			t.Fatalf("category id at %d = %d, want %d; categories = %+v", i, category.CategoryId, want[i], categories)
		}
	}
}

func assertCategoryEconomicIntents(t *testing.T, categories []httpclient.Category, want []httpclient.CategoryEconomicIntent) {
	t.Helper()

	if len(categories) != len(want) {
		t.Fatalf("category count = %d, want %d; categories = %+v", len(categories), len(want), categories)
	}
	for i, category := range categories {
		if category.EconomicIntent != want[i] {
			t.Fatalf("category economic_intent at %d = %q, want %q; categories = %+v", i, category.EconomicIntent, want[i], categories)
		}
	}
}
