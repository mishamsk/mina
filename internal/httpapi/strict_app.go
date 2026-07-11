package httpapi

import (
	"context"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
)

func (s *strictServer) SeedDemo(ctx context.Context, _ openapi.SeedDemoRequestObject) (openapi.SeedDemoResponseObject, error) {
	summary, err := s.deps.Demo.Seed(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.SeedDemo200JSONResponse{
		Accounts:             summary.Accounts,
		Categories:           summary.Categories,
		CreditLimitEntries:   summary.CreditLimitEntries,
		ExchangeRates:        summary.ExchangeRates,
		Members:              summary.Members,
		RecurringDefinitions: summary.RecurringDefinitions,
		RecurringOccurrences: summary.RecurringOccurrences,
		Tags:                 summary.Tags,
		Transactions:         summary.Transactions,
	}, nil
}
