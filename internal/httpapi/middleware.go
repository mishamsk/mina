package httpapi

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	"github.com/go-chi/chi/v5/middleware"
	openapimiddleware "github.com/oapi-codegen/nethttp-middleware"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
)

// AccessLogger writes one access-log line for each handled request.
func AccessLogger(out io.Writer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			started := time.Now()

			next.ServeHTTP(wrapped, r)

			status := wrapped.Status()
			if status == 0 {
				status = http.StatusOK
			}
			_, _ = fmt.Fprintf(
				out,
				"%s %s %d %d %s\n",
				r.Method,
				r.URL.RequestURI(),
				status,
				wrapped.BytesWritten(),
				time.Since(started).Round(time.Millisecond),
			)
		})
	}
}

func panicErrorEnvelope(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buffered := newBufferedResponseWriter()
		next.ServeHTTP(buffered, r)
		if buffered.body.Len() == 0 && buffered.status == http.StatusInternalServerError {
			WriteAPIError(w, http.StatusInternalServerError, openapi.APIErrorCodeInternalError, "internal server error")
			return
		}
		if buffered.body.Len() == 0 && buffered.status == http.StatusGatewayTimeout {
			WriteAPIError(w, http.StatusGatewayTimeout, openapi.APIErrorCodeInternalError, "request timed out")
			return
		}

		buffered.WriteTo(w)
	})
}

func withRecoveryLogEntry(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, middleware.WithLogEntry(r, noopLogEntry{}))
	})
}

func mustOpenAPIValidationSpec() *openapi3.T {
	spec, err := openapi.GetSpec()
	if err != nil {
		panic(fmt.Errorf("load embedded OpenAPI spec: %w", err))
	}

	return spec
}

func openAPIRequestValidationMiddleware(spec *openapi3.T) func(http.Handler) http.Handler {
	validator := openapimiddleware.OapiRequestValidatorWithOptions(spec, &openapimiddleware.Options{
		ErrorHandlerWithOpts: openAPIValidationErrorHandler,
		DoNotValidateServers: true,
	})
	queryValidator := openAPIQueryParameterValidationMiddleware(spec)

	return func(next http.Handler) http.Handler {
		return validator(queryValidator(next))
	}
}

func openAPIQueryParameterValidationMiddleware(spec *openapi3.T) func(http.Handler) http.Handler {
	router, err := gorillamux.NewRouter(spec)
	if err != nil {
		panic(fmt.Errorf("build OpenAPI router: %w", err))
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			route, _, err := router.FindRoute(r)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			// kin-openapi validates declared query parameters but intentionally
			// ignores unknown query names, so Mina enforces the OpenAPI-declared
			// query surface here before generated binding reaches handlers.
			for name := range r.URL.Query() {
				if !routeAllowsQueryParameter(route, name) {
					WriteAPIError(w, http.StatusBadRequest, openapi.APIErrorCodeInvalidRequest, "invalid request")
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

func routeAllowsQueryParameter(route *routers.Route, name string) bool {
	if route.Operation != nil && route.Operation.Parameters.GetByInAndName("query", name) != nil {
		return true
	}
	if route.PathItem != nil && route.PathItem.Parameters.GetByInAndName("query", name) != nil {
		return true
	}

	return false
}

func openAPIValidationErrorHandler(
	_ context.Context,
	err error,
	w http.ResponseWriter,
	r *http.Request,
	opts openapimiddleware.ErrorHandlerOpts,
) {
	status := opts.StatusCode
	if status == 0 || status >= http.StatusInternalServerError {
		status = http.StatusBadRequest
	}
	WriteAPIError(w, status, openapi.APIErrorCodeInvalidRequest, openAPIValidationErrorMessage(r, err))
}

func openAPIValidationErrorMessage(r *http.Request, err error) string {
	var requestErr *openapi3filter.RequestError
	if errors.As(err, &requestErr) {
		if requestErr.RequestBody != nil {
			return "invalid JSON request body"
		}
		if requestErr.Parameter != nil {
			return openAPIParameterErrorMessage(r, requestErr)
		}
	}

	return "invalid request"
}

type noopLogEntry struct{}

func (noopLogEntry) Write(int, int, http.Header, time.Duration, any) {}

func (noopLogEntry) Panic(any, []byte) {}

type bufferedResponseWriter struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func newBufferedResponseWriter() *bufferedResponseWriter {
	return &bufferedResponseWriter{header: http.Header{}}
}

func (w *bufferedResponseWriter) Header() http.Header {
	return w.header
}

func (w *bufferedResponseWriter) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}

	return w.body.Write(body)
}

func (w *bufferedResponseWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
}

func (w *bufferedResponseWriter) WriteTo(dst http.ResponseWriter) {
	for key, values := range w.header {
		for _, value := range values {
			dst.Header().Add(key, value)
		}
	}
	status := w.status
	if status == 0 {
		status = http.StatusOK
	}
	dst.WriteHeader(status)
	_, _ = w.body.WriteTo(dst)
}
