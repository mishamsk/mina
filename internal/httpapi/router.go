package httpapi

import (
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/demo"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/health"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/operationruns"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
)

const defaultLocalAPITimeout = 30 * time.Second

// Dependencies are router inputs owned by higher-level composition.
type Dependencies struct {
	Health        *health.Service
	Operations    *operationruns.Service
	Categories    *categories.Service
	Tags          *tags.Service
	Members       *members.Service
	Accounts      *accounts.Service
	CreditLimits  *creditlimits.Service
	ExchangeRates *exchangerates.Service
	Transactions  *transactions.Service
	Demo          *demo.Service
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
	spec := mustOpenAPIValidationSpec()
	applyMiddleware(router, opts)
	router.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		WriteAPIError(w, http.StatusNotFound, openapi.APIErrorCodeNotFound, "route not found")
	})
	router.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		WriteAPIError(w, http.StatusMethodNotAllowed, openapi.APIErrorCodeMethodNotAllowed, "method not allowed")
	})
	router.Get("/api/openapi.json", openAPIJSONHandler)

	router.Group(func(api chi.Router) {
		api.Use(openAPIRequestValidationMiddleware(spec))

		strict := openapi.NewStrictHandlerWithOptions(
			newStrictServer(deps),
			nil,
			strictHTTPServerOptions(),
		)
		openapi.HandlerWithOptions(strict, openapi.ChiServerOptions{
			BaseRouter:       api,
			ErrorHandlerFunc: generatedRequestErrorHandler,
		})
	})

	return router
}

func applyMiddleware(router chi.Router, opts Options) {
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = defaultLocalAPITimeout
	}

	router.Use(middleware.RequestID)
	if opts.AccessLog != nil {
		router.Use(AccessLogger(opts.AccessLog))
	}
	router.Use(panicErrorEnvelope)
	router.Use(withRecoveryLogEntry)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(timeout))
}
