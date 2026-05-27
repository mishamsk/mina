package routers

import (
	"encoding/json"
	"net/http"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
)

// Dependencies are router inputs owned by higher-level composition.
type Dependencies struct {
	Controllers *controllers.Controllers
}

// New builds the REST API handler tree.
func New(deps Dependencies) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{"status": "ok"}); err != nil {
			WriteAPIError(w, http.StatusInternalServerError, models.ErrorCodeInternal, "failed to write response")
		}
	})

	_ = deps.Controllers

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" && r.Method != http.MethodGet {
			WriteAPIError(w, http.StatusMethodNotAllowed, models.ErrorCodeMethodNotAllowed, "method not allowed")
			return
		}

		handler, pattern := mux.Handler(r)
		if pattern == "" {
			WriteAPIError(w, http.StatusNotFound, models.ErrorCodeNotFound, "route not found")
			return
		}

		handler.ServeHTTP(w, r)
	})
}
