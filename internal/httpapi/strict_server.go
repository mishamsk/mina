package httpapi

import (
	"errors"
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

	var invalidParam *openapi.InvalidParamFormatError
	if errors.As(err, &invalidParam) {
		return generatedParamErrorMessage(r, invalidParam.ParamName)
	}

	var tooManyValues *openapi.TooManyValuesForParamError
	if errors.As(err, &tooManyValues) {
		return generatedParamCardinalityErrorMessage(r, tooManyValues.ParamName)
	}

	return "invalid request"
}

func generatedParamErrorMessage(r *http.Request, name string) string {
	if queryParamHasWrongCardinality(r, name) {
		if directBoolQueryParam(r, name) {
			return name + " must be a boolean"
		}

		return name + " must have one non-empty value"
	}

	switch name {
	case "include_hidden", "include_tombstoned":
		return name + " must be a boolean"
	case "limit", "offset":
		return name + " is out of range"
	default:
		if strings.HasSuffix(name, "_id") {
			return name + " must be a positive integer"
		}
		return "invalid request"
	}
}

func generatedParamCardinalityErrorMessage(r *http.Request, name string) string {
	if directBoolQueryParam(r, name) {
		return name + " must be a boolean"
	}

	return name + " must have one non-empty value"
}

// Generated binding reports type and cardinality failures through the same
// error type, so this compatibility path inspects the raw query only to
// preserve Mina's existing binding-error messages.
func queryParamHasWrongCardinality(r *http.Request, name string) bool {
	values, ok := r.URL.Query()[name]
	return ok && (len(values) != 1 || values[0] == "")
}

func directBoolQueryParam(r *http.Request, name string) bool {
	if name != "include_tombstoned" {
		return false
	}

	switch {
	case resourceIDPath(r.URL.Path, "/accounts/"):
		return true
	case resourceIDPath(r.URL.Path, "/categories/"):
		return true
	case resourceIDPath(r.URL.Path, "/credit-limit-history/"):
		return true
	case resourceIDPath(r.URL.Path, "/exchange-rates/"):
		return true
	case resourceIDPath(r.URL.Path, "/members/"):
		return true
	case resourceIDPath(r.URL.Path, "/tags/"):
		return true
	default:
		return false
	}
}

func resourceIDPath(path string, prefix string) bool {
	rawID := strings.TrimPrefix(path, prefix)
	if rawID == path || rawID == "" || strings.Contains(rawID, "/") {
		return false
	}

	return true
}
