package httpclient

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

const inProcessBaseURL = "http://mina.test"

// HandlerDoer performs generated REST requests against an in-process HTTP handler.
type HandlerDoer struct {
	handler http.Handler
}

// NewHandlerDoer returns a request doer backed by handler.
func NewHandlerDoer(handler http.Handler) *HandlerDoer {
	return &HandlerDoer{handler: handler}
}

// Do invokes the configured handler with req and returns its response.
func (d *HandlerDoer) Do(req *http.Request) (*http.Response, error) {
	if err := req.Context().Err(); err != nil {
		return nil, err
	}
	if req.Body != nil {
		defer func() {
			_ = req.Body.Close()
		}()
	}

	recorder := newHandlerResponseRecorder()
	d.handler.ServeHTTP(recorder, req)
	return recorder.result(), nil
}

// NewInProcessClient returns a generated REST client backed by handler.
func NewInProcessClient(handler http.Handler) (*ClientWithResponses, error) {
	return NewClientWithResponses(
		inProcessBaseURL,
		WithHTTPClient(NewHandlerDoer(handler)),
	)
}

type handlerResponseRecorder struct {
	statusCode     int
	header         http.Header
	responseHeader http.Header
	body           bytes.Buffer
	wroteHeader    bool
}

func newHandlerResponseRecorder() *handlerResponseRecorder {
	return &handlerResponseRecorder{header: make(http.Header)}
}

func (r *handlerResponseRecorder) Header() http.Header {
	return r.header
}

func (r *handlerResponseRecorder) Write(body []byte) (int, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}

	return r.body.Write(body)
}

func (r *handlerResponseRecorder) WriteHeader(statusCode int) {
	if r.wroteHeader {
		return
	}

	r.statusCode = statusCode
	r.responseHeader = r.header.Clone()
	r.wroteHeader = true
}

func (r *handlerResponseRecorder) result() *http.Response {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}

	statusText := http.StatusText(r.statusCode)
	return &http.Response{
		Status:     fmt.Sprintf("%03d %s", r.statusCode, statusText),
		StatusCode: r.statusCode,
		Header:     r.responseHeader,
		Body:       io.NopCloser(bytes.NewReader(r.body.Bytes())),
	}
}
