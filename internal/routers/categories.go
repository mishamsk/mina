package routers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
)

func registerCategoryRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /categories", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateCategoryRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		category, err := deps.Controllers.Categories.Create(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, category)
	})

	mux.HandleFunc("GET /categories", func(w http.ResponseWriter, r *http.Request) {
		includeHidden, ok := parseBoolQuery(w, r, "include_hidden")
		if !ok {
			return
		}
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		categories, err := deps.Controllers.Categories.List(r.Context(), controllers.CategoryListOptions{
			IncludeHidden:     includeHidden,
			IncludeTombstoned: includeTombstoned,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.CategoryListResponse{Categories: categories})
	})

	mux.HandleFunc("GET /categories/{category_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "category_id")
		if !ok {
			return
		}
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		category, err := deps.Controllers.Categories.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, category)
	})

	mux.HandleFunc("PATCH /categories/{category_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "category_id")
		if !ok {
			return
		}

		var req models.UpdateCategoryRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		category, err := deps.Controllers.Categories.UpdateHidden(r.Context(), id, req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, category)
	})

	mux.HandleFunc("DELETE /categories/{category_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "category_id")
		if !ok {
			return
		}

		if err := deps.Controllers.Categories.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

func parseIDPathValue(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	rawID := strings.TrimPrefix(r.URL.Path, "/categories/")
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

func parseBoolQuery(w http.ResponseWriter, r *http.Request, name string) (bool, bool) {
	value := r.URL.Query().Get(name)
	if value == "" {
		return false, true
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" must be a boolean")
		return false, false
	}

	return parsed, true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		WriteAPIError(w, http.StatusInternalServerError, models.ErrorCodeInternal, "failed to write response")
	}
}

func decodeStrictJSON(r *http.Request, dst any) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return fmt.Errorf("read request body: %w", err)
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return errors.New("empty request body")
	}

	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("decode request body: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("multiple JSON values")
	}

	return nil
}
