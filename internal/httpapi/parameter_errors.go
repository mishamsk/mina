package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
)

func generatedBindingErrorMessage(r *http.Request, err error) string {
	var requiredParam *openapi.RequiredParamError
	if errors.As(err, &requiredParam) {
		return parameterLabel("", requiredParam.ParamName) + " is required"
	}

	var tooManyValues *openapi.TooManyValuesForParamError
	if errors.As(err, &tooManyValues) {
		return parameterLabel("query", tooManyValues.ParamName) + " must be provided at most once"
	}

	var invalidParam *openapi.InvalidParamFormatError
	if errors.As(err, &invalidParam) {
		if message, ok := generatedQueryValueMessage(r, invalidParam.ParamName); ok {
			return message
		}

		return parameterFormatErrorMessage("", invalidParam.ParamName, invalidParam.Err)
	}

	return "invalid request"
}

func openAPIParameterErrorMessage(r *http.Request, requestErr *openapi3filter.RequestError) string {
	if requestErr == nil || requestErr.Parameter == nil {
		return "invalid request"
	}

	if requestErr.Parameter.In == "query" {
		if message, ok := generatedQueryValueMessage(r, requestErr.Parameter.Name); ok {
			return message
		}
	}

	label := parameterLabel(requestErr.Parameter.In, requestErr.Parameter.Name)
	switch {
	case errors.Is(requestErr.Err, openapi3filter.ErrInvalidRequired):
		return label + " is required"
	case errors.Is(requestErr.Err, openapi3filter.ErrInvalidEmptyValue):
		return label + " must not be empty"
	}

	var schemaErr *openapi3.SchemaError
	if errors.As(requestErr.Err, &schemaErr) && schemaErr.Reason != "" {
		return label + " is invalid: " + schemaErr.Reason
	}

	return parameterFormatErrorMessage(requestErr.Parameter.In, requestErr.Parameter.Name, requestErr.Err)
}

func parameterFormatErrorMessage(location string, name string, err error) string {
	label := parameterLabel(location, name)
	message := ""
	if err != nil {
		message = err.Error()
	}

	switch {
	case strings.Contains(message, "multiple values"):
		return label + " must be provided at most once"
	case strings.Contains(message, `parsing "":`) || strings.Contains(message, "empty value"):
		return label + " must not be empty"
	case message != "":
		return label + " is invalid: " + parameterErrorDetail(message)
	default:
		return label + " has invalid value"
	}
}

func parameterErrorDetail(message string) string {
	for {
		trimmed := strings.TrimPrefix(message, "error binding string parameter: ")
		trimmed = strings.TrimPrefix(trimmed, "error setting array element: ")
		if trimmed == message {
			return message
		}
		message = trimmed
	}
}

func generatedQueryValueMessage(r *http.Request, name string) (string, bool) {
	if r == nil {
		return "", false
	}

	// OpenAPI validation may apply query defaults before reporting an error, so
	// inspect the raw query to preserve the caller-provided cardinality signal.
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		query = r.URL.Query()
	}
	values, ok := query[name]
	if !ok {
		return "", false
	}

	label := parameterLabel("query", name)
	if slices.Contains(values, "") {
		return label + " must not be empty", true
	}
	if len(values) != 1 {
		return label + " must be provided at most once", true
	}

	return "", false
}

func parameterLabel(location string, name string) string {
	if location == "" {
		return fmt.Sprintf("parameter %q", name)
	}

	return fmt.Sprintf("%s parameter %q", location, name)
}
