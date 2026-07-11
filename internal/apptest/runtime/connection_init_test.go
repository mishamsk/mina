package runtime_test

import (
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
)

func TestAppDBInitializesPooledConnectionsWithAccountingSchema(t *testing.T) {
	apptest.AssertRecurringMaterializationUsesSecondPooledConnection(t)
}
