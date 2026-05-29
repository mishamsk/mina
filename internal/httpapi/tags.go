package httpapi

import (
	"net/http"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
)

func registerTagRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /tags", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateTagRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		tag, err := deps.Controllers.Tags.Create(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, tag)
	})

	mux.HandleFunc("GET /tags", func(w http.ResponseWriter, r *http.Request) {
		query, ok := parseListQuery(w, r, listQueryContract{
			AllowHidden:     true,
			AllowTombstoned: true,
			SortKeys: map[models.SortKey]struct{}{
				models.SortKeyCreatedAt: {},
				models.SortKeyFQN:       {},
				models.SortKeyUpdatedAt: {},
			},
			DefaultSortKey: models.SortKeyFQN,
		})
		if !ok {
			return
		}

		tags, err := deps.Controllers.Tags.List(r.Context(), controllers.TagListOptions{
			IncludeHidden:     query.IncludeHidden,
			IncludeTombstoned: query.IncludeTombstoned,
			List:              query.List,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.TagListResponse{Tags: tags})
	})

	mux.HandleFunc("GET /tags/{tag_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/tags/", "tag_id")
		if !ok {
			return
		}
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		tag, err := deps.Controllers.Tags.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, tag)
	})

	mux.HandleFunc("PATCH /tags/{tag_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/tags/", "tag_id")
		if !ok {
			return
		}

		var req models.UpdateTagRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		tag, err := deps.Controllers.Tags.UpdateHidden(r.Context(), id, req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, tag)
	})

	mux.HandleFunc("DELETE /tags/{tag_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/tags/", "tag_id")
		if !ok {
			return
		}

		if err := deps.Controllers.Tags.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}
