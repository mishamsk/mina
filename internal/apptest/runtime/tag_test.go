package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
	"github.com/oapi-codegen/nullable"
)

func TestTagCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	created, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "Trips:Vacation",
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertTagHierarchy(t, *created.JSON201, "Trips", "Vacation", 1)

	read, err := client.REST().GetTagWithResponse(context.Background(), created.JSON201.TagId, nil)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.TagId != created.JSON201.TagId {
		t.Fatalf("read tag id = %d, want %d", read.JSON200.TagId, created.JSON201.TagId)
	}

	hiddenValue := true
	hidden, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      "Trips:Planning",
		IsHidden: &hiddenValue,
	})
	if err != nil {
		t.Fatalf("hidden create request: %v", err)
	}
	if hidden.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden create status = %d, want %d; body %s", hidden.StatusCode(), http.StatusCreated, hidden.Body)
	}

	defaultList, err := client.REST().ListTagsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default list request: %v", err)
	}
	if defaultList.StatusCode() != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode(), http.StatusOK, defaultList.Body)
	}
	assertTagIDs(t, defaultList.JSON200.Tags, []int64{created.JSON201.TagId})
	if defaultList.JSON200.TotalCount != 1 {
		t.Fatalf("default tag total_count = %d, want 1", defaultList.JSON200.TotalCount)
	}

	includeHidden, err := client.REST().ListTagsWithResponse(context.Background(), &httpclient.ListTagsParams{IncludeHidden: &hiddenValue})
	if err != nil {
		t.Fatalf("include hidden request: %v", err)
	}
	if includeHidden.StatusCode() != http.StatusOK {
		t.Fatalf("include hidden status = %d, want %d; body %s", includeHidden.StatusCode(), http.StatusOK, includeHidden.Body)
	}
	assertTagIDs(t, includeHidden.JSON200.Tags, []int64{hidden.JSON201.TagId, created.JSON201.TagId})
	if includeHidden.JSON200.TotalCount != 2 {
		t.Fatalf("include hidden tag total_count = %d, want 2", includeHidden.JSON200.TotalCount)
	}

	updated, err := client.REST().UpdateTagWithResponse(context.Background(), created.JSON201.TagId, httpclient.UpdateTagRequest{
		IsHidden: &hiddenValue,
	})
	if err != nil {
		t.Fatalf("update request: %v", err)
	}
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if !updated.JSON200.IsHidden {
		t.Fatal("updated tag hidden = false, want true")
	}

	afterHide, err := client.REST().ListTagsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("after hide list request: %v", err)
	}
	if afterHide.StatusCode() != http.StatusOK {
		t.Fatalf("after hide list status = %d, want %d; body %s", afterHide.StatusCode(), http.StatusOK, afterHide.Body)
	}
	assertTagIDs(t, afterHide.JSON200.Tags, nil)
	if afterHide.JSON200.TotalCount != 0 {
		t.Fatalf("after hide tag total_count = %d, want 0", afterHide.JSON200.TotalCount)
	}

	visibleDeleted, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "Trips:Archive",
	})
	if err != nil {
		t.Fatalf("visible delete create request: %v", err)
	}
	if visibleDeleted.StatusCode() != http.StatusCreated {
		t.Fatalf("visible delete create status = %d, want %d; body %s", visibleDeleted.StatusCode(), http.StatusCreated, visibleDeleted.Body)
	}
	visibleDelete, err := client.REST().DeleteTagWithResponse(context.Background(), visibleDeleted.JSON201.TagId)
	if err != nil {
		t.Fatalf("visible delete request: %v", err)
	}
	if visibleDelete.StatusCode() != http.StatusNoContent {
		t.Fatalf("visible delete status = %d, want %d; body %s", visibleDelete.StatusCode(), http.StatusNoContent, visibleDelete.Body)
	}
	defaultAfterVisibleDelete, err := client.REST().ListTagsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default after visible delete request: %v", err)
	}
	if defaultAfterVisibleDelete.StatusCode() != http.StatusOK {
		t.Fatalf("default after visible delete status = %d, want %d; body %s", defaultAfterVisibleDelete.StatusCode(), http.StatusOK, defaultAfterVisibleDelete.Body)
	}
	assertTagIDs(t, defaultAfterVisibleDelete.JSON200.Tags, nil)

	deleted, err := client.REST().DeleteTagWithResponse(context.Background(), hidden.JSON201.TagId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	missing, err := client.REST().GetTagWithResponse(context.Background(), hidden.JSON201.TagId, nil)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	includeTombstoned := true
	deletedRead, err := client.REST().GetTagWithResponse(context.Background(), hidden.JSON201.TagId, &httpclient.GetTagParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("get deleted with tombstones request: %v", err)
	}
	if deletedRead.StatusCode() != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode(), http.StatusOK, deletedRead.Body)
	}
	if deletedRead.JSON200.TombstonedAt == nil {
		t.Fatal("get deleted with tombstones tombstoned_at = nil, want timestamp")
	}

	withTombstones, err := client.REST().ListTagsWithResponse(context.Background(), &httpclient.ListTagsParams{
		IncludeHidden:     &hiddenValue,
		IncludeTombstoned: &includeTombstoned,
	})
	if err != nil {
		t.Fatalf("include tombstones request: %v", err)
	}
	if withTombstones.StatusCode() != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode(), http.StatusOK, withTombstones.Body)
	}
	assertTagIDs(t, withTombstones.JSON200.Tags, []int64{visibleDeleted.JSON201.TagId, hidden.JSON201.TagId, created.JSON201.TagId})
	if withTombstones.JSON200.Tags[0].TombstonedAt == nil {
		t.Fatal("deleted tag tombstoned_at = nil, want timestamp")
	}
}

func TestTagDisplayLabelsBoundary(t *testing.T) {
	client := newSharedClient(t)
	ctx := context.Background()
	explicitLabel := "Weekend routine"

	one, err := client.REST().CreateTagWithResponse(ctx, httpclient.CreateTagRequest{Fqn: "StandaloneTag"})
	requireClientResponse(t, "create one-segment tag label", err, one.StatusCode(), http.StatusCreated, one.Body)
	if one.JSON201.DisplayLabel != "StandaloneTag" || one.JSON201.DisplayLabelOverride != nil {
		t.Fatalf("one-segment tag labels = %q/%v", one.JSON201.DisplayLabel, one.JSON201.DisplayLabelOverride)
	}

	explicit, err := client.REST().CreateTagWithResponse(ctx, httpclient.CreateTagRequest{Fqn: "Household:Routine:Weekly", DisplayLabel: &explicitLabel})
	requireClientResponse(t, "create explicit tag label", err, explicit.StatusCode(), http.StatusCreated, explicit.Body)
	if explicit.JSON201.DisplayLabel != explicitLabel || explicit.JSON201.DisplayLabelOverride == nil || *explicit.JSON201.DisplayLabelOverride != explicitLabel || explicit.JSON201.Name != "Weekly" {
		t.Fatalf("explicit tag labels = %+v", explicit.JSON201)
	}
	automatic, err := client.REST().CreateTagWithResponse(ctx, httpclient.CreateTagRequest{Fqn: "Household:Routine:Daily"})
	requireClientResponse(t, "create automatic tag label", err, automatic.StatusCode(), http.StatusCreated, automatic.Body)

	listed, err := client.REST().ListTagsWithResponse(ctx, nil)
	requireClientResponse(t, "list tag labels", err, listed.StatusCode(), http.StatusOK, listed.Body)
	found := false
	for _, tag := range listed.JSON200.Tags {
		if tag.TagId == explicit.JSON201.TagId {
			found = tag.DisplayLabel == explicitLabel && tag.DisplayLabelOverride != nil
		}
	}
	if !found {
		t.Fatal("explicit tag display label missing from list")
	}

	updatedLabel := "Weekly household"
	updated, err := client.REST().UpdateTagWithResponse(ctx, explicit.JSON201.TagId, httpclient.UpdateTagRequest{DisplayLabel: nullable.NewNullableWithValue(updatedLabel)})
	requireClientResponse(t, "update tag label", err, updated.StatusCode(), http.StatusOK, updated.Body)
	if updated.JSON200.DisplayLabel != updatedLabel {
		t.Fatalf("updated tag display_label = %q", updated.JSON200.DisplayLabel)
	}

	res := restructureTags(t, client, "Household:Routine", "Household:Cadence")
	if res.JSON200.MovedCount != 2 {
		t.Fatalf("tag restructure count = %d", res.JSON200.MovedCount)
	}
	read, err := client.REST().GetTagWithResponse(ctx, explicit.JSON201.TagId, nil)
	requireClientResponse(t, "read restructured tag label", err, read.StatusCode(), http.StatusOK, read.Body)
	if read.JSON200.DisplayLabel != updatedLabel || read.JSON200.DisplayLabelOverride == nil || *read.JSON200.DisplayLabelOverride != updatedLabel {
		t.Fatalf("restructured tag override = %+v", read.JSON200)
	}
	automaticRead, err := client.REST().GetTagWithResponse(ctx, automatic.JSON201.TagId, nil)
	requireClientResponse(t, "read restructured automatic tag label", err, automaticRead.StatusCode(), http.StatusOK, automaticRead.Body)
	if automaticRead.JSON200.DisplayLabel != "Cadence:Daily" {
		t.Fatalf("restructured tag fallback = %q", automaticRead.JSON200.DisplayLabel)
	}

	cleared, err := client.REST().UpdateTagWithResponse(ctx, explicit.JSON201.TagId, httpclient.UpdateTagRequest{DisplayLabel: nullable.NewNullNullable[string]()})
	requireClientResponse(t, "clear tag label", err, cleared.StatusCode(), http.StatusOK, cleared.Body)
	if cleared.JSON200.DisplayLabel != "Cadence:Weekly" || cleared.JSON200.DisplayLabelOverride != nil {
		t.Fatalf("cleared tag labels = %q/%v", cleared.JSON200.DisplayLabel, cleared.JSON200.DisplayLabelOverride)
	}

	invalid := " padded "
	rejected, err := client.REST().UpdateTagWithResponse(ctx, explicit.JSON201.TagId, httpclient.UpdateTagRequest{DisplayLabel: nullable.NewNullableWithValue(invalid)})
	requireNoTransportError(t, "reject tag label whitespace", err)
	if rejected.StatusCode() != http.StatusBadRequest || rejected.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid tag label response = %d %+v", rejected.StatusCode(), rejected.JSON400)
	}
}

func TestTagRejectsDuplicateActiveFQN(t *testing.T) {
	client := newSharedClient(t)

	first, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "Tax:Medical",
	})
	if err != nil {
		t.Fatalf("first create request: %v", err)
	}
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	duplicate, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "Tax:Medical",
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

	deleted, err := client.REST().DeleteTagWithResponse(context.Background(), first.JSON201.TagId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	recreated, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "Tax:Medical",
	})
	if err != nil {
		t.Fatalf("recreate request: %v", err)
	}
	if recreated.StatusCode() != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode(), http.StatusCreated, recreated.Body)
	}
}

func TestTagRejectsHierarchyFQNConflict(t *testing.T) {
	client := newSharedClient(t)

	leaf, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "HierarchyTag:Leaf",
	})
	if err != nil {
		t.Fatalf("leaf create request: %v", err)
	}
	if leaf.StatusCode() != http.StatusCreated {
		t.Fatalf("leaf create status = %d, want %d; body %s", leaf.StatusCode(), http.StatusCreated, leaf.Body)
	}

	extendsLeaf, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "HierarchyTag:Leaf:Child",
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

	child, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "HierarchyTag:Group:Child",
	})
	if err != nil {
		t.Fatalf("child create request: %v", err)
	}
	if child.StatusCode() != http.StatusCreated {
		t.Fatalf("child create status = %d, want %d; body %s", child.StatusCode(), http.StatusCreated, child.Body)
	}

	prefixesChild, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "HierarchyTag:Group",
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

func TestTagAllowsHierarchyLookalikeBoundary(t *testing.T) {
	client := newSharedClient(t)

	leaf, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "HierarchyTagLookalike:Leaf",
	})
	if err != nil {
		t.Fatalf("leaf create request: %v", err)
	}
	if leaf.StatusCode() != http.StatusCreated {
		t.Fatalf("leaf create status = %d, want %d; body %s", leaf.StatusCode(), http.StatusCreated, leaf.Body)
	}

	lookalike, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "HierarchyTagLookalike:Leafish:Child",
	})
	if err != nil {
		t.Fatalf("lookalike create request: %v", err)
	}
	if lookalike.StatusCode() != http.StatusCreated {
		t.Fatalf("lookalike create status = %d, want %d; body %s", lookalike.StatusCode(), http.StatusCreated, lookalike.Body)
	}
}

func TestTagAllowsHierarchyPrefixReuseAfterTombstone(t *testing.T) {
	client := newSharedClient(t)

	leaf, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "TombstonedTagHierarchy:Leaf",
	})
	if err != nil {
		t.Fatalf("leaf create request: %v", err)
	}
	if leaf.StatusCode() != http.StatusCreated {
		t.Fatalf("leaf create status = %d, want %d; body %s", leaf.StatusCode(), http.StatusCreated, leaf.Body)
	}
	deleteTag(t, client, leaf.JSON201.TagId)

	childAfterDeletedLeaf, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "TombstonedTagHierarchy:Leaf:Child",
	})
	if err != nil {
		t.Fatalf("child after deleted leaf request: %v", err)
	}
	if childAfterDeletedLeaf.StatusCode() != http.StatusCreated {
		t.Fatalf("child after deleted leaf status = %d, want %d; body %s", childAfterDeletedLeaf.StatusCode(), http.StatusCreated, childAfterDeletedLeaf.Body)
	}

	child, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "TombstonedTagHierarchy:Group:Child",
	})
	if err != nil {
		t.Fatalf("child create request: %v", err)
	}
	if child.StatusCode() != http.StatusCreated {
		t.Fatalf("child create status = %d, want %d; body %s", child.StatusCode(), http.StatusCreated, child.Body)
	}
	deleteTag(t, client, child.JSON201.TagId)

	parentAfterDeletedChild, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "TombstonedTagHierarchy:Group",
	})
	if err != nil {
		t.Fatalf("parent after deleted child request: %v", err)
	}
	if parentAfterDeletedChild.StatusCode() != http.StatusCreated {
		t.Fatalf("parent after deleted child status = %d, want %d; body %s", parentAfterDeletedChild.StatusCode(), http.StatusCreated, parentAfterDeletedChild.Body)
	}
}

func TestTagValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	invalid, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "Tax::Medical",
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
	literalScopeMarker, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "Tax:*",
	})
	if err != nil {
		t.Fatalf("literal scope-marker request: %v", err)
	}
	if literalScopeMarker.StatusCode() != http.StatusCreated {
		t.Fatalf("literal scope-marker status = %d, want %d; body %s", literalScopeMarker.StatusCode(), http.StatusCreated, literalScopeMarker.Body)
	}

	badQuery, err := client.REST().ListTagsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_hidden=maybe"))
	if err != nil {
		t.Fatalf("bad query request: %v", err)
	}
	if badQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode(), http.StatusBadRequest, badQuery.Body)
	}

	emptyQuery, err := client.REST().ListTagsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_hidden="))
	if err != nil {
		t.Fatalf("empty query request: %v", err)
	}
	if emptyQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("empty query status = %d, want %d; body %s", emptyQuery.StatusCode(), http.StatusBadRequest, emptyQuery.Body)
	}

	emptyUpdate, err := client.REST().UpdateTagWithBodyWithResponse(context.Background(), 1, "application/json", apptest.JSONReader(map[string]any{}))
	if err != nil {
		t.Fatalf("empty update request: %v", err)
	}
	if emptyUpdate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("empty update status = %d, want %d; body %s", emptyUpdate.StatusCode(), http.StatusBadRequest, emptyUpdate.Body)
	}

	unexpectedField, err := client.REST().UpdateTagWithBodyWithResponse(context.Background(), 1, "application/json", apptest.JSONReader(map[string]string{
		"fqn": "Other",
	}))
	if err != nil {
		t.Fatalf("unexpected field request: %v", err)
	}
	if unexpectedField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unexpected field status = %d, want %d; body %s", unexpectedField.StatusCode(), http.StatusBadRequest, unexpectedField.Body)
	}

	extraField, err := client.REST().CreateTagWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":        "Tax:Medical",
		"extraField": true,
	}))
	if err != nil {
		t.Fatalf("extra field request: %v", err)
	}
	if extraField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode(), http.StatusBadRequest, extraField.Body)
	}
}

func assertTagHierarchy(t *testing.T, tag httpclient.Tag, parent string, name string, level int) {
	t.Helper()

	if tag.ParentFqn == nil || *tag.ParentFqn != parent {
		t.Fatalf("parent_fqn = %v, want %q", tag.ParentFqn, parent)
	}
	if tag.Name != name {
		t.Fatalf("name = %q, want %q", tag.Name, name)
	}
	if tag.Level != level {
		t.Fatalf("level = %d, want %d", tag.Level, level)
	}
}

func assertTagIDs(t *testing.T, tags []httpclient.Tag, want []int64) {
	t.Helper()

	if len(tags) != len(want) {
		t.Fatalf("tag count = %d, want %d; tags = %+v", len(tags), len(want), tags)
	}
	for i, tag := range tags {
		if tag.TagId != want[i] {
			t.Fatalf("tag id at %d = %d, want %d; tags = %+v", i, tag.TagId, want[i], tags)
		}
	}
}

func TestTagFeaturedBoundary(t *testing.T) {
	client := newSharedClient(t)

	featured := true
	unfeatured := false
	defaultTag, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: "FeaturedTag:Default"})
	if err != nil {
		t.Fatalf("default create request: %v", err)
	}
	if defaultTag.StatusCode() != http.StatusCreated {
		t.Fatalf("default create status = %d, want %d; body %s", defaultTag.StatusCode(), http.StatusCreated, defaultTag.Body)
	}
	if defaultTag.JSON201.IsFeatured {
		t.Fatal("default tag featured = true, want false")
	}

	featuredTag, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:        "FeaturedTag:Explicit",
		IsFeatured: &featured,
	})
	if err != nil {
		t.Fatalf("featured create request: %v", err)
	}
	if featuredTag.StatusCode() != http.StatusCreated {
		t.Fatalf("featured create status = %d, want %d; body %s", featuredTag.StatusCode(), http.StatusCreated, featuredTag.Body)
	}
	if !featuredTag.JSON201.IsFeatured {
		t.Fatal("featured tag featured = false, want true")
	}

	featuredOnly, err := client.REST().ListTagsWithResponse(context.Background(), &httpclient.ListTagsParams{IsFeatured: &featured})
	if err != nil {
		t.Fatalf("featured list request: %v", err)
	}
	if featuredOnly.StatusCode() != http.StatusOK {
		t.Fatalf("featured list status = %d, want %d; body %s", featuredOnly.StatusCode(), http.StatusOK, featuredOnly.Body)
	}
	assertTagIDs(t, featuredOnly.JSON200.Tags, []int64{featuredTag.JSON201.TagId})

	unfeaturedOnly, err := client.REST().ListTagsWithResponse(context.Background(), &httpclient.ListTagsParams{IsFeatured: &unfeatured})
	if err != nil {
		t.Fatalf("unfeatured list request: %v", err)
	}
	if unfeaturedOnly.StatusCode() != http.StatusOK {
		t.Fatalf("unfeatured list status = %d, want %d; body %s", unfeaturedOnly.StatusCode(), http.StatusOK, unfeaturedOnly.Body)
	}
	assertTagIDs(t, unfeaturedOnly.JSON200.Tags, []int64{defaultTag.JSON201.TagId})

	updated, err := client.REST().UpdateTagWithResponse(context.Background(), defaultTag.JSON201.TagId, httpclient.UpdateTagRequest{IsFeatured: &featured})
	if err != nil {
		t.Fatalf("feature update request: %v", err)
	}
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("feature update status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if !updated.JSON200.IsFeatured || updated.JSON200.IsHidden {
		t.Fatalf("feature update = %+v, want featured visible tag", updated.JSON200)
	}

	unfeaturedUpdate, err := client.REST().UpdateTagWithResponse(context.Background(), defaultTag.JSON201.TagId, httpclient.UpdateTagRequest{IsFeatured: &unfeatured})
	if err != nil {
		t.Fatalf("unfeature update request: %v", err)
	}
	if unfeaturedUpdate.StatusCode() != http.StatusOK {
		t.Fatalf("unfeature update status = %d, want %d; body %s", unfeaturedUpdate.StatusCode(), http.StatusOK, unfeaturedUpdate.Body)
	}
	if unfeaturedUpdate.JSON200.IsFeatured {
		t.Fatal("unfeatured tag featured = true, want false")
	}
	read, err := client.REST().GetTagWithResponse(context.Background(), defaultTag.JSON201.TagId, nil)
	if err != nil {
		t.Fatalf("unfeatured read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK || read.JSON200.IsFeatured {
		t.Fatalf("unfeatured read = status %d body %+v, want persisted unfeatured tag", read.StatusCode(), read.JSON200)
	}
}
