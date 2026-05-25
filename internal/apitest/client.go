package apitest

import (
	"net/http"
	"net/http/httptest"

	"mina/internal/api"
)

type HandlerTransport struct {
	Handler http.Handler
}

func (t HandlerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	rec := httptest.NewRecorder()
	t.Handler.ServeHTTP(rec, req)
	resp := rec.Result()
	resp.Request = req
	return resp, nil
}

func NewClient(handler http.Handler) (*api.ClientWithResponses, error) {
	return api.NewClientWithResponses("http://inprocess", api.WithHTTPClient(&http.Client{
		Transport: HandlerTransport{Handler: handler},
	}))
}
