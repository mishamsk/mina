package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"mina/internal/api"
	"mina/internal/store"
)

type Server struct {
	store *store.Store
}

func NewHandler(st *store.Store) http.Handler {
	server := &Server{store: st}
	strict := api.NewStrictHandlerWithOptions(server, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  writeBadRequest,
		ResponseErrorHandlerFunc: writeInternalError,
	})

	router := chi.NewRouter()
	return api.HandlerWithOptions(strict, api.ChiServerOptions{
		BaseRouter:       router,
		ErrorHandlerFunc: writeBadRequest,
	})
}

func (s *Server) GetHealth(ctx context.Context, request api.GetHealthRequestObject) (api.GetHealthResponseObject, error) {
	return api.GetHealth200JSONResponse{Status: api.Ok}, nil
}

func (s *Server) ListItems(ctx context.Context, request api.ListItemsRequestObject) (api.ListItemsResponseObject, error) {
	items, err := s.store.ListItems(ctx)
	if err != nil {
		return nil, err
	}
	return api.ListItems200JSONResponse{Items: apiItems(items)}, nil
}

func (s *Server) CreateItem(ctx context.Context, request api.CreateItemRequestObject) (api.CreateItemResponseObject, error) {
	if request.Body == nil {
		return badRequest("invalid_request", "request body is required"), nil
	}

	name := strings.TrimSpace(request.Body.Name)
	if name == "" {
		return badRequest("invalid_request", "name is required"), nil
	}
	if len(name) > 200 {
		return badRequest("invalid_request", "name must be 200 characters or fewer"), nil
	}

	var note *string
	if request.Body.Note != nil {
		trimmed := strings.TrimSpace(*request.Body.Note)
		if len(trimmed) > 2000 {
			return badRequest("invalid_request", "note must be 2000 characters or fewer"), nil
		}
		if trimmed != "" {
			note = &trimmed
		}
	}

	item, err := s.store.CreateItem(ctx, name, note)
	if err != nil {
		return nil, err
	}
	return api.CreateItem201JSONResponse(apiItem(item)), nil
}

func (s *Server) GetItem(ctx context.Context, request api.GetItemRequestObject) (api.GetItemResponseObject, error) {
	item, err := s.store.GetItem(ctx, request.Id)
	if errors.Is(err, store.ErrNotFound) {
		return notFound("item_not_found", "item not found"), nil
	}
	if err != nil {
		return nil, err
	}
	return api.GetItem200JSONResponse(apiItem(item)), nil
}

func (s *Server) DeleteItem(ctx context.Context, request api.DeleteItemRequestObject) (api.DeleteItemResponseObject, error) {
	if err := s.store.DeleteItem(ctx, request.Id); errors.Is(err, store.ErrNotFound) {
		return api.DeleteItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(api.Error{
			Code:    "item_not_found",
			Message: "item not found",
		})}, nil
	} else if err != nil {
		return nil, err
	}
	return api.DeleteItem204Response{}, nil
}

func apiItems(items []store.Item) []api.Item {
	out := make([]api.Item, 0, len(items))
	for _, item := range items {
		out = append(out, apiItem(item))
	}
	return out
}

func apiItem(item store.Item) api.Item {
	return api.Item{
		Id:        item.ID,
		Name:      item.Name,
		Note:      item.Note,
		CreatedAt: item.CreatedAt.UTC(),
	}
}

func badRequest(code, message string) api.CreateItem400JSONResponse {
	return api.CreateItem400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(api.Error{
		Code:    code,
		Message: message,
	})}
}

func notFound(code, message string) api.GetItem404JSONResponse {
	return api.GetItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(api.Error{
		Code:    code,
		Message: message,
	})}
}
