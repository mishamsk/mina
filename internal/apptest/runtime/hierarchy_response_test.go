package runtime_test

import (
	"bytes"
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/httpclient"
)

func TestHierarchyRootResponsesEncodeNullParentFQN(t *testing.T) {
	client := newSharedClient(t)

	currency := "USD"
	account, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:      "cash",
		Currency: &currency,
	})
	if err != nil {
		t.Fatalf("account create request: %v", err)
	}
	if account.StatusCode() != http.StatusCreated {
		t.Fatalf("account create status = %d, want %d; body %s", account.StatusCode(), http.StatusCreated, account.Body)
	}
	assertRawParentFQNNull(t, account.Body)

	category, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn: "Food",
	})
	if err != nil {
		t.Fatalf("category create request: %v", err)
	}
	if category.StatusCode() != http.StatusCreated {
		t.Fatalf("category create status = %d, want %d; body %s", category.StatusCode(), http.StatusCreated, category.Body)
	}
	assertRawParentFQNNull(t, category.Body)

	tag, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn: "Trips",
	})
	if err != nil {
		t.Fatalf("tag create request: %v", err)
	}
	if tag.StatusCode() != http.StatusCreated {
		t.Fatalf("tag create status = %d, want %d; body %s", tag.StatusCode(), http.StatusCreated, tag.Body)
	}
	assertRawParentFQNNull(t, tag.Body)
}

func assertRawParentFQNNull(t *testing.T, rawBody []byte) {
	t.Helper()

	if !bytes.Contains(rawBody, []byte(`"parent_fqn":null`)) {
		t.Fatalf("raw body missing parent_fqn null: %s", rawBody)
	}
}
