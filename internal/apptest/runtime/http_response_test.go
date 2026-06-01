package runtime_test

import "testing"

func requireNoTransportError(t *testing.T, operation string, err error) {
	t.Helper()

	if err != nil {
		t.Fatalf("%s request: %v", operation, err)
	}
}
