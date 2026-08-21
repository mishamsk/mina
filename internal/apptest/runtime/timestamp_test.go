package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestPersistedTimestampRoundTripDoesNotShiftWithDuckDBTimeZone(t *testing.T) {
	ctx := context.Background()
	utcClient := apptest.New(t, apptest.WithDuckDBTimeZone("UTC"))

	first, err := utcClient.REST().CreateTagWithResponse(ctx, httpclient.CreateTagRequest{Fqn: "Timezone:UTC"})
	requireClientResponse(t, "create tag in UTC", err, first.StatusCode(), http.StatusCreated, first.Body)

	newYorkClient := apptest.New(t, apptest.WithDuckDBTimeZone("America/New_York"))
	second, err := newYorkClient.REST().CreateTagWithResponse(ctx, httpclient.CreateTagRequest{Fqn: "Timezone:NewYork"})
	requireClientResponse(t, "create tag in New York", err, second.StatusCode(), http.StatusCreated, second.Body)

	read, err := newYorkClient.REST().GetTagWithResponse(ctx, second.JSON201.TagId, nil)
	requireClientResponse(t, "read tag created in New York", err, read.StatusCode(), http.StatusOK, read.Body)
	if read.JSON200.CreatedAt.Before(first.JSON201.CreatedAt) {
		t.Fatalf("later New York created_at = %s, before earlier UTC created_at %s", read.JSON200.CreatedAt, first.JSON201.CreatedAt)
	}
}
