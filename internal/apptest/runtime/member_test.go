package runtime_test

import (
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestMemberCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	created := apptest.Decode[models.Member](client, http.MethodPost, "/members", models.CreateMemberRequest{
		Name: "Alex",
	})
	if created.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode, http.StatusCreated, created.RawBody)
	}
	if created.Body.Name != "Alex" {
		t.Fatalf("created name = %q, want Alex", created.Body.Name)
	}

	read := apptest.Decode[models.Member](client, http.MethodGet, memberPath(created.Body.MemberId), nil)
	if read.StatusCode != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode, http.StatusOK, read.RawBody)
	}
	if read.Body.MemberId != created.Body.MemberId {
		t.Fatalf("read member id = %d, want %d", read.Body.MemberId, created.Body.MemberId)
	}

	second := apptest.Decode[models.Member](client, http.MethodPost, "/members", models.CreateMemberRequest{
		Name: "Blair",
	})
	if second.StatusCode != http.StatusCreated {
		t.Fatalf("second create status = %d, want %d; body %s", second.StatusCode, http.StatusCreated, second.RawBody)
	}

	defaultList := apptest.Decode[models.MemberListResponse](client, http.MethodGet, "/members", nil)
	if defaultList.StatusCode != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode, http.StatusOK, defaultList.RawBody)
	}
	assertMemberIDs(t, defaultList.Body.Members, []int64{created.Body.MemberId, second.Body.MemberId})

	updated := apptest.Decode[models.Member](client, http.MethodPatch, memberPath(created.Body.MemberId), models.UpdateMemberRequest{
		Name: "Casey",
	})
	if updated.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode, http.StatusOK, updated.RawBody)
	}
	if updated.Body.Name != "Casey" {
		t.Fatalf("updated name = %q, want Casey", updated.Body.Name)
	}

	deleted := apptest.Decode[apptest.EmptyJSON](client, http.MethodDelete, memberPath(second.Body.MemberId), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	missing := apptest.Decode[models.ErrorResponse](client, http.MethodGet, memberPath(second.Body.MemberId), nil)
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode, http.StatusNotFound, missing.RawBody)
	}

	defaultAfterDelete := apptest.Decode[models.MemberListResponse](client, http.MethodGet, "/members", nil)
	if defaultAfterDelete.StatusCode != http.StatusOK {
		t.Fatalf("default after delete status = %d, want %d; body %s", defaultAfterDelete.StatusCode, http.StatusOK, defaultAfterDelete.RawBody)
	}
	assertMemberIDs(t, defaultAfterDelete.Body.Members, []int64{created.Body.MemberId})

	deletedRead := apptest.Decode[models.Member](client, http.MethodGet, memberPath(second.Body.MemberId)+"?include_tombstoned=true", nil)
	if deletedRead.StatusCode != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode, http.StatusOK, deletedRead.RawBody)
	}
	if deletedRead.Body.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}

	withTombstones := apptest.Decode[models.MemberListResponse](client, http.MethodGet, "/members?include_tombstoned=true", nil)
	if withTombstones.StatusCode != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode, http.StatusOK, withTombstones.RawBody)
	}
	assertMemberIDs(t, withTombstones.Body.Members, []int64{second.Body.MemberId, created.Body.MemberId})
	if withTombstones.Body.Members[0].TombstonedAt == nil {
		t.Fatal("deleted member tombstoned_at = nil, want timestamp")
	}
}

func TestMemberRejectsDuplicateActiveName(t *testing.T) {
	client := newSharedClient(t)

	first := apptest.Decode[models.Member](client, http.MethodPost, "/members", models.CreateMemberRequest{
		Name: "Alex",
	})
	if first.StatusCode != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode, http.StatusCreated, first.RawBody)
	}

	duplicate := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/members", models.CreateMemberRequest{
		Name: "Alex",
	})
	if duplicate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode, http.StatusConflict, duplicate.RawBody)
	}
	if duplicate.Body.Error.Code != models.APIErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.Body.Error.Code, models.APIErrorCodeConflict)
	}

	second := apptest.Decode[models.Member](client, http.MethodPost, "/members", models.CreateMemberRequest{
		Name: "Blair",
	})
	if second.StatusCode != http.StatusCreated {
		t.Fatalf("second create status = %d, want %d; body %s", second.StatusCode, http.StatusCreated, second.RawBody)
	}

	duplicateUpdate := apptest.Decode[models.ErrorResponse](client, http.MethodPatch, memberPath(second.Body.MemberId), models.UpdateMemberRequest{
		Name: "Alex",
	})
	if duplicateUpdate.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate update status = %d, want %d; body %s", duplicateUpdate.StatusCode, http.StatusConflict, duplicateUpdate.RawBody)
	}

	deleted := apptest.Decode[apptest.EmptyJSON](client, http.MethodDelete, memberPath(first.Body.MemberId), nil)
	if deleted.StatusCode != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode, http.StatusNoContent, deleted.RawBody)
	}

	recreated := apptest.Decode[models.Member](client, http.MethodPost, "/members", models.CreateMemberRequest{
		Name: "Alex",
	})
	if recreated.StatusCode != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode, http.StatusCreated, recreated.RawBody)
	}
}

func TestMemberValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	blank := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/members", models.CreateMemberRequest{
		Name: "",
	})
	if blank.StatusCode != http.StatusBadRequest {
		t.Fatalf("blank status = %d, want %d; body %s", blank.StatusCode, http.StatusBadRequest, blank.RawBody)
	}
	if blank.Body.Error.Code != models.APIErrorCodeInvalidRequest {
		t.Fatalf("blank code = %q, want %q", blank.Body.Error.Code, models.APIErrorCodeInvalidRequest)
	}

	whitespace := apptest.Decode[models.ErrorResponse](client, http.MethodPatch, "/members/1", models.UpdateMemberRequest{
		Name: " Alex",
	})
	if whitespace.StatusCode != http.StatusBadRequest {
		t.Fatalf("whitespace status = %d, want %d; body %s", whitespace.StatusCode, http.StatusBadRequest, whitespace.RawBody)
	}

	badQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/members?include_tombstoned=maybe", nil)
	if badQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode, http.StatusBadRequest, badQuery.RawBody)
	}

	emptyQuery := apptest.Decode[models.ErrorResponse](client, http.MethodGet, "/members?include_tombstoned=", nil)
	if emptyQuery.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty query status = %d, want %d; body %s", emptyQuery.StatusCode, http.StatusBadRequest, emptyQuery.RawBody)
	}

	extraField := apptest.Decode[models.ErrorResponse](client, http.MethodPost, "/members", map[string]any{
		"name":       "Alex",
		"extraField": true,
	})
	if extraField.StatusCode != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode, http.StatusBadRequest, extraField.RawBody)
	}
}

func memberPath(id int64) string {
	return apptest.IDPath("/members", id)
}

func assertMemberIDs(t *testing.T, members []models.Member, want []int64) {
	t.Helper()

	if len(members) != len(want) {
		t.Fatalf("member count = %d, want %d; members = %+v", len(members), len(want), members)
	}
	for i, member := range members {
		if member.MemberId != want[i] {
			t.Fatalf("member id at %d = %d, want %d; members = %+v", i, member.MemberId, want[i], members)
		}
	}
}
