package httpapi

import (
	"context"
	"errors"
	"net/http"

	"mina.local/mina/internal/httpapi/openapi"
	"mina.local/mina/internal/services"
)

type strictRequestContextKey struct{}

func strictRequestContextMiddleware(next openapi.StrictHandlerFunc, _ string) openapi.StrictHandlerFunc {
	return func(ctx context.Context, w http.ResponseWriter, r *http.Request, request any) (any, error) {
		ctx = context.WithValue(ctx, strictRequestContextKey{}, r)
		return next(ctx, w, r, request)
	}
}

func requestFromStrictContext(ctx context.Context) (*http.Request, error) {
	request, ok := ctx.Value(strictRequestContextKey{}).(*http.Request)
	if !ok || request == nil {
		return nil, errors.New("request context missing")
	}

	return request, nil
}

func positivePathID(id int64, name string) error {
	if id <= 0 {
		return services.InvalidRequest(name + " must be a positive integer")
	}

	return nil
}
