package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"mina.local/mina/internal/httpapi/models"
	"mina.local/mina/internal/services"
)

// WriteAPIError writes a stable JSON API error response.
func WriteAPIError(w http.ResponseWriter, status int, code models.ErrorCode, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	response := models.ErrorResponse{
		Error: models.APIError{
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

	WriteAPIError(w, http.StatusInternalServerError, models.ErrorCodeInternal, "internal server error")
}

func modelErrorCode(code services.ErrorCode) models.ErrorCode {
	switch code {
	case services.ErrorCodeInvalidRequest:
		return models.ErrorCodeInvalidRequest
	case services.ErrorCodeNotFound:
		return models.ErrorCodeNotFound
	case services.ErrorCodeConflict:
		return models.ErrorCodeConflict
	default:
		return models.ErrorCodeInternal
	}
}

func statusForCode(code models.ErrorCode) int {
	switch code {
	case models.ErrorCodeInvalidRequest:
		return http.StatusBadRequest
	case models.ErrorCodeNotFound:
		return http.StatusNotFound
	case models.ErrorCodeMethodNotAllowed:
		return http.StatusMethodNotAllowed
	case models.ErrorCodeConflict:
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}
