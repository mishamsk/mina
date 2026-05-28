package routers

import (
	"net/http"

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
}

func rejectQueryParams(w http.ResponseWriter, r *http.Request) bool {
	if len(r.URL.Query()) == 0 {
		return true
	}

	WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "unsupported list query parameter")
	return false
}
