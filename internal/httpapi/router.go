package httpapi

import (
	"net/http"
	"strings"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
	"mina.local/mina/internal/services/accounts"
	"mina.local/mina/internal/services/categories"
	"mina.local/mina/internal/services/creditlimits"
	"mina.local/mina/internal/services/exchangerates"
	"mina.local/mina/internal/services/members"
	"mina.local/mina/internal/services/tags"
)

// Dependencies are router inputs owned by higher-level composition.
type Dependencies struct {
	Controllers   *controllers.Controllers
	Categories    *categories.Service
	Tags          *tags.Service
	Members       *members.Service
	Accounts      *accounts.Service
	CreditLimits  *creditlimits.Service
	ExchangeRates *exchangerates.Service
}

// New builds the REST API handler tree.
func New(deps Dependencies) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	registerCategoryRoutes(mux, deps)
	registerTagRoutes(mux, deps)
	registerMemberRoutes(mux, deps)
	registerAccountRoutes(mux, deps)
	registerCreditLimitHistoryRoutes(mux, deps)
	registerExchangeRateRoutes(mux, deps)
	registerTransactionRoutes(mux, deps)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if routeExistsWithDifferentMethod(r) {
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

func routeExistsWithDifferentMethod(r *http.Request) bool {
	switch r.URL.Path {
	case "/health":
		return r.Method != http.MethodGet
	case "/categories", "/tags", "/members", "/accounts", "/exchange-rates", "/transactions":
		return r.Method != http.MethodGet && r.Method != http.MethodPost
	case "/records":
		return r.Method != http.MethodGet
	default:
		return resourceIDPath(r.URL.Path, "/categories/") && r.Method != http.MethodGet && r.Method != http.MethodPatch && r.Method != http.MethodDelete ||
			resourceIDPath(r.URL.Path, "/tags/") && r.Method != http.MethodGet && r.Method != http.MethodPatch && r.Method != http.MethodDelete ||
			resourceIDPath(r.URL.Path, "/members/") && r.Method != http.MethodGet && r.Method != http.MethodPatch && r.Method != http.MethodDelete ||
			resourceIDPath(r.URL.Path, "/accounts/") && r.Method != http.MethodGet && r.Method != http.MethodPatch && r.Method != http.MethodDelete ||
			accountRecordsPath(r.URL.Path) && r.Method != http.MethodGet ||
			accountCreditLimitHistoryPath(r.URL.Path) && r.Method != http.MethodGet && r.Method != http.MethodPost ||
			resourceIDPath(r.URL.Path, "/credit-limit-history/") && r.Method != http.MethodGet && r.Method != http.MethodDelete ||
			resourceIDPath(r.URL.Path, "/exchange-rates/") && r.Method != http.MethodGet && r.Method != http.MethodPatch && r.Method != http.MethodDelete ||
			resourceIDPath(r.URL.Path, "/transactions/") && r.Method != http.MethodGet && r.Method != http.MethodPut && r.Method != http.MethodDelete ||
			recordBulkOperationPath(r.URL.Path) && r.Method != http.MethodPost
	}
}

func resourceIDPath(path string, prefix string) bool {
	rawID := strings.TrimPrefix(path, prefix)
	if rawID == path || rawID == "" || strings.Contains(rawID, "/") {
		return false
	}

	return true
}
