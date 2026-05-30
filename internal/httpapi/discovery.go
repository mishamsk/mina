package httpapi

import (
	"net/http"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
)

func openAPIJSONHandler(w http.ResponseWriter, _ *http.Request) {
	spec, err := openapi.GetSpecJSON()
	if err != nil {
		WriteAPIError(w, http.StatusInternalServerError, openapi.APIErrorCodeInternalError, "internal server error")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(spec)
}
