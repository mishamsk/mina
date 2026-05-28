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
		query, ok := parseListQuery(w, r, listQueryContract{
			AllowTombstoned: true,
			FilterKeys: map[models.FilterKey]struct{}{
				models.FilterKeyEffectiveDate: {},
				models.FilterKeyFromCurrency:  {},
				models.FilterKeyToCurrency:    {},
			},
			SortKeys: map[models.SortKey]struct{}{
				models.SortKeyCreatedAt:     {},
				models.SortKeyCurrencyPair:  {},
				models.SortKeyEffectiveDate: {},
				models.SortKeyFromCurrency:  {},
				models.SortKeyToCurrency:    {},
			},
			DefaultSortKey: models.SortKeyCurrencyPair,
		})
		if !ok {
			return
		}

		opts := controllers.ExchangeRateListOptions{
			IncludeTombstoned: query.IncludeTombstoned,
			List:              query.List,
		}
		if value, ok := query.Filters[models.FilterKeyFromCurrency]; ok {
			opts.FromCurrency = &value
		}
		if value, ok := query.Filters[models.FilterKeyToCurrency]; ok {
			opts.ToCurrency = &value
		}
		if value, ok := query.Filters[models.FilterKeyEffectiveDate]; ok {
			opts.EffectiveDate = &value
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
