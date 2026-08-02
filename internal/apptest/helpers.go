package apptest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"testing"

	"github.com/mishamsk/mina/internal/httpclient"
)

// PostedSettlement returns settlement intent for a posted balance record.
func PostedSettlement() *httpclient.SettlementIntent {
	return &httpclient.SettlementIntent{Status: httpclient.SettlementStatusPosted}
}

// PendingSettlement returns settlement intent for a pending balance record.
func PendingSettlement() *httpclient.SettlementIntent {
	return &httpclient.SettlementIntent{Status: httpclient.SettlementStatusPending}
}

// AssertTransactionLifecycle verifies the transaction and its records share a lifecycle status.
func AssertTransactionLifecycle(t *testing.T, transaction *httpclient.Transaction, want httpclient.TransactionLifecycleStatus) {
	t.Helper()

	if transaction.LifecycleStatus != want {
		t.Fatalf("transaction lifecycle_status = %q, want %q", transaction.LifecycleStatus, want)
	}
	for _, record := range transaction.Records {
		if record.LifecycleStatus != want {
			t.Fatalf("record %d lifecycle_status = %q, want %q", record.RecordId, record.LifecycleStatus, want)
		}
	}
}

// Int64SlicePtr returns a pointer to values.
func Int64SlicePtr(values ...int64) *[]int64 {
	copied := append([]int64{}, values...)
	return &copied
}

// Int64Ptr returns a pointer to value.
func Int64Ptr(value int64) *int64 {
	return &value
}

// StringPtr returns a pointer to value.
func StringPtr(value string) *string {
	return &value
}

// FormatID formats a numeric API identifier for path or query construction.
func FormatID(id int64) string {
	return strconv.FormatInt(id, 10)
}

// ReplaceRawQuery replaces the generated request query string.
func ReplaceRawQuery(rawQuery string) httpclient.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		req.URL.RawQuery = rawQuery
		return nil
	}
}

// JSONReader returns a JSON body reader for generated arbitrary-body methods.
func JSONReader(body any) *bytes.Reader {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(body); err != nil {
		panic(fmt.Sprintf("encode JSON body: %v", err))
	}
	return bytes.NewReader(buf.Bytes())
}
