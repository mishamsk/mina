package transactions

import "context"

const (
	maxFilterLength            = 4096
	maxFilterTerms             = 100
	maxFilterDepth             = 10
	maxFilterRelativeMagnitude = 100000
)

func (s *Service) resolveTransactionFilter(ctx context.Context, text string) (*ResolvedFilter, error) {
	expression, err := parseFilterExpression(text, s.clock.Now().UTC())
	if err != nil {
		return nil, err
	}
	if err := s.resolveFilterReferences(ctx, expression); err != nil {
		return nil, err
	}
	return &ResolvedFilter{Expression: expression}, nil
}
