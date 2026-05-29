package httpapi

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"mina.local/mina/internal/httpapi/openapi"
)

func accessLogger(out io.Writer) func(http.Handler) http.Handler {
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

type noopLogEntry struct{}

func (noopLogEntry) Write(int, int, http.Header, time.Duration, interface{}) {}

func (noopLogEntry) Panic(interface{}, []byte) {}

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
