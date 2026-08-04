package transactiontemplates

import (
	"context"
	"errors"
	"slices"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/values"
)

// TemplateShorthandType identifies a manual-entry shorthand compatible with a template.
type TemplateShorthandType string

const (
	TemplateShorthandSpend    TemplateShorthandType = "spend"
	TemplateShorthandIncome   TemplateShorthandType = "income"
	TemplateShorthandRefund   TemplateShorthandType = "refund"
	TemplateShorthandTransfer TemplateShorthandType = "transfer"
)

type resolvedTemplateRecord struct {
	input   TemplateRecord
	account accounts.Reference
	intent  categories.CategoryEconomicIntent
	role    transactions.RecordRole
}

// compatibleShorthands derives the manual-entry shorthands that can represent a template.
// Invalid and advanced-only shapes return no matches; compatible partial shapes
// may return multiple matches.
func (s *Service) compatibleShorthands(ctx context.Context, records []TemplateRecord) ([]TemplateShorthandType, error) {
	if !templateShorthandFieldsCompatible(records) {
		return []TemplateShorthandType{}, nil
	}

	accountIDs := make([]int64, 0, len(records))
	categoryIDs := make([]int64, 0, len(records))
	allAmountsPresent := true
	for _, record := range records {
		if record.AccountID == nil {
			return []TemplateShorthandType{}, nil
		}
		accountIDs = append(accountIDs, *record.AccountID)
		if record.CategoryID != nil {
			categoryIDs = append(categoryIDs, *record.CategoryID)
		}
		allAmountsPresent = allAmountsPresent && record.Amount != nil
	}

	accountRefs, err := s.accounts.ValidateActiveReferences(ctx, accountIDs, accounts.ReferenceOptions{AllowHidden: true})
	if errors.Is(err, services.ErrInvalidReference) {
		return []TemplateShorthandType{}, nil
	}
	if err != nil {
		return nil, err
	}
	categoryRefs, err := s.categories.ValidateActiveReferences(ctx, categoryIDs, categories.ReferenceOptions{AllowHidden: true})
	if errors.Is(err, services.ErrInvalidReference) {
		return []TemplateShorthandType{}, nil
	}
	if err != nil {
		return nil, err
	}

	resolved := make([]resolvedTemplateRecord, 0, len(records))
	semantic := make([]transactions.SemanticRecord, 0, len(records))
	for _, record := range records {
		account, ok := accountRefs[*record.AccountID]
		if !ok || (account.Currency != nil && record.Currency != nil && *account.Currency != *record.Currency) {
			return []TemplateShorthandType{}, nil
		}
		var intent categories.CategoryEconomicIntent
		if account.AccountType == accounts.AccountTypeFlow {
			if record.CategoryID == nil {
				return []TemplateShorthandType{}, nil
			}
			category, ok := categoryRefs[*record.CategoryID]
			if !ok {
				return []TemplateShorthandType{}, nil
			}
			intent = category.EconomicIntent
		} else if record.CategoryID != nil {
			return []TemplateShorthandType{}, nil
		}
		resolved = append(resolved, resolvedTemplateRecord{input: record, account: account, intent: intent})
	}

	currency, ok := singleTemplateCurrency(resolved)
	if !ok {
		return []TemplateShorthandType{}, nil
	}
	if !allAmountsPresent {
		if fitsTemplatePartialChargedTransfer(resolved) {
			return []TemplateShorthandType{TemplateShorthandTransfer}, nil
		}
		return compatibleShorthandsWithoutAmounts(resolved), nil
	}
	for _, record := range resolved {
		semantic = append(semantic, transactions.SemanticRecord{
			Currency:       currency,
			Amount:         *record.input.Amount,
			AccountFQN:     record.account.FQN,
			AccountType:    record.account.AccountType,
			CategoryID:     record.input.CategoryID,
			EconomicIntent: record.intent,
		})
	}

	classified, err := transactions.ClassifySemanticRecords(semantic)
	if err != nil {
		return []TemplateShorthandType{}, nil
	}
	for index := range resolved {
		resolved[index].role = classified.Roles[index]
	}

	if fitsTemplateChargedTransfer(classified.Class, resolved) {
		return []TemplateShorthandType{TemplateShorthandTransfer}, nil
	}
	if fitsTemplateSpend(classified.Class, resolved) {
		return []TemplateShorthandType{TemplateShorthandSpend}, nil
	}
	if shorthandType := fitTemplateTwoRecord(classified.Class, resolved); shorthandType != "" {
		return []TemplateShorthandType{shorthandType}, nil
	}
	return []TemplateShorthandType{}, nil
}

func templateShorthandFieldsCompatible(records []TemplateRecord) bool {
	if len(records) == 0 {
		return false
	}
	tagIDs := records[0].TagIDs
	var memberID *int64
	var memo *string
	for _, record := range records {
		if !slices.Equal(tagIDs, record.TagIDs) {
			return false
		}
		if record.MemberID != nil {
			if memberID != nil && *memberID != *record.MemberID {
				return false
			}
			memberID = record.MemberID
		}
		if record.Memo != nil {
			if memo != nil && *memo != *record.Memo {
				return false
			}
			memo = record.Memo
		}
	}
	return true
}

func compatibleShorthandsWithoutAmounts(records []resolvedTemplateRecord) []TemplateShorthandType {
	balances := filterTemplateRecords(records, isTemplateBalance)
	expenses := filterTemplateRecords(records, func(record resolvedTemplateRecord) bool {
		return record.account.AccountType == accounts.AccountTypeFlow && record.intent == categories.CategoryEconomicIntentExpense
	})
	income := filterTemplateRecords(records, func(record resolvedTemplateRecord) bool {
		return record.account.AccountType == accounts.AccountTypeFlow && record.intent == categories.CategoryEconomicIntentIncome
	})

	compatible := []TemplateShorthandType{}
	if len(balances) == 1 && len(expenses) > 0 && len(records) == len(balances)+len(expenses) {
		compatible = append(compatible, TemplateShorthandSpend)
		if len(expenses) == 1 {
			compatible = append(compatible, TemplateShorthandRefund)
		}
	}
	if len(balances) == 1 && len(income) == 1 && len(records) == 2 {
		compatible = append(compatible, TemplateShorthandIncome)
	}
	return compatible
}

func isTemplateBalance(record resolvedTemplateRecord) bool {
	return record.account.AccountType == accounts.AccountTypeOwned || record.account.AccountType == accounts.AccountTypeParty
}

func fitsTemplateSpend(class transactions.TransactionClass, records []resolvedTemplateRecord) bool {
	if class != transactions.TransactionClassSpend {
		return false
	}
	balances := filterTemplateRecords(records, isTemplateBalance)
	expenses := filterTemplateRecords(records, func(record resolvedTemplateRecord) bool {
		return record.role == transactions.RecordRoleExpense
	})
	if len(balances) != 1 || balances[0].input.Amount.Sign() >= 0 || len(expenses) == 0 || len(records) != len(balances)+len(expenses) {
		return false
	}
	total, ok := sumPositiveTemplateAmounts(expenses)
	return ok && balances[0].input.Amount.Abs().Cmp(total) == 0
}

func fitsTemplateChargedTransfer(class transactions.TransactionClass, records []resolvedTemplateRecord) bool {
	if class != transactions.TransactionClassSpend || len(records) != 3 {
		return false
	}
	balances := filterTemplateRecords(records, isTemplateBalance)
	expenses := filterTemplateRecords(records, func(record resolvedTemplateRecord) bool {
		return record.role == transactions.RecordRoleExpense
	})
	if len(balances) != 2 || len(expenses) != 1 {
		return false
	}
	source, destination := signedTemplatePair(balances)
	if source == nil || destination == nil || *source.input.AccountID == *destination.input.AccountID {
		return false
	}
	destinationPlusCharge, err := destination.input.Amount.Add(*expenses[0].input.Amount)
	return err == nil && source.input.Amount.Abs().Cmp(destinationPlusCharge) == 0
}

func fitsTemplatePartialChargedTransfer(records []resolvedTemplateRecord) bool {
	if len(records) != 3 {
		return false
	}
	balances := filterTemplateRecords(records, isTemplateBalance)
	expenses := filterTemplateRecords(records, func(record resolvedTemplateRecord) bool {
		return record.account.AccountType == accounts.AccountTypeFlow && record.intent == categories.CategoryEconomicIntentExpense
	})
	if len(balances) != 2 || len(expenses) != 1 || expenses[0].input.Amount != nil ||
		balances[0].input.Amount == nil || balances[1].input.Amount == nil {
		return false
	}
	source, destination := signedTemplatePair(balances)
	return source != nil && destination != nil && *source.input.AccountID != *destination.input.AccountID
}

func fitTemplateTwoRecord(class transactions.TransactionClass, records []resolvedTemplateRecord) TemplateShorthandType {
	if len(records) != 2 {
		return ""
	}
	negative, positive := signedTemplatePair(records)
	if negative == nil || positive == nil || negative.input.Amount.Abs().Cmp(*positive.input.Amount) != 0 {
		return ""
	}
	switch {
	case class == transactions.TransactionClassIncome && negative.role == transactions.RecordRoleIncome && isTemplateBalance(*positive):
		return TemplateShorthandIncome
	case class == transactions.TransactionClassRefund && negative.role == transactions.RecordRoleRefund && isTemplateBalance(*positive):
		return TemplateShorthandRefund
	case class == transactions.TransactionClassTransfer && isTemplateBalance(*negative) && isTemplateBalance(*positive) && *negative.input.AccountID != *positive.input.AccountID:
		return TemplateShorthandTransfer
	default:
		return ""
	}
}

func filterTemplateRecords(records []resolvedTemplateRecord, include func(resolvedTemplateRecord) bool) []resolvedTemplateRecord {
	filtered := make([]resolvedTemplateRecord, 0, len(records))
	for _, record := range records {
		if include(record) {
			filtered = append(filtered, record)
		}
	}
	return filtered
}

func signedTemplatePair(records []resolvedTemplateRecord) (*resolvedTemplateRecord, *resolvedTemplateRecord) {
	var negative, positive *resolvedTemplateRecord
	for index := range records {
		switch records[index].input.Amount.Sign() {
		case -1:
			if negative != nil {
				return nil, nil
			}
			negative = &records[index]
		case 1:
			if positive != nil {
				return nil, nil
			}
			positive = &records[index]
		default:
			return nil, nil
		}
	}
	return negative, positive
}

func singleTemplateCurrency(records []resolvedTemplateRecord) (string, bool) {
	var currency string
	for _, record := range records {
		recordCurrency := record.input.Currency
		if recordCurrency == nil {
			recordCurrency = record.account.Currency
		}
		if recordCurrency == nil {
			continue
		}
		if currency != "" && *recordCurrency != currency {
			return "", false
		}
		currency = *recordCurrency
	}
	return currency, true
}

func sumPositiveTemplateAmounts(records []resolvedTemplateRecord) (values.Decimal, bool) {
	total := *records[0].input.Amount
	for _, record := range records[1:] {
		var err error
		total, err = total.Add(*record.input.Amount)
		if err != nil {
			return values.Decimal{}, false
		}
	}
	return total, true
}
