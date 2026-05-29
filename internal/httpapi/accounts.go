package httpapi

import (
	"net/http"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/services/accounts"
)

func registerAccountRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /accounts", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateAccountRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		account, err := deps.Accounts.Create(r.Context(), accounts.CreateInput{
			FQN:            req.FQN,
			IsHidden:       req.IsHidden != nil && *req.IsHidden,
			Currency:       req.Currency,
			ExternalID:     req.ExternalID,
			ExternalSystem: req.ExternalSystem,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, accountResponse(account))
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

		accountList, err := deps.Accounts.List(r.Context(), accounts.ListOptions{
			IncludeHidden:     query.IncludeHidden,
			IncludeTombstoned: query.IncludeTombstoned,
			List:              serviceListOptions(query.List),
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.AccountListResponse{Accounts: accountResponses(accountList)})
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

		account, err := deps.Accounts.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, accountResponse(account))
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

		account, err := deps.Accounts.UpdateMutable(r.Context(), id, accounts.UpdateInput{
			IsHidden:       req.IsHidden,
			ExternalID:     req.ExternalID,
			ExternalSystem: req.ExternalSystem,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, accountResponse(account))
	})

	mux.HandleFunc("DELETE /accounts/{account_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/accounts/", "account_id")
		if !ok {
			return
		}

		if err := deps.Accounts.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

func accountResponse(account accounts.Account) models.Account {
	return models.Account{
		ID:             account.ID,
		FQN:            account.FQN,
		Kind:           account.Kind,
		IsHidden:       account.IsHidden,
		Currency:       account.Currency,
		ExternalID:     account.ExternalID,
		ExternalSystem: account.ExternalSystem,
		ParentFQN:      account.ParentFQN,
		Name:           account.Name,
		Level:          account.Level,
		CreatedAt:      account.CreatedAt,
		UpdatedAt:      account.UpdatedAt,
		TombstonedAt:   account.TombstonedAt,
	}
}

func accountResponses(accounts []accounts.Account) []models.Account {
	responses := make([]models.Account, 0, len(accounts))
	for _, account := range accounts {
		responses = append(responses, accountResponse(account))
	}

	return responses
}
