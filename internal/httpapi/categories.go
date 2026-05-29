package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"mina.local/mina/internal/httpapi/models"
	"mina.local/mina/internal/services/categories"
)

func registerCategoryRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /categories", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateCategoryRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		category, err := deps.Categories.Create(r.Context(), categories.CreateInput{
			FQN:      req.FQN,
			IsHidden: req.IsHidden != nil && *req.IsHidden,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, categoryResponse(category))
	})

	mux.HandleFunc("GET /categories", func(w http.ResponseWriter, r *http.Request) {
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

		categoryList, err := deps.Categories.List(r.Context(), categories.ListOptions{
			IncludeHidden:     query.IncludeHidden,
			IncludeTombstoned: query.IncludeTombstoned,
			List:              serviceListOptions(query.List),
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.CategoryListResponse{Categories: categoryResponses(categoryList)})
	})

	mux.HandleFunc("GET /categories/{category_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/categories/", "category_id")
		if !ok {
			return
		}
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		category, err := deps.Categories.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, categoryResponse(category))
	})

	mux.HandleFunc("PATCH /categories/{category_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/categories/", "category_id")
		if !ok {
			return
		}

		var req models.UpdateCategoryRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		category, err := deps.Categories.UpdateHidden(r.Context(), id, req.IsHidden)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, categoryResponse(category))
	})

	mux.HandleFunc("DELETE /categories/{category_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/categories/", "category_id")
		if !ok {
			return
		}

		if err := deps.Categories.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

func categoryResponse(category categories.Category) models.Category {
	return models.Category{
		ID:           category.ID,
		FQN:          category.FQN,
		IsHidden:     category.IsHidden,
		ParentFQN:    category.ParentFQN,
		Name:         category.Name,
		Level:        category.Level,
		CreatedAt:    category.CreatedAt,
		UpdatedAt:    category.UpdatedAt,
		TombstonedAt: category.TombstonedAt,
	}
}

func categoryResponses(categories []categories.Category) []models.Category {
	responses := make([]models.Category, 0, len(categories))
	for _, category := range categories {
		responses = append(responses, categoryResponse(category))
	}

	return responses
}

func parseIDPathValue(w http.ResponseWriter, r *http.Request, prefix string, name string) (int64, bool) {
	rawID := strings.TrimPrefix(r.URL.Path, prefix)
	if rawID == "" || strings.Contains(rawID, "/") {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" must be a positive integer")
		return 0, false
	}

	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" must be a positive integer")
		return 0, false
	}

	return id, true
}
