package runtime_test

import (
	"net/http"
	"strconv"
	"testing"

	"mina.local/mina/internal/apptest"
	"mina.local/mina/internal/httpapi/models"
)

func TestTagCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := apptest.New(t)

	created := apptest.Decode[models.Tag](client, http.MethodPost, "/tags", models.CreateTagRequest{
		FQN: "Trips:Vacation",
	})
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	assertTagHierarchy(t, created.Body, "Trips", "Vacation", 1)

	read := apptest.Decode[models.Tag](client, http.MethodGet, tagPath(created.Body.ID), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.ID != created.Body.ID {
		t.Fatalf("read tag id = %d, want %d", read.Body.ID, created.Body.ID)
	}

	hidden := apptest.Decode[models.Tag](client, http.MethodPost, "/tags", models.CreateTagRequest{
		FQN:      "Trips:Planning",
		IsHidden: boolPtr(true),
	})
	if hidden.StatusCode != http.StatusCreated {
		t.Fatalf("hidden create status = %d, want %d; body %s", hidden.StatusCode, http.StatusCreated, hidden.RawBody)
	}

	defaultList := apptest.Decode[models.TagListResponse](client, http.MethodGet, "/tags", nil)
	if defaultList.StatusCode != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode, http.StatusOK, defaultList.RawBody)
	}
	assertTagIDs(t, defaultList.Body.Tags, []int64{created.Body.ID})

	includeHidden := apptest.Decode[models.TagListResponse](client, http.MethodGet, "/tags?include_hidden=true", nil)
	if includeHidden.StatusCode != http.StatusOK {
		t.Fatalf("include hidden status = %d, want %d; body %s", includeHidden.StatusCode, http.StatusOK, includeHidden.RawBody)
	}
	assertTagIDs(t, includeHidden.Body.Tags, []int64{hidden.Body.ID, created.Body.ID})

	updated := apptest.Decode[models.Tag](client, http.MethodPatch, tagPath(created.Body.ID), models.UpdateTagRequest{
		IsHidden: boolPtr(true),
	})
	if updated.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode, http.StatusOK, updated.RawBody)
	}
	if !updated.Body.IsHidden {
		t.Fatal("updated tag hidden = false, want true")
	}

	afterHide := apptest.Decode[models.TagListResponse](client, http.MethodGet, "/tags", nil)
	if afterHide.StatusCode != http.StatusOK {
		t.Fatalf("after hide list status = %d, want %d; body %s", afterHide.StatusCode, http.StatusOK, afterHide.RawBody)
	}
	assertTagIDs(t, afterHide.Body.Tags, nil)

	visibleDeleted := apptest.Decode[models.Tag](client, http.MethodPost, "/tags", models.CreateTagRequest{
		FQN: "Trips:Archive",
	})
	if visibleDeleted.StatusCode != http.StatusCreated {
		t.Fatalf("visible delete create status = %d, want %d; body %s", visibleDeleted.StatusCode, http.StatusCreated, visibleDeleted.RawBody)
	}
	visibleDelete := apptest.Decode[jsonBody](client, http.MethodDelete, tagPath(visibleDeleted.Body.ID), nil)
	if visibleDelete.StatusCode != http.StatusNoContent {
		t.Fatalf("visible delete status = %d, want %d; body %s", visibleDelete.StatusCode, http.StatusNoContent, visibleDelete.RawBody)
	}
	defaultAfterVisibleDelete := apptest.Decode[models.TagListResponse](client, http.MethodGet, "/tags", nil)
	if defaultAfterVisibleDelete.StatusCode != http.StatusOK {
		t.Fatalf("default after visible delete status = %d, want %d; body %s", defaultAfterVisibleDelete.StatusCode, http.StatusOK, defaultAfterVisibleDelete.RawBody)
	}
	assertTagIDs(t, defaultAfterVisibleDelete.Body.Tags, nil)

	deleted := apptest.Decode[jsonBody](client, http.MethodDelete, tagPath(hidden.Body.ID), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	missing := apptest.Decode[models.ErrorResponse](client, http.MethodGet, tagPath(hidden.Body.ID), nil)
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode, http.StatusNotFound, missing.RawBody)
	}

	deletedRead := apptest.Decode[models.Tag](client, http.MethodGet, tagPath(hidden.Body.ID)+"?include_tombstoned=true", nil)
	if deletedRead.StatusCode != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode, http.StatusOK, deletedRead.RawBody)
	}
	if deletedRead.Body.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}

	withTombstones := apptest.Decode[models.TagListResponse](client, http.MethodGet, "/tags?include_hidden=true&include_tombstoned=true", nil)
	if withTombstones.StatusCode != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode, http.StatusOK, withTombstones.RawBody)
	}
	assertTagIDs(t, withTombstones.Body.Tags, []int64{visibleDeleted.Body.ID, hidden.Body.ID, created.Body.ID})
	if withTombstones.Body.Tags[0].TombstonedAt == nil {
		t.Fatal("deleted tag tombstoned_at = nil, want timestamp")
	}
}

func TestTagRejectsDuplicateActiveFQN(t *testing.T) {
	client := apptest.New(t)

	first := apptest.Decode[models.Tag](client, http.MethodPost, "/tags", models.CreateTagRequest{
		FQN: "Tax:Medical",
	})
	if first.StatusCode != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode, http.StatusCreated, first.RawBody)
	}

	duplicate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/tags", models.CreateTagRequest{
		FQN: "Tax:Medical",
	})
	if duplicate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode, http.StatusConflict, duplicate.RawBody)
	}
	if duplicate.Body.Error.Code != models.ErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.Body.Error.Code, models.ErrorCodeConflict)
	}

	deleted := apptest.Decode[jsonBody](client, http.MethodDelete, tagPath(first.Body.ID), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	recreated := apptest.Decode[models.Tag](client, http.MethodPost, "/tags", models.CreateTagRequest{
		FQN: "Tax:Medical",
	})
	if recreated.StatusCode != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode, http.StatusCreated, recreated.RawBody)
	}
}

func TestTagValidationErrors(t *testing.T) {
	client := apptest.New(t)

	invalid := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/tags", models.CreateTagRequest{
		FQN: "Tax::Medical",
	})
	if invalid.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid status = %d, want %d; body %s", invalid.StatusCode, http.StatusBadRequest, invalid.RawBody)
	}
	if invalid.Body.Error.Code != models.ErrorCodeInvalidRequest {
		t.Fatalf("invalid code = %q, want %q", invalid.Body.Error.Code, models.ErrorCodeInvalidRequest)
	}

	badQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/tags?include_hidden=maybe", nil)
	if badQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode, http.StatusBadRequest, badQuery.RawBody)
	}

	emptyQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/tags?include_hidden=", nil)
	if emptyQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty query status = %d, want %d; body %s", emptyQuery.StatusCode, http.StatusBadRequest, emptyQuery.RawBody)
	}

	missingRequired := apptest.Decode[models.ErrorResponse](client, http.MethodPatch, "/tags/1", map[string]any{})
	if missingRequired.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing required status = %d, want %d; body %s", missingRequired.StatusCode, http.StatusBadRequest, missingRequired.RawBody)
	}

	missingHidden := apptest.Decode[models.ErrorResponse](client, http.MethodPatch, "/tags/1", map[string]string{
		"fqn": "Other",
	})
	if missingHidden.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing hidden status = %d, want %d; body %s", missingHidden.StatusCode, http.StatusBadRequest, missingHidden.RawBody)
	}

	extraField := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/tags", map[string]any{
		"fqn":        "Tax:Medical",
		"extraField": true,
	})
	if extraField.StatusCode != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode, http.StatusBadRequest, extraField.RawBody)
	}
}

func tagPath(id int64) string {
	return "/tags/" + strconv.FormatInt(id, 10)
}

func assertTagHierarchy(t *testing.T, tag models.Tag, parent string, name string, level int) {
	t.Helper()

	if tag.ParentFQN == nil || *tag.ParentFQN != parent {
		t.Fatalf("parent_fqn = %v, want %q", tag.ParentFQN, parent)
	}
	if tag.Name != name {
		t.Fatalf("name = %q, want %q", tag.Name, name)
	}
	if tag.Level != level {
		t.Fatalf("level = %d, want %d", tag.Level, level)
	}
}

func assertTagIDs(t *testing.T, tags []models.Tag, want []int64) {
	t.Helper()

	if len(tags) != len(want) {
		t.Fatalf("tag count = %d, want %d; tags = %+v", len(tags), len(want), tags)
	}
	for i, tag := range tags {
		if tag.ID != want[i] {
			t.Fatalf("tag id at %d = %d, want %d; tags = %+v", i, tag.ID, want[i], tags)
		}
	}
}
