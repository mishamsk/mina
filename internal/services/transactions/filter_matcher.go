package transactions

import (
	"slices"

	"github.com/mishamsk/mina/internal/services"
)

// FilterMatchesTransaction applies one resolved filter to an already
// classified non-persisted transaction.
func FilterMatchesTransaction(transaction Transaction, filter *ResolvedFilter, referenceFQN FilterReferenceFQN) bool {
	if filter == nil {
		return true
	}
	return filterExpressionMatchesTransaction(transaction, filter.Expression, referenceFQN)
}

func filterExpressionMatchesTransaction(transaction Transaction, expression FilterExpression, referenceFQN FilterReferenceFQN) bool {
	switch node := expression.(type) {
	case *FilterAnd:
		return !slices.ContainsFunc(node.Terms, func(term FilterExpression) bool {
			return !filterExpressionMatchesTransaction(transaction, term, referenceFQN)
		})
	case *FilterOr:
		return slices.ContainsFunc(node.Terms, func(term FilterExpression) bool {
			return filterExpressionMatchesTransaction(transaction, term, referenceFQN)
		})
	case *FilterNot:
		return !filterExpressionMatchesTransaction(transaction, node.Term, referenceFQN)
	case *FilterEntityTerm:
		return slices.ContainsFunc(transaction.Records, func(record JournalRecord) bool {
			return filterEntityMatchesRecord(record, node, referenceFQN)
		})
	case *FilterMemberTerm:
		return slices.ContainsFunc(transaction.Records, func(record JournalRecord) bool {
			return record.MemberID != nil && *record.MemberID == node.MemberID
		})
	case *FilterCurrencyTerm:
		return slices.ContainsFunc(transaction.Records, func(record JournalRecord) bool {
			return record.Currency == node.Currency
		})
	case *FilterEnumTerm:
		return filterEnumMatchesTransaction(transaction, node)
	case *FilterDecimalTerm:
		return slices.ContainsFunc(transaction.Records, func(record JournalRecord) bool {
			if node.Field == FilterFieldAmountUSD {
				return record.AmountUSD != nil && filterComparisonMatches(record.AmountUSD.Cmp(node.Value), node.Op)
			}
			return filterComparisonMatches(record.Amount.Cmp(node.Value), node.Op)
		})
	case *FilterDateTerm:
		return filterComparisonMatches(transaction.InitiatedDate.Time().Compare(node.Date.Time()), node.Op)
	case *FilterTimestampTerm:
		return slices.ContainsFunc(transaction.Records, func(record JournalRecord) bool {
			value := record.PendingDate
			if node.Field == FilterFieldPosted {
				value = record.PostedDate
			}
			return value != nil && filterComparisonMatches(value.Compare(node.Time), node.Op)
		})
	default:
		return false
	}
}

func filterEntityMatchesRecord(record JournalRecord, term *FilterEntityTerm, referenceFQN FilterReferenceFQN) bool {
	if !term.Scoped {
		switch term.Field {
		case FilterFieldAccount:
			return record.AccountID == term.EntityID
		case FilterFieldCategory:
			return record.CategoryID != nil && *record.CategoryID == term.EntityID
		default:
			return slices.Contains(record.TagIDs, term.EntityID)
		}
	}
	matches := func(fqn string) bool {
		if term.FQN == "" {
			return true
		}
		return services.FQNAtOrUnder(fqn, term.FQN)
	}
	switch term.Field {
	case FilterFieldAccount:
		return matches(record.AccountFQN)
	case FilterFieldCategory:
		return record.CategoryID != nil && matches(referenceFQN(term.Field, *record.CategoryID))
	default:
		return slices.ContainsFunc(record.TagIDs, func(id int64) bool {
			return matches(referenceFQN(term.Field, id))
		})
	}
}

func filterEnumMatchesTransaction(transaction Transaction, term *FilterEnumTerm) bool {
	switch term.Field {
	case FilterFieldLifecycle:
		return transaction.LifecycleStatus == LifecycleStatus(term.Value)
	case FilterFieldSettlement:
		return transaction.Settlement == SettlementSummary(term.Value)
	case FilterFieldClass:
		return transaction.Class == TransactionClass(term.Value)
	case FilterFieldShape:
		return slices.ContainsFunc(transaction.Shapes, func(shape TransactionShape) bool {
			return shape.Shape == TransactionShapeType(term.Value)
		})
	default:
		return slices.ContainsFunc(transaction.Records, func(record JournalRecord) bool {
			return record.Role == RecordRole(term.Value)
		})
	}
}

func filterComparisonMatches(comparison int, operator FilterCompareOp) bool {
	switch operator {
	case FilterCompareEqual:
		return comparison == 0
	case FilterCompareGreater:
		return comparison > 0
	case FilterCompareAtLeast:
		return comparison >= 0
	case FilterCompareLess:
		return comparison < 0
	case FilterCompareAtMost:
		return comparison <= 0
	default:
		return false
	}
}
