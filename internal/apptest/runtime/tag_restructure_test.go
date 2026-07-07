package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTagRestructureRenameWithSubtree(t *testing.T) {
	client := newSharedClient(t)

	first := createTagForRestructure(t, client, "restructure:Tag:Old:First")
	second := createTagForRestructure(t, client, "restructure:Tag:Old:Second")

	response := restructureTags(t, client, "restructure:Tag:Old", "restructure:Tag:New")
	if response.JSON200.MovedCount != 2 {
		t.Fatalf("tag restructure moved_count = %d, want 2", response.JSON200.MovedCount)
	}
	assertTagFQN(t, client, first.TagId, "restructure:Tag:New:First")
	assertTagFQN(t, client, second.TagId, "restructure:Tag:New:Second")

	leaf := createTagForRestructure(t, client, "restructure:TagLeafGroup")
	leafToGroup := restructureTags(t, client, "restructure:TagLeafGroup", "restructure:TagLeafGroup:Other")
	if leafToGroup.JSON200.MovedCount != 1 {
		t.Fatalf("tag leaf-to-group moved_count = %d, want 1", leafToGroup.JSON200.MovedCount)
	}
	assertTagFQN(t, client, leaf.TagId, "restructure:TagLeafGroup:Other")

	hidden := createTagForRestructureWithHidden(t, client, "restructure:TagHidden:Old:Leaf", true)
	restructureTags(t, client, "restructure:TagHidden:Old", "restructure:TagHidden:New")
	assertTagFQN(t, client, hidden.TagId, "restructure:TagHidden:New:Leaf")
	assertTagHidden(t, client, hidden.TagId, true)
}

func TestTagRestructureRejectsMissingConflictAndSamePath(t *testing.T) {
	client := newSharedClient(t)

	assertRestructureTagStatus(t, client, "restructure:TagMissing", "restructure:TagMissing:New", http.StatusNotFound, httpclient.APIErrorCodeNotFound)

	ownSubtree := createTagForRestructure(t, client, "restructure:TagOwnSubtree:One")
	createTagForRestructure(t, client, "restructure:TagOwnSubtree:Two")
	assertRestructureTagStatus(t, client, "restructure:TagOwnSubtree", "restructure:TagOwnSubtree:Moved", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertTagFQN(t, client, ownSubtree.TagId, "restructure:TagOwnSubtree:One")

	source := createTagForRestructure(t, client, "restructure:TagConflict:Source")
	occupied := createTagForRestructure(t, client, "restructure:TagConflict:Target:Child")
	assertRestructureTagStatus(t, client, "restructure:TagConflict:Source", "restructure:TagConflict:Target", http.StatusConflict, httpclient.APIErrorCodeConflict)
	assertTagFQN(t, client, source.TagId, "restructure:TagConflict:Source")
	assertTagFQN(t, client, occupied.TagId, "restructure:TagConflict:Target:Child")

	prefixSource := createTagForRestructure(t, client, "restructure:TagPrefixConflict:Source")
	prefixOccupied := createTagForRestructure(t, client, "restructure:TagPrefixConflict:Target")
	assertRestructureTagStatus(t, client, "restructure:TagPrefixConflict:Source", "restructure:TagPrefixConflict:Target:Child", http.StatusConflict, httpclient.APIErrorCodeConflict)
	assertTagFQN(t, client, prefixSource.TagId, "restructure:TagPrefixConflict:Source")
	assertTagFQN(t, client, prefixOccupied.TagId, "restructure:TagPrefixConflict:Target")

	assertRestructureTagStatus(t, client, "restructure:TagConflict:Source", "restructure:TagConflict:Source", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureTagStatus(t, client, ":invalid", "restructure:TagInvalid:To", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureTagStatus(t, client, "restructure:TagConflict:Source", "restructure::TagInvalid", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
}

func TestTagRestructureLeavesTombstonedTagsUnchanged(t *testing.T) {
	client := newSharedClient(t)

	tombstoned := createTagForRestructure(t, client, "restructure:TagTombstone:Old:Deleted")
	deleteTag(t, client, tombstoned.TagId)
	active := createTagForRestructure(t, client, "restructure:TagTombstone:Old:Active")

	restructureTags(t, client, "restructure:TagTombstone:Old", "restructure:TagTombstone:New")

	assertTagFQN(t, client, active.TagId, "restructure:TagTombstone:New:Active")
	assertTombstonedTagFQN(t, client, tombstoned.TagId, "restructure:TagTombstone:Old:Deleted")
}

func createTagForRestructure(t *testing.T, client *apptest.Client, fqn string) httpclient.Tag {
	t.Helper()

	return createTagForRestructureWithHidden(t, client, fqn, false)
}

func createTagForRestructureWithHidden(t *testing.T, client *apptest.Client, fqn string, hidden bool) httpclient.Tag {
	t.Helper()

	response, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      fqn,
		IsHidden: &hidden,
	})
	requireNoTransportError(t, "create tag for restructure", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create tag for restructure status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func restructureTags(t *testing.T, client *apptest.Client, from string, to string) *httpclient.RestructureTagsResponse {
	t.Helper()

	response, err := client.REST().RestructureTagsWithResponse(context.Background(), httpclient.RestructureRequest{
		FromFqn: from,
		ToFqn:   to,
	})
	requireNoTransportError(t, "restructure tags", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("restructure tags status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertRestructureTagStatus(t *testing.T, client *apptest.Client, from string, to string, status int, code httpclient.APIErrorCode) {
	t.Helper()

	response, err := client.REST().RestructureTagsWithResponse(context.Background(), httpclient.RestructureRequest{
		FromFqn: from,
		ToFqn:   to,
	})
	requireNoTransportError(t, "restructure tags rejected", err)
	if response.StatusCode() != status {
		t.Fatalf("restructure tags status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
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
		t.Fatalf("unsupported tag restructure status %d", status)
	}
}

func assertTagFQN(t *testing.T, client *apptest.Client, tagID int64, fqn string) {
	t.Helper()

	tag := getTagForRestructure(t, client, tagID, false)
	if tag.Fqn != fqn {
		t.Fatalf("tag %d fqn = %q, want %q", tagID, tag.Fqn, fqn)
	}
}

func assertTagHidden(t *testing.T, client *apptest.Client, tagID int64, hidden bool) {
	t.Helper()

	tag := getTagForRestructure(t, client, tagID, false)
	if tag.IsHidden != hidden {
		t.Fatalf("tag %d is_hidden = %t, want %t", tagID, tag.IsHidden, hidden)
	}
}

func getTagForRestructure(t *testing.T, client *apptest.Client, tagID int64, includeTombstoned bool) httpclient.Tag {
	t.Helper()

	response, err := client.REST().GetTagWithResponse(context.Background(), tagID, &httpclient.GetTagParams{IncludeTombstoned: &includeTombstoned})
	requireNoTransportError(t, "get tag for restructure", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get tag for restructure status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return *response.JSON200
}

func assertTombstonedTagFQN(t *testing.T, client *apptest.Client, tagID int64, fqn string) {
	t.Helper()

	tag := getTagForRestructure(t, client, tagID, true)
	if tag.Fqn != fqn {
		t.Fatalf("tombstoned tag %d fqn = %q, want %q", tagID, tag.Fqn, fqn)
	}
	if tag.TombstonedAt == nil {
		t.Fatalf("tag %d tombstoned_at = nil, want timestamp", tagID)
	}
}
