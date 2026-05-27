package routers

import (
	"encoding/json"
	"net/http"

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
