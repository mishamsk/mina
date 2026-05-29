package httpapi

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

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

func TestRouterGeneratedBindingErrorsKeepExistingMinaMessages(t *testing.T) {
	handler := New(Dependencies{})

	boolResponse := httptest.NewRecorder()
	handler.ServeHTTP(boolResponse, httptest.NewRequest(http.MethodGet, "/categories?include_hidden=maybe", nil))
	assertMinaError(t, boolResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "include_hidden must be a boolean")

	emptyBoolResponse := httptest.NewRecorder()
	handler.ServeHTTP(emptyBoolResponse, httptest.NewRequest(http.MethodGet, "/categories?include_hidden=", nil))
	assertMinaError(t, emptyBoolResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "include_hidden must have one non-empty value")

	duplicateBoolResponse := httptest.NewRecorder()
	handler.ServeHTTP(duplicateBoolResponse, httptest.NewRequest(http.MethodGet, "/categories?include_hidden=true&include_hidden=false", nil))
	assertMinaError(t, duplicateBoolResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "include_hidden must have one non-empty value")

	emptyGetBoolResponse := httptest.NewRecorder()
	handler.ServeHTTP(emptyGetBoolResponse, httptest.NewRequest(http.MethodGet, "/categories/1?include_tombstoned=", nil))
	assertMinaError(t, emptyGetBoolResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "include_tombstoned must be a boolean")

	emptyLimitResponse := httptest.NewRecorder()
	handler.ServeHTTP(emptyLimitResponse, httptest.NewRequest(http.MethodGet, "/categories?limit=", nil))
	assertMinaError(t, emptyLimitResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "limit must have one non-empty value")

	idResponse := httptest.NewRecorder()
	handler.ServeHTTP(idResponse, httptest.NewRequest(http.MethodGet, "/accounts/not-an-id/records", nil))
	assertMinaError(t, idResponse, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "account_id must be a positive integer")
}

func TestRouterStrictJSONValidationRejectsNullRequiredBool(t *testing.T) {
	handler := New(Dependencies{})
	request := httptest.NewRequest(http.MethodPatch, "/categories/1", strings.NewReader(`{"is_hidden":null}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertMinaError(t, response, http.StatusBadRequest, models.APIErrorCodeInvalidRequest, "is_hidden is required")
}

func TestRouterStrictJSONValidationRejectsNestedUnknownFields(t *testing.T) {
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

func TestRouterRecoversPanicsWithMinaEnvelope(t *testing.T) {
	router := chi.NewRouter()
	applyMiddleware(router, Options{})
	router.Get("/panic", func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})
	response := httptest.NewRecorder()

	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/panic", nil))

	assertMinaError(t, response, http.StatusInternalServerError, models.APIErrorCodeInternalError, "internal server error")
}

func TestRouterTimeoutCancelsRequest(t *testing.T) {
	router := chi.NewRouter()
	applyMiddleware(router, Options{Timeout: time.Nanosecond})
	router.Get("/slow", func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	})
	response := httptest.NewRecorder()

	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/slow", nil))

	assertMinaError(t, response, http.StatusGatewayTimeout, models.APIErrorCodeInternalError, "request timed out")
}
