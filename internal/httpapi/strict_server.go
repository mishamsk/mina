package httpapi

import (
	"net/http"
	"strings"

	"mina.local/mina/internal/httpapi/openapi"
)

var _ openapi.StrictServerInterface = (*strictServer)(nil)

type strictServer struct {
	deps Dependencies
}

func newStrictServer(deps Dependencies) *strictServer {
	return &strictServer{deps: deps}
}

func strictHTTPServerOptions() openapi.StrictHTTPServerOptions {
	return openapi.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  generatedRequestErrorHandler,
		ResponseErrorHandlerFunc: generatedResponseErrorHandler,
	}
}

func generatedRequestErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	WriteAPIError(w, http.StatusBadRequest, openapi.APIErrorCodeInvalidRequest, generatedRequestErrorMessage(r, err))
}

func generatedResponseErrorHandler(w http.ResponseWriter, _ *http.Request, err error) {
	WriteControllerError(w, err)
}

func generatedRequestErrorMessage(r *http.Request, err error) string {
	if err != nil && strings.Contains(err.Error(), "JSON body") {
		return "invalid JSON request body"
	}

	return generatedBindingErrorMessage(r, err)
}

func resourceIDPath(path string, prefix string) bool {
	rawID := strings.TrimPrefix(path, prefix)
	if rawID == path || rawID == "" || strings.Contains(rawID, "/") {
		return false
	}

	return true
}
