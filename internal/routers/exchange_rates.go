package routers

import (
	"net/http"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
)

func registerExchangeRateRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /exchange-rates", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateExchangeRateRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		rate, err := deps.Controllers.ExchangeRates.Create(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, rate)
	})

	mux.HandleFunc("GET /exchange-rates", func(w http.ResponseWriter, r *http.Request) {
		opts, ok := parseExchangeRateListOptions(w, r)
		if !ok {
			return
		}

		rates, err := deps.Controllers.ExchangeRates.List(r.Context(), opts)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.ExchangeRateListResponse{ExchangeRates: rates})
	})

	mux.HandleFunc("GET /exchange-rates/{exchange_rate_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/exchange-rates/", "exchange_rate_id")
		if !ok {
			return
		}
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		rate, err := deps.Controllers.ExchangeRates.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, rate)
	})

	mux.HandleFunc("PATCH /exchange-rates/{exchange_rate_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/exchange-rates/", "exchange_rate_id")
		if !ok {
			return
		}

		var req models.UpdateExchangeRateRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		rate, err := deps.Controllers.ExchangeRates.UpdateRate(r.Context(), id, req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, rate)
	})

	mux.HandleFunc("DELETE /exchange-rates/{exchange_rate_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/exchange-rates/", "exchange_rate_id")
		if !ok {
			return
		}

		if err := deps.Controllers.ExchangeRates.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

func parseExchangeRateListOptions(w http.ResponseWriter, r *http.Request) (controllers.ExchangeRateListOptions, bool) {
	query := r.URL.Query()
	for name, values := range query {
		switch name {
		case "from_currency", "to_currency", "effective_date", "include_tombstoned":
			if len(values) != 1 || values[0] == "" {
				WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" must have one non-empty value")
				return controllers.ExchangeRateListOptions{}, false
			}
		default:
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "unsupported exchange rate filter")
			return controllers.ExchangeRateListOptions{}, false
		}
	}

	includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
	if !ok {
		return controllers.ExchangeRateListOptions{}, false
	}

	opts := controllers.ExchangeRateListOptions{
		IncludeTombstoned: includeTombstoned,
	}
	if values, ok := query["from_currency"]; ok {
		opts.FromCurrency = &values[0]
	}
	if values, ok := query["to_currency"]; ok {
		opts.ToCurrency = &values[0]
	}
	if values, ok := query["effective_date"]; ok {
		opts.EffectiveDate = &values[0]
	}

	return opts, true
}
