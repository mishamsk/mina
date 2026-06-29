package transactions

import (
	"context"
	"errors"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/values"
)

// ShorthandCreateFields contains fields shared by two-record shorthand transaction creates.
type ShorthandCreateFields struct {
	InitiatedDate        values.CivilDate
	Currency             string
	Amount               values.Decimal
	MemberID             *int64
	TagIDs               []int64
	Memo                 *string
	PendingDate          *time.Time
	PostedDate           *time.Time
	PostingStatus        *PostingStatus
	ReconciliationStatus *ReconciliationStatus
}

// SpendInput creates an expense from a funding balance account to a counterparty flow account.
type SpendInput struct {
	ShorthandCreateFields
	FundingAccountID      int64
	CounterpartyAccountID int64
	ExpenseCategoryID     int64
}

// IncomeInput creates income from a source flow account to a destination balance account.
type IncomeInput struct {
	ShorthandCreateFields
	DestinationAccountID int64
	SourceAccountID      int64
	IncomeCategoryID     int64
}

// RefundInput creates a refund from a counterparty flow account to a destination balance account.
type RefundInput struct {
	ShorthandCreateFields
	DestinationAccountID  int64
	CounterpartyAccountID int64
	RefundCategoryID      int64
}

// TransferInput creates a transfer from one balance account to another balance account.
type TransferInput struct {
	ShorthandCreateFields
	SourceAccountID      int64
	DestinationAccountID int64
	TransferCategoryID   int64
}

type shorthandRecordSpec struct {
	accountID int64
	amount    values.Decimal
}

// CreateSpend builds and creates a two-record spend transaction.
func (s *Service) CreateSpend(ctx context.Context, input SpendInput) (Transaction, error) {
	if err := validateShorthandAmount(input.Amount); err != nil {
		return Transaction{}, err
	}
	createInput, err := s.shorthandCreateInput(ctx, input.ShorthandCreateFields, input.ExpenseCategoryID, categories.CategoryEconomicIntentExpense, []shorthandRecordSpec{
		{accountID: input.FundingAccountID, amount: input.Amount.Neg()},
		{accountID: input.CounterpartyAccountID, amount: input.Amount},
	})
	if err != nil {
		return Transaction{}, err
	}

	return s.Create(ctx, createInput)
}

// CreateIncome builds and creates a two-record income transaction.
func (s *Service) CreateIncome(ctx context.Context, input IncomeInput) (Transaction, error) {
	if err := validateShorthandAmount(input.Amount); err != nil {
		return Transaction{}, err
	}
	createInput, err := s.shorthandCreateInput(ctx, input.ShorthandCreateFields, input.IncomeCategoryID, categories.CategoryEconomicIntentIncome, []shorthandRecordSpec{
		{accountID: input.DestinationAccountID, amount: input.Amount},
		{accountID: input.SourceAccountID, amount: input.Amount.Neg()},
	})
	if err != nil {
		return Transaction{}, err
	}

	return s.Create(ctx, createInput)
}

// CreateRefund builds and creates a two-record refund transaction.
func (s *Service) CreateRefund(ctx context.Context, input RefundInput) (Transaction, error) {
	if err := validateShorthandAmount(input.Amount); err != nil {
		return Transaction{}, err
	}
	createInput, err := s.shorthandCreateInput(ctx, input.ShorthandCreateFields, input.RefundCategoryID, categories.CategoryEconomicIntentRefund, []shorthandRecordSpec{
		{accountID: input.DestinationAccountID, amount: input.Amount},
		{accountID: input.CounterpartyAccountID, amount: input.Amount.Neg()},
	})
	if err != nil {
		return Transaction{}, err
	}

	return s.Create(ctx, createInput)
}

// CreateTransfer builds and creates a two-record balance-account transfer transaction.
func (s *Service) CreateTransfer(ctx context.Context, input TransferInput) (Transaction, error) {
	if err := validateShorthandAmount(input.Amount); err != nil {
		return Transaction{}, err
	}
	if input.SourceAccountID > 0 && input.SourceAccountID == input.DestinationAccountID {
		return Transaction{}, services.InvalidRequest("source_account_id and destination_account_id must differ")
	}
	createInput, err := s.shorthandCreateInput(ctx, input.ShorthandCreateFields, input.TransferCategoryID, categories.CategoryEconomicIntentTransfer, []shorthandRecordSpec{
		{accountID: input.SourceAccountID, amount: input.Amount.Neg()},
		{accountID: input.DestinationAccountID, amount: input.Amount},
	})
	if err != nil {
		return Transaction{}, err
	}

	return s.Create(ctx, createInput)
}

func validateShorthandAmount(amount values.Decimal) error {
	if amount.Sign() <= 0 {
		return services.InvalidRequest("amount must be greater than zero")
	}

	return nil
}

func (s *Service) shorthandCreateInput(
	ctx context.Context,
	fields ShorthandCreateFields,
	categoryID int64,
	expectedIntent categories.CategoryEconomicIntent,
	specs []shorthandRecordSpec,
) (CreateInput, error) {
	if s.amountUSDDeriver == nil {
		return CreateInput{}, errors.New("transactions: amount USD deriver is not configured")
	}
	if err := s.requireShorthandCategoryIntent(ctx, categoryID, expectedIntent); err != nil {
		return CreateInput{}, err
	}

	postingStatus := PostingStatusPosted
	if fields.PostingStatus != nil {
		postingStatus = *fields.PostingStatus
	}
	reconciliationStatus := ReconciliationStatusReconciled
	if fields.ReconciliationStatus != nil {
		reconciliationStatus = *fields.ReconciliationStatus
	}

	records := make([]JournalRecordInput, 0, len(specs))
	for _, spec := range specs {
		amountUSD, err := s.amountUSDDeriver.SignedAmountUSD(ctx, fields.Currency, spec.amount, fields.InitiatedDate)
		if err != nil {
			return CreateInput{}, err
		}
		records = append(records, JournalRecordInput{
			AccountID:            spec.accountID,
			MemberID:             fields.MemberID,
			Currency:             fields.Currency,
			Amount:               spec.amount,
			AmountUSD:            amountUSD,
			CategoryID:           categoryID,
			TagIDs:               append([]int64{}, fields.TagIDs...),
			Memo:                 fields.Memo,
			PendingDate:          fields.PendingDate,
			PostedDate:           fields.PostedDate,
			PostingStatus:        postingStatus,
			ReconciliationStatus: reconciliationStatus,
			Source:               SourceManual,
		})
	}

	return CreateInput{
		InitiatedDate: fields.InitiatedDate,
		Records:       records,
	}, nil
}

func (s *Service) requireShorthandCategoryIntent(ctx context.Context, categoryID int64, expected categories.CategoryEconomicIntent) error {
	if categoryID <= 0 {
		return services.InvalidRequest("category_id must be positive")
	}

	categoryList, err := s.categories.List(ctx, categories.ListOptions{IncludeHidden: true})
	if err != nil {
		return err
	}
	for _, category := range categoryList {
		if category.ID != categoryID {
			continue
		}
		if category.EconomicIntent != expected {
			return services.InvalidRequest("category_id economic_intent must be " + string(expected))
		}

		return nil
	}

	return invalidTransactionReferenceError()
}
