package httpapi

import (
	"net/http"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/services/tags"
)

func registerTagRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /tags", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateTagRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		tag, err := deps.Tags.Create(r.Context(), tags.CreateInput{
			FQN:      req.FQN,
			IsHidden: req.IsHidden != nil && *req.IsHidden,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, tagResponse(tag))
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

		tagList, err := deps.Tags.List(r.Context(), tags.ListOptions{
			IncludeHidden:     query.IncludeHidden,
			IncludeTombstoned: query.IncludeTombstoned,
			List:              serviceListOptions(query.List),
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.TagListResponse{Tags: tagResponses(tagList)})
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

		tag, err := deps.Tags.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, tagResponse(tag))
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

		tag, err := deps.Tags.UpdateHidden(r.Context(), id, req.IsHidden)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, tagResponse(tag))
	})

	mux.HandleFunc("DELETE /tags/{tag_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/tags/", "tag_id")
		if !ok {
			return
		}

		if err := deps.Tags.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

func tagResponse(tag tags.Tag) models.Tag {
	return models.Tag{
		ID:           tag.ID,
		FQN:          tag.FQN,
		IsHidden:     tag.IsHidden,
		ParentFQN:    tag.ParentFQN,
		Name:         tag.Name,
		Level:        tag.Level,
		CreatedAt:    tag.CreatedAt,
		UpdatedAt:    tag.UpdatedAt,
		TombstonedAt: tag.TombstonedAt,
	}
}

func tagResponses(tags []tags.Tag) []models.Tag {
	responses := make([]models.Tag, 0, len(tags))
	for _, tag := range tags {
		responses = append(responses, tagResponse(tag))
	}

	return responses
}
