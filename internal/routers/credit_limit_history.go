package routers

import (
	"net/http"
	"strconv"
	"strings"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
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

		history, err := deps.Controllers.CreditLimitHistory.Create(r.Context(), accountID, req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, history)
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

		history, err := deps.Controllers.CreditLimitHistory.ListByAccount(r.Context(), accountID, controllers.CreditLimitHistoryListOptions{
			IncludeTombstoned: query.IncludeTombstoned,
			List:              query.List,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.CreditLimitHistoryListResponse{CreditLimitHistory: history})
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

		history, err := deps.Controllers.CreditLimitHistory.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, history)
	})

	mux.HandleFunc("DELETE /credit-limit-history/{credit_limit_history_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/credit-limit-history/", "credit_limit_history_id")
		if !ok {
			return
		}

		if err := deps.Controllers.CreditLimitHistory.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
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
