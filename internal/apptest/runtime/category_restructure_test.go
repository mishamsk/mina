package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestCategoryRestructureCoreCases(t *testing.T) {
	client := newSharedClient(t)

	renamed := createCategoryForRestructure(t, client, "restructure:Category:Old")
	rename := restructureCategories(t, client, "restructure:Category:Old", "restructure:Category:New")
	if rename.JSON200.MovedCount != 1 {
		t.Fatalf("category rename moved_count = %d, want 1", rename.JSON200.MovedCount)
	}
	assertCategoryFQN(t, client, renamed.CategoryId, "restructure:Category:New")

	leaf := createCategoryForRestructure(t, client, "restructure:CategoryLeafGroup")
	leafToGroup := restructureCategories(t, client, "restructure:CategoryLeafGroup", "restructure:CategoryLeafGroup:Other")
	if leafToGroup.JSON200.MovedCount != 1 {
		t.Fatalf("category leaf-to-group moved_count = %d, want 1", leafToGroup.JSON200.MovedCount)
	}
	assertCategoryFQN(t, client, leaf.CategoryId, "restructure:CategoryLeafGroup:Other")

	assertRestructureCategoryStatus(t, client, "restructure:Category:Missing", "restructure:Category:MissingNew", http.StatusNotFound, httpclient.APIErrorCodeNotFound)
	assertRestructureCategoryStatus(t, client, "restructure:Category:New", "restructure:Category:New", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureCategoryStatus(t, client, ":invalid", "restructure:Category:InvalidTo", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureCategoryStatus(t, client, "restructure:Category:New", "restructure::CategoryInvalid", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)

	ownSubtree := createCategoryForRestructure(t, client, "restructure:CategoryOwnSubtree:One")
	createCategoryForRestructure(t, client, "restructure:CategoryOwnSubtree:Two")
	assertRestructureCategoryStatus(t, client, "restructure:CategoryOwnSubtree", "restructure:CategoryOwnSubtree:Moved", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertCategoryFQN(t, client, ownSubtree.CategoryId, "restructure:CategoryOwnSubtree:One")

	source := createCategoryForRestructure(t, client, "restructure:CategoryConflict:Source")
	occupied := createCategoryForRestructure(t, client, "restructure:CategoryConflict:Target:Child")
	assertRestructureCategoryStatus(t, client, "restructure:CategoryConflict:Source", "restructure:CategoryConflict:Target", http.StatusConflict, httpclient.APIErrorCodeConflict)
	assertCategoryFQN(t, client, source.CategoryId, "restructure:CategoryConflict:Source")
	assertCategoryFQN(t, client, occupied.CategoryId, "restructure:CategoryConflict:Target:Child")

	prefixSource := createCategoryForRestructure(t, client, "restructure:CategoryPrefixConflict:Source")
	prefixOccupied := createCategoryForRestructure(t, client, "restructure:CategoryPrefixConflict:Target")
	assertRestructureCategoryStatus(t, client, "restructure:CategoryPrefixConflict:Source", "restructure:CategoryPrefixConflict:Target:Child", http.StatusConflict, httpclient.APIErrorCodeConflict)
	assertCategoryFQN(t, client, prefixSource.CategoryId, "restructure:CategoryPrefixConflict:Source")
	assertCategoryFQN(t, client, prefixOccupied.CategoryId, "restructure:CategoryPrefixConflict:Target")

	hidden := createCategoryForRestructureWithHidden(t, client, "restructure:CategoryHidden:Old:Leaf", true)
	restructureCategories(t, client, "restructure:CategoryHidden:Old", "restructure:CategoryHidden:New")
	assertCategoryFQN(t, client, hidden.CategoryId, "restructure:CategoryHidden:New:Leaf")
	assertCategoryHidden(t, client, hidden.CategoryId, true)
}

func TestCategoryRestructureLeavesTombstonedCategoriesUnchanged(t *testing.T) {
	client := newSharedClient(t)

	tombstoned := createCategoryForRestructure(t, client, "restructure:CategoryTombstone:Old:Deleted")
	deleteCategory(t, client, tombstoned.CategoryId)
	active := createCategoryForRestructure(t, client, "restructure:CategoryTombstone:Old:Active")

	restructureCategories(t, client, "restructure:CategoryTombstone:Old", "restructure:CategoryTombstone:New")

	assertCategoryFQN(t, client, active.CategoryId, "restructure:CategoryTombstone:New:Active")
	assertTombstonedCategoryFQN(t, client, tombstoned.CategoryId, "restructure:CategoryTombstone:Old:Deleted")
}

func createCategoryForRestructure(t *testing.T, client *apptest.Client, fqn string) httpclient.Category {
	t.Helper()

	return createCategoryForRestructureWithHidden(t, client, fqn, false)
}

func createCategoryForRestructureWithHidden(t *testing.T, client *apptest.Client, fqn string, hidden bool) httpclient.Category {
	t.Helper()

	response, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            fqn,
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
		IsHidden:       &hidden,
	})
	requireNoTransportError(t, "create category for restructure", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create category for restructure status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func restructureCategories(t *testing.T, client *apptest.Client, from string, to string) *httpclient.RestructureCategoriesResponse {
	t.Helper()

	response, err := client.REST().RestructureCategoriesWithResponse(context.Background(), httpclient.RestructureRequest{
		FromFqn: from,
		ToFqn:   to,
	})
	requireNoTransportError(t, "restructure categories", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("restructure categories status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertRestructureCategoryStatus(t *testing.T, client *apptest.Client, from string, to string, status int, code httpclient.APIErrorCode) {
	t.Helper()

	response, err := client.REST().RestructureCategoriesWithResponse(context.Background(), httpclient.RestructureRequest{
		FromFqn: from,
		ToFqn:   to,
	})
	requireNoTransportError(t, "restructure categories rejected", err)
	if response.StatusCode() != status {
		t.Fatalf("restructure categories status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
	switch status {
	case http.StatusBadRequest:
		if response.JSON400 == nil || response.JSON400.Error.Code != code {
			t.Fatalf("400 error = %+v, want code %q; body %s", response.JSON400, code, response.Body)
		}
	case http.StatusNotFound:
		if response.JSON404 == nil || response.JSON404.Error.Code != code {
			t.Fatalf("404 error = %+v, want code %q; body %s", response.JSON404, code, response.Body)
		}
	case http.StatusConflict:
		if response.JSON409 == nil || response.JSON409.Error.Code != code {
			t.Fatalf("409 error = %+v, want code %q; body %s", response.JSON409, code, response.Body)
		}
	default:
		t.Fatalf("unsupported category restructure status %d", status)
	}
}

func assertCategoryFQN(t *testing.T, client *apptest.Client, categoryID int64, fqn string) {
	t.Helper()

	category := getCategoryForRestructure(t, client, categoryID, false)
	if category.Fqn != fqn {
		t.Fatalf("category %d fqn = %q, want %q", categoryID, category.Fqn, fqn)
	}
}

func assertCategoryHidden(t *testing.T, client *apptest.Client, categoryID int64, hidden bool) {
	t.Helper()

	category := getCategoryForRestructure(t, client, categoryID, false)
	if category.IsHidden != hidden {
		t.Fatalf("category %d is_hidden = %t, want %t", categoryID, category.IsHidden, hidden)
	}
}

func getCategoryForRestructure(t *testing.T, client *apptest.Client, categoryID int64, includeTombstoned bool) httpclient.Category {
	t.Helper()

	response, err := client.REST().GetCategoryWithResponse(context.Background(), categoryID, &httpclient.GetCategoryParams{IncludeTombstoned: &includeTombstoned})
	requireNoTransportError(t, "get category for restructure", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get category for restructure status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return *response.JSON200
}

func assertTombstonedCategoryFQN(t *testing.T, client *apptest.Client, categoryID int64, fqn string) {
	t.Helper()

	category := getCategoryForRestructure(t, client, categoryID, true)
	if category.Fqn != fqn {
		t.Fatalf("tombstoned category %d fqn = %q, want %q", categoryID, category.Fqn, fqn)
	}
	if category.TombstonedAt == nil {
		t.Fatalf("category %d tombstoned_at = nil, want timestamp", categoryID)
	}
}
