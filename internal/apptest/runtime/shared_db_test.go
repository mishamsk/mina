package runtime_test

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/store"
)

var sharedProcessDB *sql.DB

func TestMain(m *testing.M) {
	db, err := store.OpenInMemory(context.Background())
	if err != nil {
		panic(err)
	}
	sharedProcessDB = db
	code := m.Run()
	if err := db.Close(); err != nil && code == 0 {
		panic(err)
	}
	os.Exit(code)
}

// newSharedClient creates a test app on the package-wide DuckDB process handle.
// The client still gets a unique accounting schema unless the caller overrides it.
func newSharedClient(t *testing.T, options ...apptest.Option) *apptest.Client {
	t.Helper()

	options = append([]apptest.Option{apptest.WithProcessDB(sharedProcessDB)}, options...)
	return apptest.New(t, options...)
}
