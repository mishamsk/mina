package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"mina.local/mina/internal/httpapi/models"
	"mina.local/mina/internal/services/creditlimits"
)

const accountCreditLimitHistorySuffix = "/credit-limit-history"

func registerCreditLimitHistoryRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /accounts/{account_id}/credit-limit-history", func(w http.ResponseWriter, r *http.Request) {
		accountID, ok := parseAccountCreditLimitHistoryPath(w, r)
		if !ok {
			return
		}

		var req models.CreateCreditLimitHistoryRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		history, err := deps.CreditLimits.Create(r.Context(), accountID, creditlimits.CreateInput{
			CreditLimit:   req.CreditLimit,
			EffectiveDate: req.EffectiveDate,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, creditLimitHistoryResponse(history))
	})

	mux.HandleFunc("GET /accounts/{account_id}/credit-limit-history", func(w http.ResponseWriter, r *http.Request) {
		accountID, ok := parseAccountCreditLimitHistoryPath(w, r)
		if !ok {
			return
		}
		query, ok := parseListQuery(w, r, listQueryContract{
			AllowTombstoned: true,
			SortKeys: map[models.SortKey]struct{}{
				models.SortKeyCreatedAt:     {},
				models.SortKeyEffectiveDate: {},
			},
			DefaultSortKey: models.SortKeyEffectiveDate,
		})
		if !ok {
			return
		}

		history, err := deps.CreditLimits.ListByAccount(r.Context(), accountID, creditlimits.ListOptions{
			IncludeTombstoned: query.IncludeTombstoned,
			List:              serviceListOptions(query.List),
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.CreditLimitHistoryListResponse{CreditLimitHistory: creditLimitHistoryResponses(history)})
	})

	mux.HandleFunc("GET /credit-limit-history/{credit_limit_history_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/credit-limit-history/", "credit_limit_history_id")
		if !ok {
			return
		}
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		history, err := deps.CreditLimits.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, creditLimitHistoryResponse(history))
	})

	mux.HandleFunc("DELETE /credit-limit-history/{credit_limit_history_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/credit-limit-history/", "credit_limit_history_id")
		if !ok {
			return
		}

		if err := deps.CreditLimits.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

func creditLimitHistoryResponse(history creditlimits.CreditLimitHistory) models.CreditLimitHistory {
	return models.CreditLimitHistory{
		ID:            history.ID,
		AccountID:     history.AccountID,
		CreditLimit:   history.CreditLimit,
		EffectiveDate: history.EffectiveDate,
		CreatedAt:     history.CreatedAt,
		TombstonedAt:  history.TombstonedAt,
	}
}

func creditLimitHistoryResponses(history []creditlimits.CreditLimitHistory) []models.CreditLimitHistory {
	responses := make([]models.CreditLimitHistory, 0, len(history))
	for _, entry := range history {
		responses = append(responses, creditLimitHistoryResponse(entry))
	}

	return responses
}

func parseAccountCreditLimitHistoryPath(w http.ResponseWriter, r *http.Request) (int64, bool) {
	rawID := strings.TrimPrefix(r.URL.Path, "/accounts/")
	if rawID == r.URL.Path || !strings.HasSuffix(rawID, accountCreditLimitHistorySuffix) {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "account_id must be a positive integer")
		return 0, false
	}
	rawID = strings.TrimSuffix(rawID, accountCreditLimitHistorySuffix)
	if rawID == "" || strings.Contains(rawID, "/") {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "account_id must be a positive integer")
		return 0, false
	}

	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "account_id must be a positive integer")
		return 0, false
	}

	return id, true
}

func accountCreditLimitHistoryPath(path string) bool {
	rawID := strings.TrimPrefix(path, "/accounts/")
	if rawID == path || !strings.HasSuffix(rawID, accountCreditLimitHistorySuffix) {
		return false
	}
	rawID = strings.TrimSuffix(rawID, accountCreditLimitHistorySuffix)

	return rawID != "" && !strings.Contains(rawID, "/")
}
