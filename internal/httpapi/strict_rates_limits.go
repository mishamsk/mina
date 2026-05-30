package httpapi

import (
	"context"

	"mina.local/mina/internal/httpapi/openapi"
	"mina.local/mina/internal/services"
	"mina.local/mina/internal/services/creditlimits"
	"mina.local/mina/internal/services/exchangerates"
)

func (s *strictServer) ListCreditLimitHistory(ctx context.Context, request openapi.ListCreditLimitHistoryRequestObject) (openapi.ListCreditLimitHistoryResponseObject, error) {
	params := request.Params
	history, err := s.deps.CreditLimits.ListByAccount(ctx, request.AccountId, creditlimits.ListOptions{
		IncludeTombstoned: boolParam(params.IncludeTombstoned),
		List: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyEffectiveDate,
		),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListCreditLimitHistory200JSONResponse{CreditLimitHistory: creditLimitHistoryAPIResponses(history)}, nil
}

func (s *strictServer) CreateCreditLimitHistory(ctx context.Context, request openapi.CreateCreditLimitHistoryRequestObject) (openapi.CreateCreditLimitHistoryResponseObject, error) {
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
	if err := s.deps.CreditLimits.Delete(ctx, request.CreditLimitHistoryId); err != nil {
		return nil, err
	}

	return openapi.DeleteCreditLimitHistory204Response{}, nil
}

func (s *strictServer) GetCreditLimitHistory(ctx context.Context, request openapi.GetCreditLimitHistoryRequestObject) (openapi.GetCreditLimitHistoryResponseObject, error) {
	history, err := s.deps.CreditLimits.Get(ctx, request.CreditLimitHistoryId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetCreditLimitHistory200JSONResponse(creditLimitHistoryAPIResponse(history)), nil
}

func (s *strictServer) ListExchangeRates(ctx context.Context, request openapi.ListExchangeRatesRequestObject) (openapi.ListExchangeRatesResponseObject, error) {
	params := request.Params
	rates, err := s.deps.ExchangeRates.List(ctx, exchangerates.ListOptions{
		FromCurrency:      params.FromCurrency,
		ToCurrency:        params.ToCurrency,
		EffectiveDate:     params.EffectiveDate,
		IncludeTombstoned: boolParam(params.IncludeTombstoned),
		List: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyCurrencyPair,
		),
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
	if err := s.deps.ExchangeRates.Delete(ctx, request.ExchangeRateId); err != nil {
		return nil, err
	}

	return openapi.DeleteExchangeRate204Response{}, nil
}

func (s *strictServer) GetExchangeRate(ctx context.Context, request openapi.GetExchangeRateRequestObject) (openapi.GetExchangeRateResponseObject, error) {
	rate, err := s.deps.ExchangeRates.Get(ctx, request.ExchangeRateId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetExchangeRate200JSONResponse(exchangeRateAPIResponse(rate)), nil
}

func (s *strictServer) UpdateExchangeRate(ctx context.Context, request openapi.UpdateExchangeRateRequestObject) (openapi.UpdateExchangeRateResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	rate, err := s.deps.ExchangeRates.UpdateRate(ctx, request.ExchangeRateId, exchangerates.UpdateInput{Rate: request.Body.Rate})
	if err != nil {
		return nil, err
	}

	return openapi.UpdateExchangeRate200JSONResponse(exchangeRateAPIResponse(rate)), nil
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
