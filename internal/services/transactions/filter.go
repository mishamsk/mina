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
	bindFilterAmountCurrencies(expression, nil)
	return &ResolvedFilter{Expression: expression}, nil
}

// Currency restrictions are resolved once so SQL and projection matching share
// branch scope. Flatten AND only; OR and NOT remain complete predicates.
func bindFilterAmountCurrencies(expression FilterExpression, inherited []FilterExpression) {
	switch node := expression.(type) {
	case *FilterAnd:
		terms := flattenFilterAnd(node)
		constraints := append([]FilterExpression{}, inherited...)
		positive := []FilterExpression{}
		for _, term := range terms {
			if _, ok := term.(*FilterCurrencyTerm); ok {
				positive = append(positive, term)
			} else if filterCurrencyOnly(term) {
				constraints = append(constraints, term)
			}
		}
		if len(positive) > 0 {
			constraints = append(constraints, &FilterOr{Terms: positive})
		}
		for _, term := range terms {
			bindFilterAmountCurrencies(term, constraints)
		}
	case *FilterOr:
		for _, term := range node.Terms {
			bindFilterAmountCurrencies(term, inherited)
		}
	case *FilterNot:
		bindFilterAmountCurrencies(node.Term, inherited)
	case *FilterDecimalTerm:
		node.CurrencyConstraints = inherited
	}
}

func flattenFilterAnd(expression FilterExpression) []FilterExpression {
	if node, ok := expression.(*FilterAnd); ok {
		terms := []FilterExpression{}
		for _, term := range node.Terms {
			terms = append(terms, flattenFilterAnd(term)...)
		}
		return terms
	}
	return []FilterExpression{expression}
}

func filterCurrencyOnly(expression FilterExpression) bool {
	switch node := expression.(type) {
	case *FilterCurrencyTerm:
		return true
	case *FilterNot:
		return filterCurrencyOnly(node.Term)
	case *FilterAnd:
		for _, term := range node.Terms {
			if !filterCurrencyOnly(term) {
				return false
			}
		}
		return true
	case *FilterOr:
		for _, term := range node.Terms {
			if !filterCurrencyOnly(term) {
				return false
			}
		}
		return true
	default:
		return false
	}
}
