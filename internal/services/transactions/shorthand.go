package transactions

import (
	"context"
	"errors"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
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
	Settlement           *SettlementIntent
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
}

// ExchangeInput creates a two-currency exchange through the fixed system account.
type ExchangeInput struct {
	InitiatedDate        values.CivilDate
	SoldAccountID        int64
	BoughtAccountID      int64
	SoldCurrency         *string
	BoughtCurrency       *string
	SoldAmount           values.Decimal
	BoughtAmount         values.Decimal
	MemberID             *int64
	TagIDs               []int64
	Memo                 *string
	Settlement           *SettlementIntent
	ReconciliationStatus *ReconciliationStatus
}

type shorthandRecordSpec struct {
	accountID int64
	amount    values.Decimal
	settles   bool
}

// CreateSpend builds and creates a two-record spend transaction.
func (s *Service) CreateSpend(ctx context.Context, input SpendInput) (Transaction, error) {
	if err := validateShorthandAmount(input.Amount); err != nil {
		return Transaction{}, err
	}
	if err := s.requireShorthandBalanceAccounts(ctx, input.FundingAccountID); err != nil {
		return Transaction{}, err
	}
	intent := categories.CategoryEconomicIntentExpense
	createInput, err := s.shorthandCreateInput(ctx, input.ShorthandCreateFields, &input.ExpenseCategoryID, &intent, []shorthandRecordSpec{
		{accountID: input.FundingAccountID, amount: input.Amount.Neg(), settles: true},
		{accountID: input.CounterpartyAccountID, amount: input.Amount},
	})
	if err != nil {
		return Transaction{}, err
	}
	createInput.Records[1].CategoryID = &input.ExpenseCategoryID

	return s.Create(ctx, createInput)
}

// CreateIncome builds and creates a two-record income transaction.
func (s *Service) CreateIncome(ctx context.Context, input IncomeInput) (Transaction, error) {
	if err := validateShorthandAmount(input.Amount); err != nil {
		return Transaction{}, err
	}
	if err := s.requireShorthandBalanceAccounts(ctx, input.DestinationAccountID); err != nil {
		return Transaction{}, err
	}
	intent := categories.CategoryEconomicIntentIncome
	createInput, err := s.shorthandCreateInput(ctx, input.ShorthandCreateFields, &input.IncomeCategoryID, &intent, []shorthandRecordSpec{
		{accountID: input.DestinationAccountID, amount: input.Amount, settles: true},
		{accountID: input.SourceAccountID, amount: input.Amount.Neg()},
	})
	if err != nil {
		return Transaction{}, err
	}
	createInput.Records[1].CategoryID = &input.IncomeCategoryID

	return s.Create(ctx, createInput)
}

// CreateRefund builds and creates a two-record refund transaction.
func (s *Service) CreateRefund(ctx context.Context, input RefundInput) (Transaction, error) {
	if err := validateShorthandAmount(input.Amount); err != nil {
		return Transaction{}, err
	}
	if err := s.requireShorthandBalanceAccounts(ctx, input.DestinationAccountID); err != nil {
		return Transaction{}, err
	}
	intent := categories.CategoryEconomicIntentExpense
	createInput, err := s.shorthandCreateInput(ctx, input.ShorthandCreateFields, &input.RefundCategoryID, &intent, []shorthandRecordSpec{
		{accountID: input.DestinationAccountID, amount: input.Amount, settles: true},
		{accountID: input.CounterpartyAccountID, amount: input.Amount.Neg()},
	})
	if err != nil {
		return Transaction{}, err
	}
	createInput.Records[1].CategoryID = &input.RefundCategoryID

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
	if err := s.requireShorthandBalanceAccounts(ctx, input.SourceAccountID, input.DestinationAccountID); err != nil {
		return Transaction{}, err
	}
	createInput, err := s.shorthandCreateInput(ctx, input.ShorthandCreateFields, nil, nil, []shorthandRecordSpec{
		{accountID: input.SourceAccountID, amount: input.Amount.Neg(), settles: true},
		{accountID: input.DestinationAccountID, amount: input.Amount, settles: true},
	})
	if err != nil {
		return Transaction{}, err
	}

	return s.Create(ctx, createInput)
}

// CreateExchange builds and creates the four records of a currency exchange.
func (s *Service) CreateExchange(ctx context.Context, input ExchangeInput) (Transaction, error) {
	if err := validateShorthandAmount(input.SoldAmount); err != nil {
		return Transaction{}, services.InvalidRequest("sold_amount must be greater than zero")
	}
	if err := validateShorthandAmount(input.BoughtAmount); err != nil {
		return Transaction{}, services.InvalidRequest("bought_amount must be greater than zero")
	}
	if input.SoldAccountID <= 0 || input.BoughtAccountID <= 0 || input.SoldAccountID == input.BoughtAccountID {
		return Transaction{}, services.InvalidRequest("sold_account_id and bought_account_id must be positive and differ")
	}

	accountRefs, err := s.accounts.ValidateActiveReferences(
		ctx,
		[]int64{input.SoldAccountID, input.BoughtAccountID},
		accounts.ReferenceOptions{AllowHidden: true},
	)
	if errors.Is(err, services.ErrInvalidReference) {
		return Transaction{}, invalidTransactionReferenceError()
	}
	if err != nil {
		return Transaction{}, err
	}
	sold := accountRefs[input.SoldAccountID]
	bought := accountRefs[input.BoughtAccountID]
	if !shorthandWritableAccountType(sold.AccountType) || !shorthandWritableAccountType(bought.AccountType) {
		return Transaction{}, services.InvalidRequest("exchange accounts must be owned or party accounts")
	}
	soldCurrency, err := resolveExchangeCurrency("sold", sold, input.SoldCurrency)
	if err != nil {
		return Transaction{}, err
	}
	boughtCurrency, err := resolveExchangeCurrency("bought", bought, input.BoughtCurrency)
	if err != nil {
		return Transaction{}, err
	}
	if soldCurrency == boughtCurrency {
		return Transaction{}, services.InvalidRequest("sold_currency and bought_currency must differ")
	}
	exchange, err := s.accounts.ActiveReferenceByFQN(ctx, "system:exchange")
	if errors.Is(err, services.ErrInvalidReference) {
		return Transaction{}, services.InvalidRequest("system:exchange account is unavailable")
	}
	if err != nil {
		return Transaction{}, err
	}

	reconciliationStatus := ReconciliationStatusReconciled
	if input.ReconciliationStatus != nil {
		reconciliationStatus = *input.ReconciliationStatus
	}
	settlementIntent := input.Settlement
	if settlementIntent == nil {
		settlementIntent = &SettlementIntent{Status: SettlementStatusPosted}
	}
	record := func(accountID int64, currency string, amount values.Decimal, settles bool) JournalRecordInput {
		var settlement *SettlementIntent
		if settles {
			settlement = settlementIntent
		}
		return JournalRecordInput{
			AccountID:            accountID,
			MemberID:             input.MemberID,
			Currency:             currency,
			Amount:               amount,
			TagIDs:               append([]int64{}, input.TagIDs...),
			Memo:                 input.Memo,
			Settlement:           settlement,
			ReconciliationStatus: reconciliationStatus,
			Source:               SourceManual,
		}
	}
	return s.Create(ctx, CreateInput{
		InitiatedDate: input.InitiatedDate,
		Records: []JournalRecordInput{
			record(sold.ID, soldCurrency, input.SoldAmount.Neg(), true),
			record(exchange.ID, soldCurrency, input.SoldAmount, false),
			record(exchange.ID, boughtCurrency, input.BoughtAmount.Neg(), false),
			record(bought.ID, boughtCurrency, input.BoughtAmount, true),
		},
	})
}

func resolveExchangeCurrency(side string, account accounts.Reference, explicit *string) (string, error) {
	if explicit != nil {
		return *explicit, nil
	}
	if account.Currency == nil {
		return "", services.InvalidRequest(side + "_currency is required for a multi-currency account")
	}

	return *account.Currency, nil
}

func shorthandWritableAccountType(accountType accounts.AccountType) bool {
	return accountType == accounts.AccountTypeOwned || accountType == accounts.AccountTypeParty
}

func (s *Service) requireShorthandBalanceAccounts(ctx context.Context, accountIDs ...int64) error {
	accountRefs, err := s.accounts.ValidateActiveReferences(
		ctx,
		accountIDs,
		accounts.ReferenceOptions{AllowHidden: true},
	)
	if errors.Is(err, services.ErrInvalidReference) {
		return invalidTransactionReferenceError()
	}
	if err != nil {
		return err
	}
	for _, accountID := range accountIDs {
		if !shorthandWritableAccountType(accountRefs[accountID].AccountType) {
			return services.InvalidRequest("balance accounts must be owned or party accounts")
		}
	}
	return nil
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
	categoryID *int64,
	expectedIntent *categories.CategoryEconomicIntent,
	specs []shorthandRecordSpec,
) (CreateInput, error) {
	if categoryID != nil && expectedIntent != nil {
		if err := s.requireShorthandCategoryIntent(ctx, *categoryID, *expectedIntent); err != nil {
			return CreateInput{}, err
		}
	}

	reconciliationStatus := ReconciliationStatusReconciled
	if fields.ReconciliationStatus != nil {
		reconciliationStatus = *fields.ReconciliationStatus
	}
	settlementIntent := fields.Settlement
	if settlementIntent == nil {
		settlementIntent = &SettlementIntent{Status: SettlementStatusPosted}
	}

	records := make([]JournalRecordInput, 0, len(specs))
	for _, spec := range specs {
		var settlement *SettlementIntent
		if spec.settles {
			settlement = settlementIntent
		}
		records = append(records, JournalRecordInput{
			AccountID:            spec.accountID,
			MemberID:             fields.MemberID,
			Currency:             fields.Currency,
			Amount:               spec.amount,
			TagIDs:               append([]int64{}, fields.TagIDs...),
			Memo:                 fields.Memo,
			Settlement:           settlement,
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

	category, err := s.categories.ValidateActiveReference(ctx, categoryID, categories.ReferenceOptions{AllowHidden: true})
	if err != nil {
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidTransactionReferenceError()
		}
		return err
	}
	if category.EconomicIntent != expected {
		return services.InvalidRequest("category_id economic_intent must be " + string(expected))
	}

	return nil
}
