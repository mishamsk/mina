package routers

import (
	"encoding/json"
	"errors"
	"net/http"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
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

// WriteControllerError maps controller errors to stable JSON API errors.
func WriteControllerError(w http.ResponseWriter, err error) {
	var controllerErr *controllers.Error
	if errors.As(err, &controllerErr) {
		WriteAPIError(w, statusForCode(controllerErr.Code), controllerErr.Code, controllerErr.Message)
		return
	}

	WriteAPIError(w, http.StatusInternalServerError, models.ErrorCodeInternal, "internal server error")
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
