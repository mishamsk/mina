package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"mina.local/mina/internal/httpapi/openapi"
)

const accountCreditLimitHistorySuffix = "/credit-limit-history"

type strictJSONFieldsContextKey struct{}

type jsonFieldState int

const (
	jsonFieldMissing jsonFieldState = iota
	jsonFieldNull
	jsonFieldValue
)

func strictJSONBodyValidator(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		allowed, ok := strictJSONBodyFields(r.Method, r.URL.Path)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			WriteAPIError(w, http.StatusBadRequest, openapi.APIErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))

		fields, valid := validateStrictJSONBody(body, allowed)
		if !valid {
			WriteAPIError(w, http.StatusBadRequest, openapi.APIErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		ctx := context.WithValue(r.Context(), strictJSONFieldsContextKey{}, fields)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func validateStrictJSONBody(body []byte, allowed map[string]struct{}) (map[string]jsonFieldState, bool) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	var raw map[string]json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		return nil, false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return nil, false
	}
	for name := range raw {
		if _, ok := allowed[name]; !ok {
			return nil, false
		}
	}
	if records, ok := raw["records"]; ok && !validateTransactionRecordFields(records) {
		return nil, false
	}

	fields := make(map[string]jsonFieldState, len(raw))
	for name, value := range raw {
		fields[name] = jsonFieldValue
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			fields[name] = jsonFieldNull
		}
	}

	return fields, true
}

func jsonFieldStateFromContext(ctx context.Context, name string) jsonFieldState {
	fields, ok := ctx.Value(strictJSONFieldsContextKey{}).(map[string]jsonFieldState)
	if !ok {
		return jsonFieldMissing
	}
	state, ok := fields[name]
	if !ok {
		return jsonFieldMissing
	}

	return state
}

func validateTransactionRecordFields(records json.RawMessage) bool {
	var rawRecords []map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(records))
	if err := decoder.Decode(&rawRecords); err != nil {
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return false
	}
	allowed := fieldSet(
		"account_id",
		"member_id",
		"currency",
		"amount",
		"amount_usd",
		"category_id",
		"tag_ids",
		"memo",
		"pending_date",
		"posted_date",
		"posting_status",
		"reconciliation_status",
		"source",
		"external_id",
		"external_system",
	)
	for _, record := range rawRecords {
		for name := range record {
			if _, ok := allowed[name]; !ok {
				return false
			}
		}
	}

	return true
}

func strictJSONBodyFields(method string, path string) (map[string]struct{}, bool) {
	switch {
	case method == http.MethodPost && path == "/accounts":
		return fieldSet("fqn", "is_hidden", "currency", "external_id", "external_system"), true
	case method == http.MethodPatch && resourceIDPath(path, "/accounts/"):
		return fieldSet("is_hidden", "external_id", "external_system"), true
	case method == http.MethodPost && path == "/categories":
		return fieldSet("fqn", "is_hidden"), true
	case method == http.MethodPatch && resourceIDPath(path, "/categories/"):
		return fieldSet("is_hidden"), true
	case method == http.MethodPost && path == "/tags":
		return fieldSet("fqn", "is_hidden"), true
	case method == http.MethodPatch && resourceIDPath(path, "/tags/"):
		return fieldSet("is_hidden"), true
	case method == http.MethodPost && path == "/members":
		return fieldSet("name"), true
	case method == http.MethodPatch && resourceIDPath(path, "/members/"):
		return fieldSet("name"), true
	case method == http.MethodPost && accountCreditLimitHistoryPath(path):
		return fieldSet("credit_limit", "effective_date"), true
	case method == http.MethodPost && path == "/exchange-rates":
		return fieldSet("from_currency", "to_currency", "rate", "effective_date"), true
	case method == http.MethodPatch && resourceIDPath(path, "/exchange-rates/"):
		return fieldSet("rate"), true
	case method == http.MethodPost && path == "/transactions":
		return fieldSet("initiated_date", "records"), true
	case method == http.MethodPut && resourceIDPath(path, "/transactions/"):
		return fieldSet("initiated_date", "records"), true
	case method == http.MethodPost && path == "/records/bulk/category":
		return fieldSet("record_ids", "category_id"), true
	case method == http.MethodPost && path == "/records/bulk/tags":
		return fieldSet("record_ids", "add_tag_ids", "remove_tag_ids"), true
	case method == http.MethodPost && path == "/records/bulk/account":
		return fieldSet("record_ids", "account_id"), true
	case method == http.MethodPost && path == "/records/bulk/status":
		return fieldSet("record_ids", "posting_status", "reconciliation_status"), true
	default:
		return nil, false
	}
}

func fieldSet(names ...string) map[string]struct{} {
	fields := make(map[string]struct{}, len(names))
	for _, name := range names {
		fields[name] = struct{}{}
	}

	return fields
}

func accountCreditLimitHistoryPath(path string) bool {
	rawID := strings.TrimPrefix(path, "/accounts/")
	if rawID == path || !strings.HasSuffix(rawID, accountCreditLimitHistorySuffix) {
		return false
	}
	rawID = strings.TrimSuffix(rawID, accountCreditLimitHistorySuffix)

	return rawID != "" && !strings.Contains(rawID, "/")
}
