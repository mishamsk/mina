package httpapi

import (
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services/accountingschema"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/apiaudit"
	authentication "github.com/mishamsk/mina/internal/services/authentication/online"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/dataaggregates"
	"github.com/mishamsk/mina/internal/services/demo"
	"github.com/mishamsk/mina/internal/services/exchangeratecache"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/health"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/operationruns"
	"github.com/mishamsk/mina/internal/services/recurring"
	settingservice "github.com/mishamsk/mina/internal/services/settings"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/transactiontemplates"
)

const defaultLocalAPITimeout = 30 * time.Second
const maxAPIRequestBodyBytes = 16 << 20

// Dependencies are router inputs owned by higher-level composition.
type Dependencies struct {
	AccountingSchema  *accountingschema.Service
	Settings          *settingservice.Service
	Health            *health.Service
	Operations        *operationruns.Service
	Categories        *categories.Service
	Tags              *tags.Service
	Members           *members.Service
	Accounts          *accounts.Service
	APIAudit          *apiaudit.Service
	CreditLimits      *creditlimits.Service
	ExchangeRates     *exchangerates.Service
	ExchangeRateCache *exchangeratecache.Service
	Transactions      *transactions.Service
	DataAggregates    *dataaggregates.Service
	Templates         *transactiontemplates.Service
	Recurring         *recurring.Service
	Demo              *demo.Service
	Authentication    *authentication.Service
	Clock             Clock
}

// Clock returns the current process time for HTTP adapter decisions.
type Clock interface {
	Now() time.Time
}

type systemClock struct{}

func (systemClock) Now() time.Time {
	return time.Now()
}

func (deps Dependencies) clock() Clock {
	if deps.Clock != nil {
		return deps.Clock
	}

	return systemClock{}
}

// Options controls process-local HTTP adapter behavior.
type Options struct {
	AccessLog io.Writer
	ErrorLog  io.Writer
	Timeout   time.Duration
}

// NewWithOptions builds the REST API handler tree with explicit adapter options.
func NewWithOptions(deps Dependencies, opts Options) http.Handler {
	return newHandler(deps, opts, nil)
}

// NewProtectedWithOptions builds the externally protected REST API handler tree.
func NewProtectedWithOptions(deps Dependencies, opts Options) http.Handler {
	return newHandler(deps, opts, func(next http.Handler) http.Handler {
		return ProtectREST(deps.Authentication, deps.clock(), next)
	})
}

func newHandler(deps Dependencies, opts Options, protect func(http.Handler) http.Handler) http.Handler {
	router := chi.NewRouter()
	spec := mustOpenAPIValidationSpec()
	audit := mustNewAPIAuditMiddleware(spec, deps.APIAudit, deps.clock(), opts.ErrorLog)
	applyMiddleware(router, opts, audit)
	if protect != nil {
		router.Use(protect)
	}
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

func applyMiddleware(router chi.Router, opts Options, audit func(http.Handler) http.Handler) {
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = defaultLocalAPITimeout
	}

	router.Use(middleware.RequestID)
	router.Use(withHTTPRequest)
	if opts.AccessLog != nil {
		router.Use(AccessLogger(opts.AccessLog))
	}
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
			if request.Body != nil {
				request.Body = http.MaxBytesReader(w, request.Body, maxAPIRequestBodyBytes)
			}
			next.ServeHTTP(w, request)
		})
	})
	router.Use(audit)
	router.Use(panicErrorEnvelope)
	router.Use(withRecoveryLogEntry)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(timeout))
}
