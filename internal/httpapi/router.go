package httpapi

import (
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"mina.local/mina/internal/httpapi/models"
	"mina.local/mina/internal/httpapi/openapi"
	"mina.local/mina/internal/services/accounts"
	"mina.local/mina/internal/services/categories"
	"mina.local/mina/internal/services/creditlimits"
	"mina.local/mina/internal/services/exchangerates"
	"mina.local/mina/internal/services/members"
	"mina.local/mina/internal/services/tags"
	"mina.local/mina/internal/services/transactions"
)

const defaultLocalAPITimeout = 30 * time.Second

// Dependencies are router inputs owned by higher-level composition.
type Dependencies struct {
	Categories    *categories.Service
	Tags          *tags.Service
	Members       *members.Service
	Accounts      *accounts.Service
	CreditLimits  *creditlimits.Service
	ExchangeRates *exchangerates.Service
	Transactions  *transactions.Service
}

// Options controls process-local HTTP adapter behavior.
type Options struct {
	AccessLog io.Writer
	Timeout   time.Duration
}

// New builds the REST API handler tree.
func New(deps Dependencies) http.Handler {
	return NewWithOptions(deps, Options{})
}

// NewWithOptions builds the REST API handler tree with explicit adapter options.
func NewWithOptions(deps Dependencies, opts Options) http.Handler {
	router := chi.NewRouter()
	applyMiddleware(router, opts)
	router.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		WriteAPIError(w, http.StatusNotFound, models.ErrorCodeNotFound, "route not found")
	})
	router.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		WriteAPIError(w, http.StatusMethodNotAllowed, models.ErrorCodeMethodNotAllowed, "method not allowed")
	})

	manualMux := newManualMux(deps)
	openapi.HandlerWithOptions(newGeneratedServer(manualMux), openapi.ChiServerOptions{
		BaseRouter:       router,
		ErrorHandlerFunc: generatedRequestErrorHandler,
	})

	return router
}

func applyMiddleware(router chi.Router, opts Options) {
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = defaultLocalAPITimeout
	}

	router.Use(middleware.RequestID)
	//nolint:staticcheck // The Stage 1 migration explicitly keeps Chi RealIP in the baseline local API stack.
	router.Use(middleware.RealIP)
	if opts.AccessLog != nil {
		router.Use(accessLogger(opts.AccessLog))
	}
	router.Use(panicErrorEnvelope)
	router.Use(withRecoveryLogEntry)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(timeout))
}

func newManualMux(deps Dependencies) http.Handler {
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

	return mux
}
