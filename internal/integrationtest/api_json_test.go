package integrationtest

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mina/internal/app"
)

func TestLiveServerCreateAndFetchJSON(t *testing.T) {
	t.Parallel()

	application, err := app.New(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := application.Close(); err != nil {
			t.Fatal(err)
		}
	})

	server := httptest.NewServer(application.Handler)
	t.Cleanup(server.Close)

	createBody := bytes.NewBufferString(`{"name":"live","note":"over http"}`)
	createResp, err := http.Post(server.URL+"/v1/items", "application/json", createBody)
	if err != nil {
		t.Fatal(err)
	}
	defer createResp.Body.Close()
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("create status = %d, want 201", createResp.StatusCode)
	}

	var created struct {
		ID   int64   `json:"id"`
		Name string  `json:"name"`
		Note *string `json:"note"`
	}
	if err := json.NewDecoder(createResp.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if created.ID == 0 || created.Name != "live" || created.Note == nil || *created.Note != "over http" {
		t.Fatalf("created JSON mismatch: %+v", created)
	}

	getResp, err := http.Get(server.URL + "/v1/items/1")
	if err != nil {
		t.Fatal(err)
	}
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("get status = %d, want 200", getResp.StatusCode)
	}

	var fetched map[string]any
	if err := json.NewDecoder(getResp.Body).Decode(&fetched); err != nil {
		t.Fatal(err)
	}
	if fetched["name"] != "live" {
		t.Fatalf("fetched JSON mismatch: %+v", fetched)
	}
}
