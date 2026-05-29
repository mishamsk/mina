package httpapi

import (
	"context"

	"mina.local/mina/internal/httpapi/models"
	"mina.local/mina/internal/httpapi/openapi"
	"mina.local/mina/internal/services"
	"mina.local/mina/internal/services/creditlimits"
	"mina.local/mina/internal/services/exchangerates"
)

func (s *strictServer) ListCreditLimitHistory(ctx context.Context, request openapi.ListCreditLimitHistoryRequestObject) (openapi.ListCreditLimitHistoryResponseObject, error) {
	if err := positivePathID(request.AccountId, "account_id"); err != nil {
		return nil, err
	}
	r, err := requestFromStrictContext(ctx)
	if err != nil {
		return nil, err
	}
	query, err := parseListQueryForStrict(r, creditLimitHistoryListContract())
	if err != nil {
		return nil, err
	}

	history, err := s.deps.CreditLimits.ListByAccount(ctx, request.AccountId, creditlimits.ListOptions{
		IncludeTombstoned: query.IncludeTombstoned,
		List:              serviceListOptions(query.List),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListCreditLimitHistory200JSONResponse{CreditLimitHistory: creditLimitHistoryAPIResponses(history)}, nil
}

func (s *strictServer) CreateCreditLimitHistory(ctx context.Context, request openapi.CreateCreditLimitHistoryRequestObject) (openapi.CreateCreditLimitHistoryResponseObject, error) {
	if err := positivePathID(request.AccountId, "account_id"); err != nil {
		return nil, err
	}
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	history, err := s.deps.CreditLimits.Create(ctx, request.AccountId, creditlimits.CreateInput{
		CreditLimit:   request.Body.CreditLimit,
		EffectiveDate: request.Body.EffectiveDate,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateCreditLimitHistory201JSONResponse(creditLimitHistoryAPIResponse(history)), nil
}

func (s *strictServer) DeleteCreditLimitHistory(ctx context.Context, request openapi.DeleteCreditLimitHistoryRequestObject) (openapi.DeleteCreditLimitHistoryResponseObject, error) {
	if err := positivePathID(request.CreditLimitHistoryId, "credit_limit_history_id"); err != nil {
		return nil, err
	}
	if err := s.deps.CreditLimits.Delete(ctx, request.CreditLimitHistoryId); err != nil {
		return nil, err
	}

	return openapi.DeleteCreditLimitHistory204Response{}, nil
}

func (s *strictServer) GetCreditLimitHistory(ctx context.Context, request openapi.GetCreditLimitHistoryRequestObject) (openapi.GetCreditLimitHistoryResponseObject, error) {
	if err := positivePathID(request.CreditLimitHistoryId, "credit_limit_history_id"); err != nil {
		return nil, err
	}
	history, err := s.deps.CreditLimits.Get(ctx, request.CreditLimitHistoryId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetCreditLimitHistory200JSONResponse(creditLimitHistoryAPIResponse(history)), nil
}

func (s *strictServer) ListExchangeRates(ctx context.Context, _ openapi.ListExchangeRatesRequestObject) (openapi.ListExchangeRatesResponseObject, error) {
	r, err := requestFromStrictContext(ctx)
	if err != nil {
		return nil, err
	}
	query, err := parseListQueryForStrict(r, exchangeRateListContract())
	if err != nil {
		return nil, err
	}

	rates, err := s.deps.ExchangeRates.List(ctx, exchangerates.ListOptions{
		FromCurrency:      optionalFilter(query.Filters, models.FilterKeyFromCurrency),
		ToCurrency:        optionalFilter(query.Filters, models.FilterKeyToCurrency),
		EffectiveDate:     optionalFilter(query.Filters, models.FilterKeyEffectiveDate),
		IncludeTombstoned: query.IncludeTombstoned,
		List:              serviceListOptions(query.List),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListExchangeRates200JSONResponse{ExchangeRates: exchangeRateAPIResponses(rates)}, nil
}

func (s *strictServer) CreateExchangeRate(ctx context.Context, request openapi.CreateExchangeRateRequestObject) (openapi.CreateExchangeRateResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	rate, err := s.deps.ExchangeRates.Create(ctx, exchangerates.CreateInput{
		FromCurrency:  request.Body.FromCurrency,
		ToCurrency:    request.Body.ToCurrency,
		Rate:          request.Body.Rate,
		EffectiveDate: request.Body.EffectiveDate,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateExchangeRate201JSONResponse(exchangeRateAPIResponse(rate)), nil
}

func (s *strictServer) DeleteExchangeRate(ctx context.Context, request openapi.DeleteExchangeRateRequestObject) (openapi.DeleteExchangeRateResponseObject, error) {
	if err := positivePathID(request.ExchangeRateId, "exchange_rate_id"); err != nil {
		return nil, err
	}
	if err := s.deps.ExchangeRates.Delete(ctx, request.ExchangeRateId); err != nil {
		return nil, err
	}

	return openapi.DeleteExchangeRate204Response{}, nil
}

func (s *strictServer) GetExchangeRate(ctx context.Context, request openapi.GetExchangeRateRequestObject) (openapi.GetExchangeRateResponseObject, error) {
	if err := positivePathID(request.ExchangeRateId, "exchange_rate_id"); err != nil {
		return nil, err
	}
	rate, err := s.deps.ExchangeRates.Get(ctx, request.ExchangeRateId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetExchangeRate200JSONResponse(exchangeRateAPIResponse(rate)), nil
}

func (s *strictServer) UpdateExchangeRate(ctx context.Context, request openapi.UpdateExchangeRateRequestObject) (openapi.UpdateExchangeRateResponseObject, error) {
	if err := positivePathID(request.ExchangeRateId, "exchange_rate_id"); err != nil {
		return nil, err
	}
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	rate, err := s.deps.ExchangeRates.UpdateRate(ctx, request.ExchangeRateId, exchangerates.UpdateInput{Rate: request.Body.Rate})
	if err != nil {
		return nil, err
	}

	return openapi.UpdateExchangeRate200JSONResponse(exchangeRateAPIResponse(rate)), nil
}

func optionalFilter(filters map[models.FilterKey]string, key models.FilterKey) *string {
	value, ok := filters[key]
	if !ok {
		return nil
	}

	return &value
}

func creditLimitHistoryListContract() listQueryContract {
	return listQueryContract{
		AllowTombstoned: true,
		SortKeys: map[models.SortKey]struct{}{
			models.SortKeyCreatedAt:     {},
			models.SortKeyEffectiveDate: {},
		},
		DefaultSortKey: models.SortKeyEffectiveDate,
	}
}

func exchangeRateListContract() listQueryContract {
	return listQueryContract{
		AllowTombstoned: true,
		FilterKeys: map[models.FilterKey]struct{}{
			models.FilterKeyFromCurrency:  {},
			models.FilterKeyToCurrency:    {},
			models.FilterKeyEffectiveDate: {},
		},
		SortKeys: map[models.SortKey]struct{}{
			models.SortKeyCreatedAt:     {},
			models.SortKeyCurrencyPair:  {},
			models.SortKeyEffectiveDate: {},
			models.SortKeyFromCurrency:  {},
			models.SortKeyToCurrency:    {},
		},
		DefaultSortKey: models.SortKeyCurrencyPair,
	}
}

func creditLimitHistoryAPIResponse(history creditlimits.CreditLimitHistory) openapi.CreditLimitHistory {
	return openapi.CreditLimitHistory{
		CreditLimitHistoryId: history.ID,
		AccountId:            history.AccountID,
		CreditLimit:          history.CreditLimit,
		EffectiveDate:        history.EffectiveDate,
		CreatedAt:            history.CreatedAt,
		TombstonedAt:         history.TombstonedAt,
	}
}

func creditLimitHistoryAPIResponses(history []creditlimits.CreditLimitHistory) []openapi.CreditLimitHistory {
	responses := make([]openapi.CreditLimitHistory, 0, len(history))
	for _, entry := range history {
		responses = append(responses, creditLimitHistoryAPIResponse(entry))
	}

	return responses
}

func exchangeRateAPIResponse(rate exchangerates.ExchangeRate) openapi.ExchangeRate {
	return openapi.ExchangeRate{
		ExchangeRateId: rate.ID,
		FromCurrency:   rate.FromCurrency,
		ToCurrency:     rate.ToCurrency,
		Rate:           rate.Rate,
		EffectiveDate:  rate.EffectiveDate,
		CreatedAt:      rate.CreatedAt,
		TombstonedAt:   rate.TombstonedAt,
	}
}

func exchangeRateAPIResponses(rates []exchangerates.ExchangeRate) []openapi.ExchangeRate {
	responses := make([]openapi.ExchangeRate, 0, len(rates))
	for _, rate := range rates {
		responses = append(responses, exchangeRateAPIResponse(rate))
	}

	return responses
}
