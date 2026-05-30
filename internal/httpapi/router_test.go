package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	models "mina.local/mina/internal/httpapi/openapi"
)

func TestRouterWritesAccessLogWhenConfigured(t *testing.T) {
	var log bytes.Buffer
	handler := NewWithOptions(Dependencies{}, Options{AccessLog: &log})
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if entry := log.String(); !strings.Contains(entry, "GET /health 200") {
		t.Fatalf("access log = %q, want GET /health status entry", entry)
	}
}

func TestRouterMethodAndRouteErrorsUseMinaEnvelope(t *testing.T) {
	handler := New(Dependencies{})

	methodResponse := httptest.NewRecorder()
	handler.ServeHTTP(methodResponse, httptest.NewRequest(http.MethodPost, "/health", nil))
	assertMinaError(t, methodResponse, http.StatusMethodNotAllowed, models.APIErrorCodeMethodNotAllowed, "method not allowed")

	routeResponse := httptest.NewRecorder()
	handler.ServeHTTP(routeResponse, httptest.NewRequest(http.MethodGet, "/missing", nil))
	assertMinaError(t, routeResponse, http.StatusNotFound, models.APIErrorCodeNotFound, "route not found")
}

func TestRouterGeneratedBindingErrorsUseParameterMetadataMessages(t *testing.T) {
	handler := New(Dependencies{})

	boolResponse := httptest.NewRecorder()
	handler.ServeHTTP(boolResponse, httptest.NewRequest(http.MethodGet, "/categories?include_hidden=maybe", nil))
	assertMinaError(t, boolResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, `query parameter "include_hidden" has invalid type`)

	emptyBoolResponse := httptest.NewRecorder()
	handler.ServeHTTP(emptyBoolResponse, httptest.NewRequest(http.MethodGet, "/categories?include_hidden=", nil))
	assertMinaError(t, emptyBoolResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, `query parameter "include_hidden" must not be empty`)

	duplicateBoolResponse := httptest.NewRecorder()
	handler.ServeHTTP(duplicateBoolResponse, httptest.NewRequest(http.MethodGet, "/categories?include_hidden=true&include_hidden=false", nil))
	assertMinaError(t, duplicateBoolResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, `query parameter "include_hidden" must be provided at most once`)

	emptyGetBoolResponse := httptest.NewRecorder()
	handler.ServeHTTP(emptyGetBoolResponse, httptest.NewRequest(http.MethodGet, "/categories/1?include_tombstoned=", nil))
	assertMinaError(t, emptyGetBoolResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, `query parameter "include_tombstoned" must not be empty`)

	emptyLimitResponse := httptest.NewRecorder()
	handler.ServeHTTP(emptyLimitResponse, httptest.NewRequest(http.MethodGet, "/categories?limit=", nil))
	assertMinaError(t, emptyLimitResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, `query parameter "limit" must not be empty`)

	idResponse := httptest.NewRecorder()
	handler.ServeHTTP(idResponse, httptest.NewRequest(http.MethodGet, "/accounts/not-an-id/records", nil))
	assertMinaError(t, idResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, `path parameter "account_id" has invalid type`)

	minimumIDResponse := httptest.NewRecorder()
	handler.ServeHTTP(minimumIDResponse, httptest.NewRequest(http.MethodGet, "/accounts/0/records", nil))
	assertMinaError(t, minimumIDResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, `path parameter "account_id" is invalid: number must be at least 1`)
}

func TestRouterOpenAPIJSONValidationRejectsNullRequiredBool(t *testing.T) {
	handler := New(Dependencies{})
	request := httptest.NewRequest(http.MethodPatch, "/categories/1", strings.NewReader(`{"is_hidden":null}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertMinaError(t, response, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "is_hidden is required")
}

func TestRouterOpenAPIJSONValidationRejectsUnknownTopLevelFields(t *testing.T) {
	handler := New(Dependencies{})
	request := httptest.NewRequest(http.MethodPost, "/members", strings.NewReader(`{"name":"Ada","extra":true}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertMinaError(t, response, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "invalid JSON request body")
}

func TestRouterOpenAPIJSONValidationRejectsNestedUnknownFields(t *testing.T) {
	handler := New(Dependencies{})
	body := `{"initiated_date":"2024-01-01","records":[{"account_id":1,"currency":"USD","amount":"1.00","amount_usd":"1.00","category_id":1,"posting_status":"posted","reconciliation_status":"reconciled","source":"manual","extra":true}]}`
	request := httptest.NewRequest(http.MethodPost, "/transactions", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertMinaError(t, response, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "invalid JSON request body")
}

func TestRouterGeneratedBodyBindingErrorsKeepMinaEnvelope(t *testing.T) {
	handler := New(Dependencies{})
	request := httptest.NewRequest(http.MethodPost, "/members", strings.NewReader(`{"name":123}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertMinaError(t, response, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "invalid JSON request body")
}

func TestRouterOpenAPIValidationErrorsUseMinaEnvelope(t *testing.T) {
	handler := New(Dependencies{})
	request := httptest.NewRequest(http.MethodPost, "/members", strings.NewReader(`{"name":"Ada"}`))
	request.Header.Set("Content-Type", "text/plain")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertMinaError(t, response, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "invalid JSON request body")
}

func TestRouterOpenAPIQueryValidationRejectsUnsupportedQuery(t *testing.T) {
	handler := New(Dependencies{})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/members?include_hidden=true", nil))

	assertMinaError(t, response, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "invalid request")
}

func TestRouterServesEmbeddedOpenAPISpec(t *testing.T) {
	handler := New(Dependencies{})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/openapi.json", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusOK, response.Body.String())
	}
	if contentType := response.Header().Get("Content-Type"); contentType != "application/json" {
		t.Fatalf("content type = %q, want application/json", contentType)
	}
	want, err := models.GetSpecJSON()
	if err != nil {
		t.Fatalf("load embedded OpenAPI spec: %v", err)
	}
	if !bytes.Equal(response.Body.Bytes(), want) {
		t.Fatal("/openapi.json body does not match embedded OpenAPI spec")
	}
}

func TestRouterRecoversPanicsWithMinaEnvelope(t *testing.T) {
	handler := New(Dependencies{})
	registerTestGetRoute(t, handler, "/panic", func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/panic", nil))

	assertMinaError(t, response, http.StatusInternalServerError, models.APIErrorCodeInternalError, "internal server error")
}

func TestRouterTimeoutCancelsRequest(t *testing.T) {
	handler := NewWithOptions(Dependencies{}, Options{Timeout: time.Nanosecond})
	registerTestGetRoute(t, handler, "/slow", func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/slow", nil))

	assertMinaError(t, response, http.StatusGatewayTimeout, models.APIErrorCodeInternalError, "request timed out")
}

func registerTestGetRoute(t *testing.T, handler http.Handler, pattern string, route http.HandlerFunc) {
	t.Helper()

	router, ok := handler.(interface {
		Get(pattern string, h http.HandlerFunc)
	})
	if !ok {
		t.Fatalf("handler %T does not support registering test routes", handler)
	}

	router.Get(pattern, route)
}

func assertMinaError(t *testing.T, response *httptest.ResponseRecorder, status int, code models.APIErrorCode, message string) {
	t.Helper()

	if response.Code != status {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, status, response.Body.String())
	}
	if contentType := response.Header().Get("Content-Type"); contentType != "application/json" {
		t.Fatalf("content type = %q, want application/json", contentType)
	}

	var body models.ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if body.Error.Code != code {
		t.Fatalf("error code = %q, want %q", body.Error.Code, code)
	}
	if body.Error.Message != message {
		t.Fatalf("error message = %q, want %q", body.Error.Message, message)
	}
}
