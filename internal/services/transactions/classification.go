package transactions

import (
	"slices"
	"strings"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
)

type transactionClassification struct {
	class          TransactionClass
	primaryAmounts []DisplayAmount
	components     []ClassificationComponent
}

// ValidateTransactionClassification validates the persisted semantic shape of
// a transaction without deriving display fields.
func ValidateTransactionClassification(transaction Transaction) error {
	_, err := classifyTransaction(transaction)
	return err
}

// LineDisplayAmountsForSemanticRecords derives the transaction class and
// line-level display amounts from semantic records without requiring a
// persisted transaction.
func LineDisplayAmountsForSemanticRecords(records []SemanticRecord) (TransactionClass, []DisplayAmount, error) {
	classified, err := classifySemanticRecords(records)
	if err != nil {
		return "", nil, err
	}

	return classified.class, lineDisplayAmounts(classified), nil
}

// SemanticShapeError carries the economic intent whose semantic record shape is invalid.
type SemanticShapeError struct {
	Intent categories.CategoryEconomicIntent
	err    *services.Error
}

func (e SemanticShapeError) Error() string {
	return e.err.Error()
}

func (e SemanticShapeError) Unwrap() error {
	return e.err
}

// classifyTransaction derives the user-facing classification from a fully
// joined transaction. The store supplies each record's account type and
// category economic intent; this function keeps only the fields needed for
// business classification so persistence details do not leak into the rules.
func classifyTransaction(transaction Transaction) (Transaction, error) {
	records := make([]SemanticRecord, 0, len(transaction.Records))
	for _, record := range transaction.Records {
		records = append(records, SemanticRecord{
			Currency:       record.Currency,
			Amount:         record.Amount,
			AccountType:    record.AccountType,
			EconomicIntent: record.EconomicIntent,
		})
	}
	classified, err := classifySemanticRecords(records)
	if err != nil {
		return Transaction{}, err
	}

	return withClassification(transaction, classified), nil
}

// withClassification copies derived values onto a transaction. Slice values
// are cloned so callers can reuse cached classifications without sharing
// mutable backing arrays with the returned transaction.
func withClassification(transaction Transaction, classified transactionClassification) Transaction {
	transaction.Class = classified.class
	transaction.DisplayTitle = transactionDisplayTitle(transaction, classified.class)
	transaction.PrimaryAmounts = cloneDisplayAmounts(classified.primaryAmounts)
	transaction.Components = cloneClassificationComponents(classified.components)

	return transaction
}

// classifySemanticRecords groups records by category intent, validates each
// intent's required account-type/sign shape, derives component summaries, and
// then derives the single transaction class from the component set. This maps
// the accounting-semantics document directly: intent shape rules first,
// component amounts second, transaction class and primary display amount last.
func classifySemanticRecords(records []SemanticRecord) (transactionClassification, error) {
	if len(records) == 0 {
		return transactionClassification{}, services.InvalidRequest("transaction requires semantic records")
	}

	byIntent := map[categories.CategoryEconomicIntent][]SemanticRecord{}
	for _, record := range records {
		byIntent[record.EconomicIntent] = append(byIntent[record.EconomicIntent], record)
	}

	components := make([]ClassificationComponent, 0, len(byIntent))
	presence := map[categories.CategoryEconomicIntent]bool{}
	for _, intent := range orderedIntents() {
		intentRecords := byIntent[intent]
		if len(intentRecords) == 0 {
			continue
		}
		component, err := classifyComponent(intent, intentRecords)
		if err != nil {
			return transactionClassification{}, err
		}
		components = append(components, component)
		presence[intent] = true
	}

	class := classifyComponentSet(presence)
	if class == TransactionClassTransfer && !transferRecordsHavePositiveAndNegative(byIntent[categories.CategoryEconomicIntentTransfer]) {
		return transactionClassification{}, services.InvalidRequest("transfer transactions require positive and negative balance transfer records")
	}

	primaryAmounts, err := primaryAmounts(class, components)
	if err != nil {
		return transactionClassification{}, err
	}
	return transactionClassification{
		class:          class,
		primaryAmounts: primaryAmounts,
		components:     components,
	}, nil
}

// classifyComponent validates and summarizes one economic-intent component.
// Components are the stable intermediate representation used by list/detail
// responses and by the final transaction class derivation.
func classifyComponent(intent categories.CategoryEconomicIntent, records []SemanticRecord) (ClassificationComponent, error) {
	if err := validateIntentShape(intent, records); err != nil {
		return ClassificationComponent{}, err
	}

	amounts, err := componentAmounts(intent, records)
	if err != nil {
		return ClassificationComponent{}, err
	}

	return ClassificationComponent{
		Intent:  intent,
		Amounts: amounts,
	}, nil
}

// validateIntentShape enforces the legal account-type/sign combinations for
// one category economic intent. It answers "can these records mean this
// economic thing?" before any display values are calculated.
func validateIntentShape(intent categories.CategoryEconomicIntent, records []SemanticRecord) error {
	switch intent {
	case categories.CategoryEconomicIntentExpense:
		hasPositiveFlow := false
		for _, record := range records {
			switch {
			case record.AccountType == accounts.AccountTypeFlow && record.Amount.Sign() > 0:
				hasPositiveFlow = true
			case record.AccountType == accounts.AccountTypeBalance && record.Amount.Sign() < 0:
			default:
				return semanticShapeError(intent)
			}
		}
		if !hasPositiveFlow {
			return semanticShapeError(intent)
		}
	case categories.CategoryEconomicIntentFee:
		hasFunding := false
		hasCharge := false
		for _, record := range records {
			switch {
			case record.AccountType == accounts.AccountTypeBalance && record.Amount.Sign() < 0:
				hasFunding = true
			case (record.AccountType == accounts.AccountTypeFlow || record.AccountType == accounts.AccountTypeSystem) && record.Amount.Sign() > 0:
				hasCharge = true
			default:
				return semanticShapeError(intent)
			}
		}
		if !hasFunding || !hasCharge {
			return semanticShapeError(intent)
		}
	case categories.CategoryEconomicIntentIncome, categories.CategoryEconomicIntentRefund:
		hasDestination := false
		hasSource := false
		for _, record := range records {
			switch {
			case record.AccountType == accounts.AccountTypeBalance && record.Amount.Sign() > 0:
				hasDestination = true
			case record.AccountType == accounts.AccountTypeFlow && record.Amount.Sign() < 0:
				hasSource = true
			default:
				return semanticShapeError(intent)
			}
		}
		if !hasDestination || !hasSource {
			return semanticShapeError(intent)
		}
	case categories.CategoryEconomicIntentTransfer:
		for _, record := range records {
			if record.AccountType != accounts.AccountTypeBalance {
				return semanticShapeError(intent)
			}
		}
	case categories.CategoryEconomicIntentExchange:
		balanceCurrencies := map[string]struct{}{}
		hasBalance := false
		hasFlow := false
		hasPositiveBalance := false
		hasNegativeBalance := false
		for _, record := range records {
			switch record.AccountType {
			case accounts.AccountTypeBalance:
				balanceCurrencies[record.Currency] = struct{}{}
				hasBalance = true
				if record.Amount.Sign() > 0 {
					hasPositiveBalance = true
				}
				if record.Amount.Sign() < 0 {
					hasNegativeBalance = true
				}
			case accounts.AccountTypeFlow:
				hasFlow = true
			default:
				return semanticShapeError(intent)
			}
		}
		if len(balanceCurrencies) < 2 || !hasBalance || !hasFlow || !hasPositiveBalance || !hasNegativeBalance {
			return semanticShapeError(intent)
		}
	case categories.CategoryEconomicIntentAdjustment, categories.CategoryEconomicIntentFXGainLoss:
		hasSystem := false
		hasNonSystem := false
		hasPositive := false
		hasNegative := false
		for _, record := range records {
			if record.AccountType == accounts.AccountTypeSystem {
				hasSystem = true
			} else {
				hasNonSystem = true
			}
			if record.Amount.Sign() > 0 {
				hasPositive = true
			}
			if record.Amount.Sign() < 0 {
				hasNegative = true
			}
		}
		if !hasSystem || !hasNonSystem || !hasPositive || !hasNegative {
			return semanticShapeError(intent)
		}
	default:
		return semanticShapeError(intent)
	}

	return nil
}

// semanticShapeError returns a service validation error tied to the violating
// category intent so API callers can fix the record/category/account shape.
func semanticShapeError(intent categories.CategoryEconomicIntent) error {
	return SemanticShapeError{
		Intent: intent,
		err:    services.InvalidRequest("transaction records violate " + string(intent) + " semantic shape"),
	}
}

// classifyComponentSet derives the one user-facing transaction class from the
// set of present economic-intent components. Support components such as fees,
// transfers, exchange legs, and FX gain/loss are allowed only with the primary
// classes defined in the semantics rules; unsupported combinations are mixed.
func classifyComponentSet(presence map[categories.CategoryEconomicIntent]bool) TransactionClass {
	expense := presence[categories.CategoryEconomicIntentExpense]
	fee := presence[categories.CategoryEconomicIntentFee]
	income := presence[categories.CategoryEconomicIntentIncome]
	refund := presence[categories.CategoryEconomicIntentRefund]
	transfer := presence[categories.CategoryEconomicIntentTransfer]
	exchange := presence[categories.CategoryEconomicIntentExchange]
	adjustment := presence[categories.CategoryEconomicIntentAdjustment]
	fx := presence[categories.CategoryEconomicIntentFXGainLoss]

	switch {
	case income && !expense && !fee && !refund && !adjustment && !fx:
		return TransactionClassIncome
	case refund && !expense && !fee && !income && !adjustment && !fx:
		return TransactionClassRefund
	case transfer && !expense && !income && !refund && !adjustment && !exchange && !fx:
		return TransactionClassTransfer
	case exchange && !expense && !income && !refund && !transfer && !adjustment:
		return TransactionClassCurrencyExchange
	case expense && !income && !refund && !adjustment && !fx:
		return TransactionClassSpend
	case fee && !expense && !income && !refund && !transfer && !exchange && !adjustment && !fx:
		return TransactionClassSpend
	case adjustment && !expense && !fee && !income && !refund && !transfer && !exchange:
		return TransactionClassAdjustment
	case fx && !expense && !fee && !income && !refund && !transfer && !exchange && !adjustment:
		return TransactionClassFXGainLoss
	default:
		return TransactionClassMixed
	}
}

// componentAmounts calculates the display amount for one component using the
// records that carry the economic meaning for that intent: flow records for
// spend/income/refund, positive balance records for transfers, balance records
// for exchanges, and non-system records for adjustments and FX gain/loss.
func componentAmounts(intent categories.CategoryEconomicIntent, records []SemanticRecord) ([]DisplayAmount, error) {
	switch intent {
	case categories.CategoryEconomicIntentExpense:
		amounts, err := sumRecords(records, func(record SemanticRecord) bool {
			return record.AccountType == accounts.AccountTypeFlow
		})
		if err != nil {
			return nil, err
		}
		return negateAmounts(amounts), nil
	case categories.CategoryEconomicIntentFee:
		amounts, err := sumRecords(records, func(record SemanticRecord) bool {
			return record.AccountType == accounts.AccountTypeFlow || record.AccountType == accounts.AccountTypeSystem
		})
		if err != nil {
			return nil, err
		}
		return negateAmounts(amounts), nil
	case categories.CategoryEconomicIntentIncome, categories.CategoryEconomicIntentRefund:
		amounts, err := sumRecords(records, func(record SemanticRecord) bool {
			return record.AccountType == accounts.AccountTypeFlow
		})
		if err != nil {
			return nil, err
		}
		return absAmounts(amounts), nil
	case categories.CategoryEconomicIntentTransfer:
		return sumRecords(records, func(record SemanticRecord) bool {
			return record.AccountType == accounts.AccountTypeBalance && record.Amount.Sign() > 0
		})
	case categories.CategoryEconomicIntentExchange:
		return sumRecords(records, func(record SemanticRecord) bool {
			return record.AccountType == accounts.AccountTypeBalance
		})
	case categories.CategoryEconomicIntentAdjustment, categories.CategoryEconomicIntentFXGainLoss:
		return sumRecords(records, func(record SemanticRecord) bool {
			return record.AccountType != accounts.AccountTypeSystem
		})
	default:
		return nil, nil
	}
}

// primaryAmounts calculates the transaction's single human-facing amount from
// its primary component class. Spend uses expense plus fee components; income,
// refund, adjustment, and FX gain/loss use their own components. Neutral or
// ambiguous classes expose component amounts instead of inventing a total.
func primaryAmounts(class TransactionClass, components []ClassificationComponent) ([]DisplayAmount, error) {
	switch class {
	case TransactionClassSpend:
		return sumComponents(components, categories.CategoryEconomicIntentExpense, categories.CategoryEconomicIntentFee)
	case TransactionClassIncome:
		return sumComponents(components, categories.CategoryEconomicIntentIncome)
	case TransactionClassRefund:
		return sumComponents(components, categories.CategoryEconomicIntentRefund)
	case TransactionClassAdjustment:
		return sumComponents(components, categories.CategoryEconomicIntentAdjustment)
	case TransactionClassFXGainLoss:
		return sumComponents(components, categories.CategoryEconomicIntentFXGainLoss)
	default:
		return []DisplayAmount{}, nil
	}
}

func lineDisplayAmounts(classified transactionClassification) []DisplayAmount {
	switch classified.class {
	case TransactionClassTransfer, TransactionClassMixed:
		return componentDisplayAmounts(classified.components)
	case TransactionClassCurrencyExchange:
		for _, component := range classified.components {
			if component.Intent != categories.CategoryEconomicIntentExchange {
				continue
			}
			for _, amount := range component.Amounts {
				if amount.Amount.Sign() < 0 {
					return []DisplayAmount{amount}
				}
			}
			if len(component.Amounts) > 0 {
				return []DisplayAmount{component.Amounts[0]}
			}
		}
	}
	if len(classified.primaryAmounts) > 0 {
		return cloneDisplayAmounts(classified.primaryAmounts)
	}

	return componentDisplayAmounts(classified.components)
}

func componentDisplayAmounts(components []ClassificationComponent) []DisplayAmount {
	amounts := []DisplayAmount{}
	for _, component := range components {
		amounts = append(amounts, component.Amounts...)
	}

	return cloneDisplayAmounts(amounts)
}

func transactionDisplayTitle(transaction Transaction, class TransactionClass) string {
	switch class {
	case TransactionClassSpend:
		if title := spendDisplayTitle(transaction.Records); title != "" {
			return title
		}
	case TransactionClassIncome:
		if title := directionalAccountTitle(
			transaction.Records,
			func(record JournalRecord) bool {
				return record.EconomicIntent == categories.CategoryEconomicIntentIncome &&
					record.AccountType == accounts.AccountTypeFlow &&
					record.Amount.Sign() < 0
			},
			func(record JournalRecord) bool {
				return record.EconomicIntent == categories.CategoryEconomicIntentIncome &&
					record.AccountType == accounts.AccountTypeBalance &&
					record.Amount.Sign() > 0
			},
		); title != "" {
			return title
		}
	case TransactionClassRefund:
		if title := directionalAccountTitle(
			transaction.Records,
			func(record JournalRecord) bool {
				return record.EconomicIntent == categories.CategoryEconomicIntentRefund &&
					record.AccountType == accounts.AccountTypeFlow &&
					record.Amount.Sign() < 0
			},
			func(record JournalRecord) bool {
				return record.EconomicIntent == categories.CategoryEconomicIntentRefund &&
					record.AccountType == accounts.AccountTypeBalance &&
					record.Amount.Sign() > 0
			},
		); title != "" {
			return title
		}
	case TransactionClassTransfer:
		if title := directionalAccountTitle(
			transaction.Records,
			func(record JournalRecord) bool {
				return record.EconomicIntent == categories.CategoryEconomicIntentTransfer &&
					record.AccountType == accounts.AccountTypeBalance &&
					record.Amount.Sign() < 0
			},
			func(record JournalRecord) bool {
				return record.EconomicIntent == categories.CategoryEconomicIntentTransfer &&
					record.AccountType == accounts.AccountTypeBalance &&
					record.Amount.Sign() > 0
			},
		); title != "" {
			return title
		}
	case TransactionClassCurrencyExchange:
		if title := directionalCurrencyTitle(transaction.Records); title != "" {
			return title
		}
	case TransactionClassAdjustment:
		if title := affectedAccountTitle(transaction.Records, categories.CategoryEconomicIntentAdjustment); title != "" {
			return title
		}
	case TransactionClassFXGainLoss:
		if title := affectedAccountTitle(transaction.Records, categories.CategoryEconomicIntentFXGainLoss); title != "" {
			return title
		}
	}

	if title := uniformMemoTitle(transaction.Records); title != "" {
		return title
	}
	if title := dominantCounterpartyTitle(transaction.Records); title != "" {
		return title
	}

	return "Transaction"
}

func spendDisplayTitle(records []JournalRecord) string {
	to := func(record JournalRecord) bool {
		return (record.EconomicIntent == categories.CategoryEconomicIntentExpense ||
			record.EconomicIntent == categories.CategoryEconomicIntentFee) &&
			(record.AccountType == accounts.AccountTypeFlow || record.AccountType == accounts.AccountTypeSystem) &&
			record.Amount.Sign() > 0
	}

	if title := directionalAccountTitle(
		records,
		func(record JournalRecord) bool {
			return record.EconomicIntent == categories.CategoryEconomicIntentExchange &&
				record.AccountType == accounts.AccountTypeBalance &&
				record.Amount.Sign() < 0
		},
		to,
	); title != "" {
		return title
	}

	return directionalAccountTitle(
		records,
		func(record JournalRecord) bool {
			if record.AccountType != accounts.AccountTypeBalance || record.Amount.Sign() >= 0 {
				return false
			}
			return record.EconomicIntent == categories.CategoryEconomicIntentExpense ||
				record.EconomicIntent == categories.CategoryEconomicIntentFee
		},
		to,
	)
}

func directionalAccountTitle(records []JournalRecord, from func(JournalRecord) bool, to func(JournalRecord) bool) string {
	fromName, ok := uniqueAccountName(records, from)
	if !ok {
		return ""
	}
	toName, ok := uniqueAccountName(records, to)
	if !ok {
		return ""
	}

	return fromName + " → " + toName
}

func uniqueAccountName(records []JournalRecord, include func(JournalRecord) bool) (string, bool) {
	name := ""
	var accountID int64
	for _, record := range records {
		if !include(record) || record.AccountName == "" {
			continue
		}
		if name == "" {
			name = record.AccountName
			accountID = record.AccountID
			continue
		}
		if record.AccountID != accountID {
			return "", false
		}
	}

	return name, name != ""
}

func directionalCurrencyTitle(records []JournalRecord) string {
	sold, soldOK := uniqueCurrency(records, func(record JournalRecord) bool {
		return record.EconomicIntent == categories.CategoryEconomicIntentExchange &&
			record.AccountType == accounts.AccountTypeBalance &&
			record.Amount.Sign() < 0
	})
	if !soldOK {
		return ""
	}
	bought, boughtOK := uniqueCurrency(records, func(record JournalRecord) bool {
		return record.EconomicIntent == categories.CategoryEconomicIntentExchange &&
			record.AccountType == accounts.AccountTypeBalance &&
			record.Amount.Sign() > 0
	})
	if !boughtOK {
		return ""
	}

	return sold + " → " + bought
}

func uniqueCurrency(records []JournalRecord, include func(JournalRecord) bool) (string, bool) {
	currency := ""
	for _, record := range records {
		if !include(record) {
			continue
		}
		if currency == "" {
			currency = record.Currency
			continue
		}
		if record.Currency != currency {
			return "", false
		}
	}

	return currency, currency != ""
}

func affectedAccountTitle(records []JournalRecord, intent categories.CategoryEconomicIntent) string {
	name, ok := uniqueAccountName(records, func(record JournalRecord) bool {
		return record.EconomicIntent == intent && record.AccountType != accounts.AccountTypeSystem
	})
	if !ok {
		return ""
	}

	return name
}

func uniformMemoTitle(records []JournalRecord) string {
	title := ""
	for _, record := range records {
		if record.Memo == nil || *record.Memo == "" {
			continue
		}
		if title == "" {
			title = *record.Memo
			continue
		}
		if *record.Memo != title {
			return ""
		}
	}

	return title
}

func dominantCounterpartyTitle(records []JournalRecord) string {
	if title := dominantRecordTitle(records, func(record JournalRecord) bool {
		return record.AccountType == accounts.AccountTypeFlow
	}); title != "" {
		return title
	}
	if title := dominantRecordTitle(records, func(record JournalRecord) bool {
		return record.AccountType != accounts.AccountTypeSystem
	}); title != "" {
		return title
	}

	return dominantRecordTitle(records, func(JournalRecord) bool {
		return true
	})
}

func dominantRecordTitle(records []JournalRecord, include func(JournalRecord) bool) string {
	title := ""
	var maxAmount DisplayAmount
	found := false
	for _, record := range records {
		if !include(record) || strings.TrimSpace(record.AccountName) == "" {
			continue
		}
		amount := record.Amount.Abs()
		if !found || amount.Cmp(maxAmount.Amount) > 0 {
			title = record.AccountName
			maxAmount = DisplayAmount{Amount: amount}
			found = true
		}
	}

	return title
}

// sumComponents adds already-derived component amounts for the requested
// intents. It keeps class logic independent from individual record selection.
func sumComponents(components []ClassificationComponent, intents ...categories.CategoryEconomicIntent) ([]DisplayAmount, error) {
	selected := map[categories.CategoryEconomicIntent]struct{}{}
	for _, intent := range intents {
		selected[intent] = struct{}{}
	}

	amounts := []DisplayAmount{}
	for _, component := range components {
		if _, ok := selected[component.Intent]; !ok {
			continue
		}
		for _, amount := range component.Amounts {
			next, err := addDisplayAmount(amounts, amount)
			if err != nil {
				return nil, err
			}
			amounts = next
		}
	}

	return amounts, nil
}

// sumRecords groups selected record amounts by currency. It is the shared
// primitive for component amount rules, preserving multi-currency transactions
// without collapsing values through an exchange rate.
func sumRecords(records []SemanticRecord, include func(SemanticRecord) bool) ([]DisplayAmount, error) {
	amounts := []DisplayAmount{}
	for _, record := range records {
		if !include(record) {
			continue
		}
		next, err := addDisplayAmount(amounts, DisplayAmount{
			Currency: record.Currency,
			Amount:   record.Amount,
		})
		if err != nil {
			return nil, err
		}
		amounts = next
	}

	return amounts, nil
}

// addDisplayAmount adds one amount into a currency bucket and keeps output
// currency ordering deterministic for stable API responses and tests.
func addDisplayAmount(amounts []DisplayAmount, next DisplayAmount) ([]DisplayAmount, error) {
	for index := range amounts {
		if amounts[index].Currency != next.Currency {
			continue
		}
		sum, err := amounts[index].Amount.Add(next.Amount)
		if err != nil {
			return nil, services.InvalidRequest("transaction display amount exceeds supported decimal range")
		}
		amounts[index].Amount = sum
		return amounts, nil
	}

	amounts = append(amounts, next)
	slices.SortFunc(amounts, func(a DisplayAmount, b DisplayAmount) int {
		if a.Currency < b.Currency {
			return -1
		}
		if a.Currency > b.Currency {
			return 1
		}
		return 0
	})

	return amounts, nil
}

// negateAmounts flips debit/credit sign when a component should be presented
// from the household perspective, such as expenses and fees as negative spend.
func negateAmounts(amounts []DisplayAmount) []DisplayAmount {
	cloned := cloneDisplayAmounts(amounts)
	for index := range cloned {
		cloned[index].Amount = cloned[index].Amount.Neg()
	}

	return cloned
}

// absAmounts removes sign when the business meaning is magnitude rather than
// direction, such as income/refund flow records that are negative credits.
func absAmounts(amounts []DisplayAmount) []DisplayAmount {
	cloned := cloneDisplayAmounts(amounts)
	for index := range cloned {
		cloned[index].Amount = cloned[index].Amount.Abs()
	}

	return cloned
}

// transferRecordsHavePositiveAndNegative ensures a transfer-only transaction
// is an actual movement between balance accounts instead of a one-sided or
// all-same-direction balance record set.
func transferRecordsHavePositiveAndNegative(records []SemanticRecord) bool {
	hasPositive := false
	hasNegative := false
	for _, record := range records {
		if record.AccountType != accounts.AccountTypeBalance {
			continue
		}
		if record.Amount.Sign() > 0 {
			hasPositive = true
		}
		if record.Amount.Sign() < 0 {
			hasNegative = true
		}
	}

	return hasPositive && hasNegative
}

// orderedIntents fixes component ordering in responses so API output does not
// depend on Go map iteration order.
func orderedIntents() []categories.CategoryEconomicIntent {
	return []categories.CategoryEconomicIntent{
		categories.CategoryEconomicIntentExpense,
		categories.CategoryEconomicIntentFee,
		categories.CategoryEconomicIntentIncome,
		categories.CategoryEconomicIntentRefund,
		categories.CategoryEconomicIntentTransfer,
		categories.CategoryEconomicIntentExchange,
		categories.CategoryEconomicIntentAdjustment,
		categories.CategoryEconomicIntentFXGainLoss,
	}
}

// cloneDisplayAmounts copies display amount slices before attaching them to a
// transaction response.
func cloneDisplayAmounts(amounts []DisplayAmount) []DisplayAmount {
	return append([]DisplayAmount{}, amounts...)
}

// cloneClassificationComponents deep-copies component amount slices before
// attaching them to a transaction response.
func cloneClassificationComponents(components []ClassificationComponent) []ClassificationComponent {
	cloned := make([]ClassificationComponent, 0, len(components))
	for _, component := range components {
		cloned = append(cloned, ClassificationComponent{
			Intent:  component.Intent,
			Amounts: cloneDisplayAmounts(component.Amounts),
		})
	}

	return cloned
}
