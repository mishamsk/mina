package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestMemberCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	created, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{
		Name: "Alex",
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	if created.JSON201.Name != "Alex" {
		t.Fatalf("created name = %q, want Alex", created.JSON201.Name)
	}

	read, err := client.REST().GetMemberWithResponse(context.Background(), created.JSON201.MemberId, nil)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.MemberId != created.JSON201.MemberId {
		t.Fatalf("read member id = %d, want %d", read.JSON200.MemberId, created.JSON201.MemberId)
	}

	second, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{
		Name: "Blair",
	})
	if err != nil {
		t.Fatalf("second create request: %v", err)
	}
	if second.StatusCode() != http.StatusCreated {
		t.Fatalf("second create status = %d, want %d; body %s", second.StatusCode(), http.StatusCreated, second.Body)
	}

	defaultList, err := client.REST().ListMembersWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default list request: %v", err)
	}
	if defaultList.StatusCode() != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode(), http.StatusOK, defaultList.Body)
	}
	assertMemberIDs(t, defaultList.JSON200.Members, []int64{created.JSON201.MemberId, second.JSON201.MemberId})

	updated, err := client.REST().UpdateMemberWithResponse(context.Background(), created.JSON201.MemberId, httpclient.UpdateMemberRequest{
		Name: "Casey",
	})
	if err != nil {
		t.Fatalf("update request: %v", err)
	}
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if updated.JSON200.Name != "Casey" {
		t.Fatalf("updated name = %q, want Casey", updated.JSON200.Name)
	}

	deleted, err := client.REST().DeleteMemberWithResponse(context.Background(), second.JSON201.MemberId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	missing, err := client.REST().GetMemberWithResponse(context.Background(), second.JSON201.MemberId, nil)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	defaultAfterDelete, err := client.REST().ListMembersWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default after delete request: %v", err)
	}
	if defaultAfterDelete.StatusCode() != http.StatusOK {
		t.Fatalf("default after delete status = %d, want %d; body %s", defaultAfterDelete.StatusCode(), http.StatusOK, defaultAfterDelete.Body)
	}
	assertMemberIDs(t, defaultAfterDelete.JSON200.Members, []int64{created.JSON201.MemberId})

	includeTombstoned := true
	deletedRead, err := client.REST().GetMemberWithResponse(context.Background(), second.JSON201.MemberId, &httpclient.GetMemberParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("get deleted with tombstones request: %v", err)
	}
	if deletedRead.StatusCode() != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode(), http.StatusOK, deletedRead.Body)
	}
	if deletedRead.JSON200.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}

	withTombstones, err := client.REST().ListMembersWithResponse(context.Background(), &httpclient.ListMembersParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("include tombstones request: %v", err)
	}
	if withTombstones.StatusCode() != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode(), http.StatusOK, withTombstones.Body)
	}
	assertMemberIDs(t, withTombstones.JSON200.Members, []int64{second.JSON201.MemberId, created.JSON201.MemberId})
	if withTombstones.JSON200.Members[0].TombstonedAt == nil {
		t.Fatal("deleted member tombstoned_at = nil, want timestamp")
	}
}

func TestMemberRejectsDuplicateActiveName(t *testing.T) {
	client := newSharedClient(t)

	first, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{
		Name: "Alex",
	})
	if err != nil {
		t.Fatalf("first create request: %v", err)
	}
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	duplicate, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{
		Name: "Alex",
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

	second, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{
		Name: "Blair",
	})
	if err != nil {
		t.Fatalf("second create request: %v", err)
	}
	if second.StatusCode() != http.StatusCreated {
		t.Fatalf("second create status = %d, want %d; body %s", second.StatusCode(), http.StatusCreated, second.Body)
	}

	duplicateUpdate, err := client.REST().UpdateMemberWithResponse(context.Background(), second.JSON201.MemberId, httpclient.UpdateMemberRequest{
		Name: "Alex",
	})
	if err != nil {
		t.Fatalf("duplicate update request: %v", err)
	}
	if duplicateUpdate.StatusCode() != http.StatusConflict {
		t.Fatalf("duplicate update status = %d, want %d; body %s", duplicateUpdate.StatusCode(), http.StatusConflict, duplicateUpdate.Body)
	}

	deleted, err := client.REST().DeleteMemberWithResponse(context.Background(), first.JSON201.MemberId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	recreated, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{
		Name: "Alex",
	})
	if err != nil {
		t.Fatalf("recreate request: %v", err)
	}
	if recreated.StatusCode() != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode(), http.StatusCreated, recreated.Body)
	}
}

func TestMemberValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	blank, err := client.REST().CreateMemberWithResponse(context.Background(), httpclient.CreateMemberRequest{
		Name: "",
	})
	if err != nil {
		t.Fatalf("blank request: %v", err)
	}
	if blank.StatusCode() != http.StatusBadRequest {
		t.Fatalf("blank status = %d, want %d; body %s", blank.StatusCode(), http.StatusBadRequest, blank.Body)
	}
	if blank.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("blank code = %q, want %q", blank.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}

	whitespace, err := client.REST().UpdateMemberWithResponse(context.Background(), 1, httpclient.UpdateMemberRequest{
		Name: " Alex",
	})
	if err != nil {
		t.Fatalf("whitespace request: %v", err)
	}
	if whitespace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("whitespace status = %d, want %d; body %s", whitespace.StatusCode(), http.StatusBadRequest, whitespace.Body)
	}

	badQuery, err := client.REST().ListMembersWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_tombstoned=maybe"))
	if err != nil {
		t.Fatalf("bad query request: %v", err)
	}
	if badQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode(), http.StatusBadRequest, badQuery.Body)
	}

	emptyQuery, err := client.REST().ListMembersWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_tombstoned="))
	if err != nil {
		t.Fatalf("empty query request: %v", err)
	}
	if emptyQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("empty query status = %d, want %d; body %s", emptyQuery.StatusCode(), http.StatusBadRequest, emptyQuery.Body)
	}

	extraField, err := client.REST().CreateMemberWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"name":       "Alex",
		"extraField": true,
	}))
	if err != nil {
		t.Fatalf("extra field request: %v", err)
	}
	if extraField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode(), http.StatusBadRequest, extraField.Body)
	}
}

func assertMemberIDs(t *testing.T, members []httpclient.Member, want []int64) {
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
