package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"mina.local/mina/internal/httpapi/openapi"
	"mina.local/mina/internal/services"
)

// WriteAPIError writes a stable JSON API error response.
func WriteAPIError(w http.ResponseWriter, status int, code openapi.APIErrorCode, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	response := openapi.ErrorResponse{
		Error: openapi.APIError{
			Code:    code,
			Message: message,
		},
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
	}
}

// WriteControllerError maps use-case errors to stable JSON API errors.
func WriteControllerError(w http.ResponseWriter, err error) {
	var serviceErr *services.Error
	if errors.As(err, &serviceErr) {
		code := modelErrorCode(serviceErr.Code)
		WriteAPIError(w, statusForCode(code), code, serviceErr.Message)
		return
	}

	WriteAPIError(w, http.StatusInternalServerError, openapi.APIErrorCodeInternalError, "internal server error")
}

func modelErrorCode(code services.ErrorCode) openapi.APIErrorCode {
	switch code {
	case services.ErrorCodeInvalidRequest:
		return openapi.APIErrorCodeInvalidRequest
	case services.ErrorCodeNotFound:
		return openapi.APIErrorCodeNotFound
	case services.ErrorCodeConflict:
		return openapi.APIErrorCodeConflict
	default:
		return openapi.APIErrorCodeInternalError
	}
}

func statusForCode(code openapi.APIErrorCode) int {
	switch code {
	case openapi.APIErrorCodeInvalidRequest:
		return http.StatusBadRequest
	case openapi.APIErrorCodeNotFound:
		return http.StatusNotFound
	case openapi.APIErrorCodeMethodNotAllowed:
		return http.StatusMethodNotAllowed
	case openapi.APIErrorCodeConflict:
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}
