package httpapi

import (
	"net/http"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
)

func registerAccountRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /accounts", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateAccountRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		account, err := deps.Controllers.Accounts.Create(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, account)
	})

	mux.HandleFunc("GET /accounts", func(w http.ResponseWriter, r *http.Request) {
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

		accounts, err := deps.Controllers.Accounts.List(r.Context(), controllers.AccountListOptions{
			IncludeHidden:     query.IncludeHidden,
			IncludeTombstoned: query.IncludeTombstoned,
			List:              query.List,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.AccountListResponse{Accounts: accounts})
	})

	mux.HandleFunc("GET /accounts/{account_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/accounts/", "account_id")
		if !ok {
			return
		}
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		account, err := deps.Controllers.Accounts.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, account)
	})

	mux.HandleFunc("PATCH /accounts/{account_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/accounts/", "account_id")
		if !ok {
			return
		}

		var req models.UpdateAccountRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		account, err := deps.Controllers.Accounts.UpdateMutable(r.Context(), id, req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, account)
	})

	mux.HandleFunc("DELETE /accounts/{account_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/accounts/", "account_id")
		if !ok {
			return
		}

		if err := deps.Controllers.Accounts.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}
