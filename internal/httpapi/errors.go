package httpapi

import (
	"encoding/json"
	"net/http"

	"mina/internal/api"
)

func writeBadRequest(w http.ResponseWriter, r *http.Request, err error) {
	writeJSONError(w, http.StatusBadRequest, api.Error{
		Code:    "invalid_request",
		Message: err.Error(),
	})
}

func writeInternalError(w http.ResponseWriter, r *http.Request, err error) {
	writeJSONError(w, http.StatusInternalServerError, api.Error{
		Code:    "internal_error",
		Message: http.StatusText(http.StatusInternalServerError),
	})
}

func writeJSONError(w http.ResponseWriter, status int, body api.Error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
