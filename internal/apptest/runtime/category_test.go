package runtime_test

import (
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestCategoryCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	created := apptest.Decode[models.Category](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		Fqn: "Food:Restaurants",
	})
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	assertCategoryHierarchy(t, created.Body, "Food", "Restaurants", 1)

	read := apptest.Decode[models.Category](client, http.MethodGet, categoryPath(created.Body.CategoryId), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.CategoryId != created.Body.CategoryId {
		t.Fatalf("read category id = %d, want %d", read.Body.CategoryId, created.Body.CategoryId)
	}

	hidden := apptest.Decode[models.Category](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		Fqn:      "Food:Groceries",
		IsHidden: apptest.BoolPtr(true),
	})
	if hidden.StatusCode != http.StatusCreated {
		t.Fatalf("hidden create status = %d, want %d; body %s", hidden.StatusCode, http.StatusCreated, hidden.RawBody)
	}

	defaultList := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories", nil)
	if defaultList.StatusCode != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode, http.StatusOK, defaultList.RawBody)
	}
	assertCategoryIDs(t, defaultList.Body.Categories, []int64{created.Body.CategoryId})

	includeHidden := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories?include_hidden=true", nil)
	if includeHidden.StatusCode != http.StatusOK {
		t.Fatalf("include hidden status = %d, want %d; body %s", includeHidden.StatusCode, http.StatusOK, includeHidden.RawBody)
	}
	assertCategoryIDs(t, includeHidden.Body.Categories, []int64{hidden.Body.CategoryId, created.Body.CategoryId})

	updated := apptest.Decode[models.Category](client, http.MethodPatch, categoryPath(created.Body.CategoryId), models.UpdateCategoryRequest{
		IsHidden: true,
	})
	if updated.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode, http.StatusOK, updated.RawBody)
	}
	if !updated.Body.IsHidden {
		t.Fatal("updated category hidden = false, want true")
	}

	afterHide := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories", nil)
	if afterHide.StatusCode != http.StatusOK {
		t.Fatalf("after hide list status = %d, want %d; body %s", afterHide.StatusCode, http.StatusOK, afterHide.RawBody)
	}
	assertCategoryIDs(t, afterHide.Body.Categories, nil)

	deleted := apptest.Decode[apptest.EmptyJSON](client, http.MethodDelete, categoryPath(hidden.Body.CategoryId), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	missing := apptest.Decode[models.ErrorResponse](client, http.MethodGet, categoryPath(hidden.Body.CategoryId), nil)
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode, http.StatusNotFound, missing.RawBody)
	}

	deletedRead := apptest.Decode[models.Category](client, http.MethodGet, categoryPath(hidden.Body.CategoryId)+"?include_tombstoned=true", nil)
	if deletedRead.StatusCode != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode, http.StatusOK, deletedRead.RawBody)
	}
	if deletedRead.Body.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}

	withTombstones := apptest.Decode[models.CategoryListResponse](client, http.MethodGet, "/categories?include_hidden=true&include_tombstoned=true", nil)
	if withTombstones.StatusCode != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode, http.StatusOK, withTombstones.RawBody)
	}
	assertCategoryIDs(t, withTombstones.Body.Categories, []int64{hidden.Body.CategoryId, created.Body.CategoryId})
	if withTombstones.Body.Categories[0].TombstonedAt == nil {
		t.Fatal("deleted category tombstoned_at = nil, want timestamp")
	}
}

func TestCategoryRejectsDuplicateActiveFQN(t *testing.T) {
	client := newSharedClient(t)

	first := apptest.Decode[models.Category](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		Fqn: "Bills:Utilities",
	})
	if first.StatusCode != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode, http.StatusCreated, first.RawBody)
	}

	duplicate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		Fqn: "Bills:Utilities",
	})
	if duplicate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode, http.StatusConflict, duplicate.RawBody)
	}
	if duplicate.Body.Error.Code != models.APIErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.Body.Error.Code, models.APIErrorCodeConflict)
	}

	deleted := apptest.Decode[apptest.EmptyJSON](client, http.MethodDelete, categoryPath(first.Body.CategoryId), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	recreated := apptest.Decode[models.Category](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		Fqn: "Bills:Utilities",
	})
	if recreated.StatusCode != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode, http.StatusCreated, recreated.RawBody)
	}
}

func TestCategoryValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	invalid := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		Fqn: "Food::Restaurants",
	})
	if invalid.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid status = %d, want %d; body %s", invalid.StatusCode, http.StatusBadRequest, invalid.RawBody)
	}
	if invalid.Body.Error.Code != models.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid code = %q, want %q", invalid.Body.Error.Code, models.APIErrorCodeInvalidRequest)
	}

	badQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/categories?include_hidden=maybe", nil)
	if badQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode, http.StatusBadRequest, badQuery.RawBody)
	}

	missingRequired := apptest.Decode[models.ErrorResponse](client, http.MethodPatch, "/categories/1", map[string]any{})
	if missingRequired.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing required status = %d, want %d; body %s", missingRequired.StatusCode, http.StatusBadRequest, missingRequired.RawBody)
	}

	missingHidden := apptest.Decode[models.ErrorResponse](client, http.MethodPatch, "/categories/1", map[string]string{
		"fqn": "Other",
	})
	if missingHidden.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing hidden status = %d, want %d; body %s", missingHidden.StatusCode, http.StatusBadRequest, missingHidden.RawBody)
	}

	extraField := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/categories", map[string]any{
		"fqn":        "Food:Restaurants",
		"extraField": true,
	})
	if extraField.StatusCode != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode, http.StatusBadRequest, extraField.RawBody)
	}
}

func categoryPath(id int64) string {
	return apptest.IDPath("/categories", id)
}

func assertCategoryHierarchy(t *testing.T, category models.Category, parent string, name string, level int) {
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

func assertCategoryIDs(t *testing.T, categories []models.Category, want []int64) {
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
