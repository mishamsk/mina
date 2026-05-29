package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mina.local/mina/internal/httpapi/models"
	"mina.local/mina/internal/httpapi/openapi"
)

func TestGeneratedStrictServerRequestErrorsUseMinaEnvelope(t *testing.T) {
	handler := generatedStrictHandler(Dependencies{})
	request := httptest.NewRequest(http.MethodPost, "/categories", strings.NewReader("{"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertMinaError(t, response, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
}

func TestGeneratedChiRequestErrorsUseMinaEnvelope(t *testing.T) {
	handler := generatedStrictHandler(Dependencies{})
	request := httptest.NewRequest(http.MethodGet, "/categories/not-an-id", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertMinaError(t, response, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid request")
}

func generatedStrictHandler(deps Dependencies) http.Handler {
	strict := openapi.NewStrictHandlerWithOptions(newStrictServer(deps), nil, strictHTTPServerOptions())
	return openapi.HandlerWithOptions(strict, generatedChiServerOptions())
}

func assertMinaError(t *testing.T, response *httptest.ResponseRecorder, status int, code models.ErrorCode, message string) {
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
