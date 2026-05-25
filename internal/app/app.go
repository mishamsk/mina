package app

import (
	"context"
	"net/http"

	"mina/internal/httpapi"
	"mina/internal/store"
)

type App struct {
	Store   *store.Store
	Handler http.Handler
}

func New(ctx context.Context, dbPath string) (*App, error) {
	st, err := store.Open(ctx, dbPath)
	if err != nil {
		return nil, err
	}
	return &App{
		Store:   st,
		Handler: httpapi.NewHandler(st),
	}, nil
}

func (a *App) Close() error {
	return a.Store.Close()
}
