package httpapi

import (
	"net/http"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/services/exchangerates"
)

func registerExchangeRateRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /exchange-rates", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateExchangeRateRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		rate, err := deps.ExchangeRates.Create(r.Context(), exchangerates.CreateInput{
			FromCurrency:  req.FromCurrency,
			ToCurrency:    req.ToCurrency,
			Rate:          req.Rate,
			EffectiveDate: req.EffectiveDate,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, exchangeRateResponse(rate))
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

		opts := exchangerates.ListOptions{
			IncludeTombstoned: query.IncludeTombstoned,
			List:              serviceListOptions(query.List),
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

		rates, err := deps.ExchangeRates.List(r.Context(), opts)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.ExchangeRateListResponse{ExchangeRates: exchangeRateResponses(rates)})
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

		rate, err := deps.ExchangeRates.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, exchangeRateResponse(rate))
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

		rate, err := deps.ExchangeRates.UpdateRate(r.Context(), id, exchangerates.UpdateInput{Rate: req.Rate})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, exchangeRateResponse(rate))
	})

	mux.HandleFunc("DELETE /exchange-rates/{exchange_rate_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/exchange-rates/", "exchange_rate_id")
		if !ok {
			return
		}

		if err := deps.ExchangeRates.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

func exchangeRateResponse(rate exchangerates.ExchangeRate) models.ExchangeRate {
	return models.ExchangeRate{
		ID:            rate.ID,
		FromCurrency:  rate.FromCurrency,
		ToCurrency:    rate.ToCurrency,
		Rate:          rate.Rate,
		EffectiveDate: rate.EffectiveDate,
		CreatedAt:     rate.CreatedAt,
		TombstonedAt:  rate.TombstonedAt,
	}
}

func exchangeRateResponses(rates []exchangerates.ExchangeRate) []models.ExchangeRate {
	responses := make([]models.ExchangeRate, 0, len(rates))
	for _, rate := range rates {
		responses = append(responses, exchangeRateResponse(rate))
	}

	return responses
}
