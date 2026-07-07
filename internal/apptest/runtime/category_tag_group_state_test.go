package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestCategoryGroupStatesAndSetHiddenByPath(t *testing.T) {
	client := newSharedClient(t)

	visible := createCategoryForGroupState(t, client, "groupstate:Categories:Mixed:Visible", false)
	hidden := createCategoryForGroupState(t, client, "groupstate:Categories:Mixed:Hidden", true)
	createCategoryForGroupState(t, client, "groupstate:Categories:Hidden:Only", true)

	defaultGroups := listCategoryGroups(t, client, false)
	assertGroupState(t, defaultGroups, "groupstate:Categories:Mixed", stringPtr("groupstate:Categories"), 2, false)
	assertGroupMissing(t, defaultGroups, "groupstate:Categories:Hidden")

	omittedParamGroups := listCategoryGroupsDefault(t, client)
	assertGroupMissing(t, omittedParamGroups, "groupstate:Categories:Hidden")

	withHidden := listCategoryGroups(t, client, true)
	assertGroupState(t, withHidden, "groupstate:Categories:Hidden", stringPtr("groupstate:Categories"), 2, true)

	updated := setCategoryHiddenByPath(t, client, "groupstate:Categories:Mixed", true)
	if updated.JSON200.UpdatedCount != 2 {
		t.Fatalf("category set-hidden updated_count = %d, want 2", updated.JSON200.UpdatedCount)
	}
	assertCategoryHidden(t, client, visible.CategoryId, true)
	assertCategoryHidden(t, client, hidden.CategoryId, true)

	defaultGroupsAfterHide := listCategoryGroups(t, client, false)
	assertGroupMissing(t, defaultGroupsAfterHide, "groupstate:Categories:Mixed")
	hiddenGroupsAfterHide := listCategoryGroups(t, client, true)
	assertGroupState(t, hiddenGroupsAfterHide, "groupstate:Categories:Mixed", stringPtr("groupstate:Categories"), 2, true)

	unhidden := setCategoryHiddenByPath(t, client, "groupstate:Categories:Mixed", false)
	if unhidden.JSON200.UpdatedCount != 2 {
		t.Fatalf("category unhide updated_count = %d, want 2", unhidden.JSON200.UpdatedCount)
	}
	assertCategoryHidden(t, client, visible.CategoryId, false)
	assertCategoryHidden(t, client, hidden.CategoryId, false)

	defaultGroupsAfterUnhide := listCategoryGroups(t, client, false)
	assertGroupState(t, defaultGroupsAfterUnhide, "groupstate:Categories:Mixed", stringPtr("groupstate:Categories"), 2, false)

	assertSetCategoryHiddenStatus(t, client, "groupstate:Categories:Missing", true, http.StatusNotFound, httpclient.APIErrorCodeNotFound)
	assertSetCategoryHiddenStatus(t, client, ":invalid", true, http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
}

func TestCategorySetHiddenByPathIgnoresTombstonedLeaves(t *testing.T) {
	client := newSharedClient(t)

	active := createCategoryForGroupState(t, client, "groupstate:Categories:Tombstone:Mixed:Active", false)
	tombstonedSibling := createCategoryForGroupState(t, client, "groupstate:Categories:Tombstone:Mixed:Closed", false)
	deleteCategory(t, client, tombstonedSibling.CategoryId)
	onlyTombstoned := createCategoryForGroupState(t, client, "groupstate:Categories:Tombstone:Only:Leaf", false)
	deleteCategory(t, client, onlyTombstoned.CategoryId)

	hidden := setCategoryHiddenByPath(t, client, "groupstate:Categories:Tombstone:Mixed", true)
	if hidden.JSON200.UpdatedCount != 1 {
		t.Fatalf("category mixed tombstone updated_count = %d, want 1", hidden.JSON200.UpdatedCount)
	}
	assertCategoryHidden(t, client, active.CategoryId, true)

	readTombstoned := getCategoryForRestructure(t, client, tombstonedSibling.CategoryId, true)
	if readTombstoned.IsHidden {
		t.Fatalf("tombstoned category sibling is_hidden = true, want false")
	}

	withHidden := listCategoryGroups(t, client, true)
	assertGroupMissing(t, withHidden, "groupstate:Categories:Tombstone:Only")
	assertSetCategoryHiddenStatus(t, client, "groupstate:Categories:Tombstone:Only", true, http.StatusNotFound, httpclient.APIErrorCodeNotFound)
}

func TestTagGroupStatesAndSetHiddenByPath(t *testing.T) {
	client := newSharedClient(t)

	visible := createTagForGroupState(t, client, "groupstate:Tags:Mixed:Visible", false)
	hidden := createTagForGroupState(t, client, "groupstate:Tags:Mixed:Hidden", true)
	createTagForGroupState(t, client, "groupstate:Tags:Hidden:Only", true)

	defaultGroups := listTagGroups(t, client, false)
	assertGroupState(t, defaultGroups, "groupstate:Tags:Mixed", stringPtr("groupstate:Tags"), 2, false)
	assertGroupMissing(t, defaultGroups, "groupstate:Tags:Hidden")

	omittedParamGroups := listTagGroupsDefault(t, client)
	assertGroupMissing(t, omittedParamGroups, "groupstate:Tags:Hidden")

	withHidden := listTagGroups(t, client, true)
	assertGroupState(t, withHidden, "groupstate:Tags:Hidden", stringPtr("groupstate:Tags"), 2, true)

	updated := setTagHiddenByPath(t, client, "groupstate:Tags:Mixed", true)
	if updated.JSON200.UpdatedCount != 2 {
		t.Fatalf("tag set-hidden updated_count = %d, want 2", updated.JSON200.UpdatedCount)
	}
	assertTagHidden(t, client, visible.TagId, true)
	assertTagHidden(t, client, hidden.TagId, true)

	defaultGroupsAfterHide := listTagGroups(t, client, false)
	assertGroupMissing(t, defaultGroupsAfterHide, "groupstate:Tags:Mixed")
	hiddenGroupsAfterHide := listTagGroups(t, client, true)
	assertGroupState(t, hiddenGroupsAfterHide, "groupstate:Tags:Mixed", stringPtr("groupstate:Tags"), 2, true)

	unhidden := setTagHiddenByPath(t, client, "groupstate:Tags:Mixed", false)
	if unhidden.JSON200.UpdatedCount != 2 {
		t.Fatalf("tag unhide updated_count = %d, want 2", unhidden.JSON200.UpdatedCount)
	}
	assertTagHidden(t, client, visible.TagId, false)
	assertTagHidden(t, client, hidden.TagId, false)

	defaultGroupsAfterUnhide := listTagGroups(t, client, false)
	assertGroupState(t, defaultGroupsAfterUnhide, "groupstate:Tags:Mixed", stringPtr("groupstate:Tags"), 2, false)

	assertSetTagHiddenStatus(t, client, "groupstate:Tags:Missing", true, http.StatusNotFound, httpclient.APIErrorCodeNotFound)
	assertSetTagHiddenStatus(t, client, ":invalid", true, http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
}

func TestTagSetHiddenByPathIgnoresTombstonedLeaves(t *testing.T) {
	client := newSharedClient(t)

	active := createTagForGroupState(t, client, "groupstate:Tags:Tombstone:Mixed:Active", false)
	tombstonedSibling := createTagForGroupState(t, client, "groupstate:Tags:Tombstone:Mixed:Closed", false)
	deleteTag(t, client, tombstonedSibling.TagId)
	onlyTombstoned := createTagForGroupState(t, client, "groupstate:Tags:Tombstone:Only:Leaf", false)
	deleteTag(t, client, onlyTombstoned.TagId)

	hidden := setTagHiddenByPath(t, client, "groupstate:Tags:Tombstone:Mixed", true)
	if hidden.JSON200.UpdatedCount != 1 {
		t.Fatalf("tag mixed tombstone updated_count = %d, want 1", hidden.JSON200.UpdatedCount)
	}
	assertTagHidden(t, client, active.TagId, true)

	readTombstoned := getTagForRestructure(t, client, tombstonedSibling.TagId, true)
	if readTombstoned.IsHidden {
		t.Fatalf("tombstoned tag sibling is_hidden = true, want false")
	}

	withHidden := listTagGroups(t, client, true)
	assertGroupMissing(t, withHidden, "groupstate:Tags:Tombstone:Only")
	assertSetTagHiddenStatus(t, client, "groupstate:Tags:Tombstone:Only", true, http.StatusNotFound, httpclient.APIErrorCodeNotFound)
}

func createCategoryForGroupState(t *testing.T, client *apptest.Client, fqn string, hidden bool) httpclient.Category {
	t.Helper()

	response, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn:            fqn,
		EconomicIntent: httpclient.CategoryEconomicIntentExpense,
		IsHidden:       &hidden,
	})
	requireNoTransportError(t, "create category for group state", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create category for group state status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func createTagForGroupState(t *testing.T, client *apptest.Client, fqn string, hidden bool) httpclient.Tag {
	t.Helper()

	response, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      fqn,
		IsHidden: &hidden,
	})
	requireNoTransportError(t, "create tag for group state", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create tag for group state status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func listCategoryGroups(t *testing.T, client *apptest.Client, includeHidden bool) []httpclient.GroupState {
	t.Helper()

	response, err := client.REST().ListCategoryGroupsWithResponse(context.Background(), &httpclient.ListCategoryGroupsParams{IncludeHidden: &includeHidden})
	return requireCategoryGroupsResponse(t, response, err)
}

func listCategoryGroupsDefault(t *testing.T, client *apptest.Client) []httpclient.GroupState {
	t.Helper()

	response, err := client.REST().ListCategoryGroupsWithResponse(context.Background(), nil)
	return requireCategoryGroupsResponse(t, response, err)
}

func requireCategoryGroupsResponse(t *testing.T, response *httpclient.ListCategoryGroupsResponse, err error) []httpclient.GroupState {
	t.Helper()

	requireNoTransportError(t, "list category groups", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list category groups status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response.JSON200.Groups
}

func listTagGroups(t *testing.T, client *apptest.Client, includeHidden bool) []httpclient.GroupState {
	t.Helper()

	response, err := client.REST().ListTagGroupsWithResponse(context.Background(), &httpclient.ListTagGroupsParams{IncludeHidden: &includeHidden})
	return requireTagGroupsResponse(t, response, err)
}

func listTagGroupsDefault(t *testing.T, client *apptest.Client) []httpclient.GroupState {
	t.Helper()

	response, err := client.REST().ListTagGroupsWithResponse(context.Background(), nil)
	return requireTagGroupsResponse(t, response, err)
}

func requireTagGroupsResponse(t *testing.T, response *httpclient.ListTagGroupsResponse, err error) []httpclient.GroupState {
	t.Helper()

	requireNoTransportError(t, "list tag groups", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list tag groups status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response.JSON200.Groups
}

func setCategoryHiddenByPath(t *testing.T, client *apptest.Client, path string, hidden bool) *httpclient.SetCategoryHiddenByPathResponse {
	t.Helper()

	response, err := client.REST().SetCategoryHiddenByPathWithResponse(context.Background(), httpclient.SetHiddenByPathRequest{
		PathFqn:  path,
		IsHidden: hidden,
	})
	requireNoTransportError(t, "set category hidden by path", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("set category hidden by path status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func setTagHiddenByPath(t *testing.T, client *apptest.Client, path string, hidden bool) *httpclient.SetTagHiddenByPathResponse {
	t.Helper()

	response, err := client.REST().SetTagHiddenByPathWithResponse(context.Background(), httpclient.SetHiddenByPathRequest{
		PathFqn:  path,
		IsHidden: hidden,
	})
	requireNoTransportError(t, "set tag hidden by path", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("set tag hidden by path status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertSetCategoryHiddenStatus(t *testing.T, client *apptest.Client, path string, hidden bool, status int, code httpclient.APIErrorCode) {
	t.Helper()

	response, err := client.REST().SetCategoryHiddenByPathWithResponse(context.Background(), httpclient.SetHiddenByPathRequest{
		PathFqn:  path,
		IsHidden: hidden,
	})
	requireNoTransportError(t, "set category hidden by path rejected", err)
	if response.StatusCode() != status {
		t.Fatalf("set category hidden status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
	assertSetHiddenErrorCode(t, response.JSON400, response.JSON404, response.Body, status, code)
}

func assertSetTagHiddenStatus(t *testing.T, client *apptest.Client, path string, hidden bool, status int, code httpclient.APIErrorCode) {
	t.Helper()

	response, err := client.REST().SetTagHiddenByPathWithResponse(context.Background(), httpclient.SetHiddenByPathRequest{
		PathFqn:  path,
		IsHidden: hidden,
	})
	requireNoTransportError(t, "set tag hidden by path rejected", err)
	if response.StatusCode() != status {
		t.Fatalf("set tag hidden status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
	assertSetHiddenErrorCode(t, response.JSON400, response.JSON404, response.Body, status, code)
}

func assertSetHiddenErrorCode(t *testing.T, badRequest *httpclient.InvalidRequest, notFound *httpclient.NotFound, body []byte, status int, code httpclient.APIErrorCode) {
	t.Helper()

	switch status {
	case http.StatusBadRequest:
		if badRequest == nil || badRequest.Error.Code != code {
			t.Fatalf("400 error = %+v, want code %q; body %s", badRequest, code, body)
		}
	case http.StatusNotFound:
		if notFound == nil || notFound.Error.Code != code {
			t.Fatalf("404 error = %+v, want code %q; body %s", notFound, code, body)
		}
	default:
		t.Fatalf("unsupported set hidden error status %d", status)
	}
}

func assertGroupState(t *testing.T, groups []httpclient.GroupState, fqn string, parent *string, level int, hidden bool) {
	t.Helper()

	group, ok := groupStateByFQN(groups, fqn)
	if !ok {
		t.Fatalf("group %q not found in %+v", fqn, groups)
	}
	if !equalOptionalString(group.ParentFqn, parent) || group.Level != level || group.IsHidden != hidden {
		t.Fatalf("group %q = %+v, want parent %v level %d hidden %t", fqn, group, parent, level, hidden)
	}
}

func assertGroupMissing(t *testing.T, groups []httpclient.GroupState, fqn string) {
	t.Helper()

	if group, ok := groupStateByFQN(groups, fqn); ok {
		t.Fatalf("group %q = %+v, want missing", fqn, group)
	}
}

func groupStateByFQN(groups []httpclient.GroupState, fqn string) (httpclient.GroupState, bool) {
	for _, group := range groups {
		if group.Fqn == fqn {
			return group, true
		}
	}

	return httpclient.GroupState{}, false
}
