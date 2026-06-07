package apptest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/mishamsk/mina/internal/httpclient"
)

// Int64SlicePtr returns a pointer to values.
func Int64SlicePtr(values ...int64) *[]int64 {
	copied := append([]int64{}, values...)
	return &copied
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
