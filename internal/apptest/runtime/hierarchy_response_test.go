package runtime_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	models "github.com/mishamsk/mina/internal/httpapi/openapi"
)

func TestHierarchyRootResponsesEncodeNullParentFQN(t *testing.T) {
	client := newClient(t)

	account := apptest.Decode[models.Account](client, http.MethodPost, "/accounts", models.CreateAccountRequest{
		Fqn:      "cash",
		Currency: apptest.StringPtr("USD"),
	})
	if account.StatusCode != http.StatusCreated {
		t.Fatalf("account create status = %d, want %d; body %s", account.StatusCode, http.StatusCreated, account.RawBody)
	}
	assertRawParentFQNNull(t, account.RawBody)

	category := apptest.Decode[models.Category](client, http.MethodPost, "/categories", models.CreateCategoryRequest{
		Fqn: "Food",
	})
	if category.StatusCode != http.StatusCreated {
		t.Fatalf("category create status = %d, want %d; body %s", category.StatusCode, http.StatusCreated, category.RawBody)
	}
	assertRawParentFQNNull(t, category.RawBody)

	tag := apptest.Decode[models.Tag](client, http.MethodPost, "/tags", models.CreateTagRequest{
		Fqn: "Trips",
	})
	if tag.StatusCode != http.StatusCreated {
		t.Fatalf("tag create status = %d, want %d; body %s", tag.StatusCode, http.StatusCreated, tag.RawBody)
	}
	assertRawParentFQNNull(t, tag.RawBody)
}

func assertRawParentFQNNull(t *testing.T, rawBody []byte) {
	t.Helper()

	if !bytes.Contains(rawBody, []byte(`"parent_fqn":null`)) {
		t.Fatalf("raw body missing parent_fqn null: %s", rawBody)
	}
}
