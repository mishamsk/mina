package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
)

func registerTransactionRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /transactions", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateTransactionRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		transaction, err := deps.Controllers.Transactions.Create(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, transaction)
	})

	mux.HandleFunc("GET /transactions", func(w http.ResponseWriter, r *http.Request) {
		if !rejectQueryParams(w, r) {
			return
		}

		transactions, err := deps.Controllers.Transactions.List(r.Context())
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.TransactionListResponse{Transactions: transactions})
	})

	mux.HandleFunc("GET /transactions/{transaction_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/transactions/", "transaction_id")
		if !ok {
			return
		}

		transaction, err := deps.Controllers.Transactions.Get(r.Context(), id)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, transaction)
	})

	mux.HandleFunc("PUT /transactions/{transaction_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/transactions/", "transaction_id")
		if !ok {
			return
		}

		var req models.UpdateTransactionRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		transaction, err := deps.Controllers.Transactions.Replace(r.Context(), id, req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, transaction)
	})

	mux.HandleFunc("DELETE /transactions/{transaction_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/transactions/", "transaction_id")
		if !ok {
			return
		}

		if err := deps.Controllers.Transactions.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /records", func(w http.ResponseWriter, r *http.Request) {
		opts, ok := parseRecordSearchOptions(w, r, true)
		if !ok {
			return
		}

		records, err := deps.Controllers.Transactions.SearchRecords(r.Context(), opts)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.JournalRecordSearchResponse{Records: records})
	})

	mux.HandleFunc("GET /accounts/{account_id}/records", func(w http.ResponseWriter, r *http.Request) {
		accountID, ok := parseAccountRecordsPath(w, r)
		if !ok {
			return
		}
		opts, ok := parseRecordSearchOptions(w, r, false)
		if !ok {
			return
		}
		opts.AccountID = &accountID

		records, err := deps.Controllers.Transactions.SearchRecords(r.Context(), opts)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.JournalRecordSearchResponse{Records: records})
	})

	mux.HandleFunc("POST /records/bulk/category", func(w http.ResponseWriter, r *http.Request) {
		var req models.BulkCategorizeRecordsRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		response, err := deps.Controllers.Transactions.BulkCategorize(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, response)
	})

	mux.HandleFunc("POST /records/bulk/tags", func(w http.ResponseWriter, r *http.Request) {
		var req models.BulkTagRecordsRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		response, err := deps.Controllers.Transactions.BulkUpdateTags(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, response)
	})

	mux.HandleFunc("POST /records/bulk/account", func(w http.ResponseWriter, r *http.Request) {
		var req models.BulkReassignRecordsAccountRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		response, err := deps.Controllers.Transactions.BulkReassignAccount(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, response)
	})

	mux.HandleFunc("POST /records/bulk/status", func(w http.ResponseWriter, r *http.Request) {
		var req models.BulkUpdateRecordStatusRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		response, err := deps.Controllers.Transactions.BulkUpdateStatuses(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, response)
	})
}

func rejectQueryParams(w http.ResponseWriter, r *http.Request) bool {
	if len(r.URL.Query()) == 0 {
		return true
	}

	WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "unsupported list query parameter")
	return false
}

func parseRecordSearchOptions(w http.ResponseWriter, r *http.Request, allowAccountID bool) (controllers.RecordSearchOptions, bool) {
	query := r.URL.Query()
	allowed := map[models.FilterKey]struct{}{
		models.FilterKeyAmountMax:            {},
		models.FilterKeyAmountMin:            {},
		models.FilterKeyAmountUSDMax:         {},
		models.FilterKeyAmountUSDMin:         {},
		models.FilterKeyCategoryID:           {},
		models.FilterKeyInitiatedDateFrom:    {},
		models.FilterKeyInitiatedDateTo:      {},
		models.FilterKeyMemberID:             {},
		models.FilterKeyMemoContains:         {},
		models.FilterKeyPendingDateFrom:      {},
		models.FilterKeyPendingDateTo:        {},
		models.FilterKeyPostedDateFrom:       {},
		models.FilterKeyPostedDateTo:         {},
		models.FilterKeyPostingStatus:        {},
		models.FilterKeyReconciliationStatus: {},
		models.FilterKeyTagID:                {},
	}
	if allowAccountID {
		allowed[models.FilterKeyAccountID] = struct{}{}
	}
	for name, values := range query {
		if _, ok := allowed[models.FilterKey(name)]; !ok {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "unsupported record filter")
			return controllers.RecordSearchOptions{}, false
		}
		if len(values) != 1 || values[0] == "" {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" must have one non-empty value")
			return controllers.RecordSearchOptions{}, false
		}
	}

	opts := controllers.RecordSearchOptions{}
	if !setInt64Filter(w, query, models.FilterKeyAccountID, &opts.AccountID) ||
		!setInt64Filter(w, query, models.FilterKeyCategoryID, &opts.CategoryID) ||
		!setInt64Filter(w, query, models.FilterKeyMemberID, &opts.MemberID) ||
		!setInt64Filter(w, query, models.FilterKeyTagID, &opts.TagID) {
		return controllers.RecordSearchOptions{}, false
	}
	setStringFilter(query, models.FilterKeyAmountMin, &opts.AmountMin)
	setStringFilter(query, models.FilterKeyAmountMax, &opts.AmountMax)
	setStringFilter(query, models.FilterKeyAmountUSDMin, &opts.AmountUSDMin)
	setStringFilter(query, models.FilterKeyAmountUSDMax, &opts.AmountUSDMax)
	setStringFilter(query, models.FilterKeyInitiatedDateFrom, &opts.InitiatedDateFrom)
	setStringFilter(query, models.FilterKeyInitiatedDateTo, &opts.InitiatedDateTo)
	setStringFilter(query, models.FilterKeyPendingDateFrom, &opts.PendingDateFrom)
	setStringFilter(query, models.FilterKeyPendingDateTo, &opts.PendingDateTo)
	setStringFilter(query, models.FilterKeyPostedDateFrom, &opts.PostedDateFrom)
	setStringFilter(query, models.FilterKeyPostedDateTo, &opts.PostedDateTo)
	setStringFilter(query, models.FilterKeyMemoContains, &opts.MemoContains)
	if values, ok := query[string(models.FilterKeyPostingStatus)]; ok {
		value := models.PostingStatus(values[0])
		opts.PostingStatus = &value
	}
	if values, ok := query[string(models.FilterKeyReconciliationStatus)]; ok {
		value := models.ReconciliationStatus(values[0])
		opts.ReconciliationStatus = &value
	}

	return opts, true
}

func setInt64Filter(w http.ResponseWriter, query map[string][]string, name models.FilterKey, dst **int64) bool {
	key := string(name)
	values, ok := query[key]
	if !ok {
		return true
	}
	parsed, err := strconv.ParseInt(values[0], 10, 64)
	if err != nil || parsed <= 0 {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, key+" must be a positive integer")
		return false
	}
	*dst = &parsed

	return true
}

func setStringFilter(query map[string][]string, name models.FilterKey, dst **string) {
	if values, ok := query[string(name)]; ok {
		*dst = &values[0]
	}
}

func parseAccountRecordsPath(w http.ResponseWriter, r *http.Request) (int64, bool) {
	rawID := strings.TrimPrefix(r.URL.Path, "/accounts/")
	if rawID == r.URL.Path || !strings.HasSuffix(rawID, "/records") {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "account_id must be a positive integer")
		return 0, false
	}
	rawID = strings.TrimSuffix(rawID, "/records")
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

func accountRecordsPath(path string) bool {
	rawID := strings.TrimPrefix(path, "/accounts/")
	if rawID == path || !strings.HasSuffix(rawID, "/records") {
		return false
	}
	rawID = strings.TrimSuffix(rawID, "/records")

	return rawID != "" && !strings.Contains(rawID, "/")
}

func recordBulkOperationPath(path string) bool {
	switch path {
	case "/records/bulk/category", "/records/bulk/tags", "/records/bulk/account", "/records/bulk/status":
		return true
	default:
		return false
	}
}
