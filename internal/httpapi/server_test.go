package httpapi_test

import (
	"context"
	"testing"

	"mina/internal/api"
	"mina/internal/apitest"
	"mina/internal/app"
)

func TestItemsViaGeneratedClientInProcess(t *testing.T) {
	t.Parallel()

	client := newTestClient(t)
	ctx := context.Background()

	empty, err := client.ListItemsWithResponse(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if empty.StatusCode() != 200 {
		t.Fatalf("list status = %d, want 200", empty.StatusCode())
	}
	if len(empty.JSON200.Items) != 0 {
		t.Fatalf("initial item count = %d, want 0", len(empty.JSON200.Items))
	}

	note := "first fixture"
	created := createItem(t, client, "alpha", &note)
	if created.Id == 0 {
		t.Fatal("created item id is zero")
	}
	if created.Name != "alpha" || created.Note == nil || *created.Note != note {
		t.Fatalf("created item mismatch: %+v", created)
	}

	got, err := client.GetItemWithResponse(ctx, created.Id)
	if err != nil {
		t.Fatal(err)
	}
	if got.StatusCode() != 200 {
		t.Fatalf("get status = %d, want 200", got.StatusCode())
	}
	if got.JSON200.Id != created.Id || got.JSON200.Name != "alpha" {
		t.Fatalf("get item mismatch: %+v", got.JSON200)
	}

	listed, err := client.ListItemsWithResponse(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if listed.StatusCode() != 200 {
		t.Fatalf("list status = %d, want 200", listed.StatusCode())
	}
	if len(listed.JSON200.Items) != 1 || listed.JSON200.Items[0].Id != created.Id {
		t.Fatalf("listed items mismatch: %+v", listed.JSON200.Items)
	}

	deleted, err := client.DeleteItemWithResponse(ctx, created.Id)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.StatusCode() != 204 {
		t.Fatalf("delete status = %d, want 204", deleted.StatusCode())
	}

	missing, err := client.GetItemWithResponse(ctx, created.Id)
	if err != nil {
		t.Fatal(err)
	}
	if missing.StatusCode() != 404 {
		t.Fatalf("missing status = %d, want 404", missing.StatusCode())
	}
	if missing.JSON404 == nil || missing.JSON404.Code != "item_not_found" {
		t.Fatalf("missing error mismatch: %+v", missing.JSON404)
	}
}

func TestCreateItemValidationViaGeneratedClientInProcess(t *testing.T) {
	t.Parallel()

	client := newTestClient(t)
	resp, err := client.CreateItemWithResponse(context.Background(), api.CreateItemRequest{Name: "   "})
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode() != 400 {
		t.Fatalf("status = %d, want 400", resp.StatusCode())
	}
	if resp.JSON400 == nil || resp.JSON400.Code != "invalid_request" {
		t.Fatalf("error body mismatch: %+v", resp.JSON400)
	}
}

func newTestClient(t *testing.T) *api.ClientWithResponses {
	t.Helper()

	application, err := app.New(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := application.Close(); err != nil {
			t.Fatal(err)
		}
	})

	client, err := apitest.NewClient(application.Handler)
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func createItem(t *testing.T, client *api.ClientWithResponses, name string, note *string) api.Item {
	t.Helper()

	resp, err := client.CreateItemWithResponse(context.Background(), api.CreateItemRequest{
		Name: name,
		Note: note,
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode() != 201 {
		t.Fatalf("create status = %d, want 201; body=%s", resp.StatusCode(), string(resp.Body))
	}
	if resp.JSON201 == nil {
		t.Fatal("create response JSON201 is nil")
	}
	return *resp.JSON201
}
