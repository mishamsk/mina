package transactions

import (
	"fmt"
	"slices"
	"strings"

	"golang.org/x/text/currency"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/values"
)

// ValidateTransactionClassification validates and derives a persisted transaction.
func ValidateTransactionClassification(transaction Transaction) error {
	_, err := ClassifyTransaction(transaction)
	return err
}

// ValidateTransactionSemantics validates account/category classification without settlement invariants.
func ValidateTransactionSemantics(transaction Transaction) error {
	records := make([]SemanticRecord, 0, len(transaction.Records))
	for _, record := range transaction.Records {
		records = append(records, SemanticRecord{
			Currency:       record.Currency,
			Amount:         record.Amount,
			AccountFQN:     record.AccountFQN,
			AccountType:    record.AccountType,
			CategoryID:     record.CategoryID,
			EconomicIntent: record.EconomicIntent,
		})
	}
	_, err := ClassifySemanticRecords(records)
	return err
}

// LineDisplayAmountsForSemanticRecords derives recurring-definition summary fields.
func LineDisplayAmountsForSemanticRecords(records []SemanticRecord) (TransactionClass, []DisplayAmount, error) {
	classified, err := ClassifySemanticRecords(records)
	if err != nil {
		return "", nil, err
	}
	if len(classified.PrimaryAmounts) > 0 {
		return classified.Class, classified.PrimaryAmounts, nil
	}

	amounts := []DisplayAmount{}
	for _, shape := range classified.Shapes {
		amounts = append(amounts, shape.Amounts...)
	}
	return classified.Class, amounts, nil
}

// ClassifyTransaction validates and derives transaction presentation fields.
func ClassifyTransaction(transaction Transaction) (Transaction, error) {
	classified, err := classifyTransactionRecords(transaction.Records)
	if err != nil {
		return Transaction{}, err
	}

	for index := range transaction.Records {
		transaction.Records[index].Role = classified.Roles[index]
		transaction.Records[index].LifecycleStatus = transaction.LifecycleStatus
	}
	settlement, err := deriveTransactionSettlement(transaction)
	if err != nil {
		return Transaction{}, err
	}
	transaction.Settlement = settlement
	transaction.Class = classified.Class
	transaction.DisplayTitle = transactionDisplayTitle(transaction)
	transaction.PrimaryAmounts = classified.PrimaryAmounts
	transaction.Shapes = classified.Shapes
	return transaction, nil
}

func deriveTransactionDisplayTitle(records []JournalRecord) (string, error) {
	records = slices.Clone(records)
	classified, err := classifyTransactionRecords(records)
	if err != nil {
		return "", err
	}
	for index := range records {
		records[index].Role = classified.Roles[index]
	}
	return transactionDisplayTitle(Transaction{
		Class:   classified.Class,
		Records: records,
	}), nil
}

func classifyTransactionRecords(records []JournalRecord) (Classification, error) {
	semanticRecords := make([]SemanticRecord, 0, len(records))
	for index := range records {
		record := &records[index]
		record.AccountDisplayLabel = services.EffectiveDisplayLabel(
			record.AccountFQN,
			record.AccountDisplayLabelOverride,
		)
		semanticRecords = append(semanticRecords, SemanticRecord{
			Currency:       record.Currency,
			Amount:         record.Amount,
			AmountUSD:      record.AmountUSD,
			AccountFQN:     record.AccountFQN,
			AccountType:    record.AccountType,
			CategoryID:     record.CategoryID,
			EconomicIntent: record.EconomicIntent,
		})
	}
	return ClassifySemanticRecords(semanticRecords)
}

func deriveTransactionSettlement(transaction Transaction) (SettlementSummary, error) {
	pending := 0
	posted := 0
	for index := range transaction.Records {
		record := &transaction.Records[index]
		settlement, err := deriveRecordSettlement(index, transaction.LifecycleStatus, *record)
		if err != nil {
			return "", err
		}
		record.Settlement = settlement
		if settlement == nil {
			continue
		}
		if *settlement == SettlementStatusPosted {
			posted++
		} else {
			pending++
		}
	}

	if transaction.LifecycleStatus == LifecycleStatusCancelled && posted > 0 {
		return "", services.InvalidRequest("cancelled transactions must be wholly pending")
	}
	switch {
	case pending > 0 && posted > 0:
		return SettlementSummaryMixed, nil
	case pending > 0:
		return SettlementSummaryPending, nil
	case posted > 0:
		return SettlementSummaryPosted, nil
	default:
		return SettlementSummaryNotApplicable, nil
	}
}

func deriveRecordSettlement(index int, lifecycle LifecycleStatus, record JournalRecord) (*SettlementStatus, error) {
	isBalance := record.AccountType == accounts.AccountTypeOwned || record.AccountType == accounts.AccountTypeParty
	if !isBalance {
		if record.PendingDate != nil || record.PostedDate != nil {
			return nil, services.InvalidRequest(fmt.Sprintf("records[%d] flow and system records must not have settlement dates", index))
		}
		return nil, nil
	}
	if lifecycle == LifecycleStatusExpected {
		if record.PendingDate != nil || record.PostedDate != nil {
			return nil, services.InvalidRequest(fmt.Sprintf("records[%d] expected balance records must not have settlement dates", index))
		}
		return nil, nil
	}
	if record.PendingDate != nil && record.PostedDate != nil && record.PostedDate.Before(*record.PendingDate) {
		return nil, services.InvalidRequest(fmt.Sprintf("records[%d] posted_date must not precede pending_date", index))
	}
	if record.PostedDate != nil {
		status := SettlementStatusPosted
		return &status, nil
	}
	if record.PendingDate != nil {
		status := SettlementStatusPending
		return &status, nil
	}
	return nil, services.InvalidRequest(fmt.Sprintf("records[%d] active or cancelled balance record requires settlement dates", index))
}

// ClassifySemanticRecords validates and derives transaction semantics from resolved records.
func ClassifySemanticRecords(records []SemanticRecord) (Classification, error) {
	if len(records) == 0 {
		return Classification{}, services.InvalidRequest("transaction requires semantic records")
	}

	roles := make([]RecordRole, len(records))
	for index, record := range records {
		role, err := deriveRecordRole(record)
		if err != nil {
			return Classification{}, semanticRecordError(index, err)
		}
		roles[index] = role
	}
	if err := validateExchangeExclusivity(records, roles); err != nil {
		return Classification{}, err
	}

	shapes := make([]TransactionShape, 0, 7)
	appendRoleShape := func(shapeType TransactionShapeType, role RecordRole, transform func([]DisplayAmount) []DisplayAmount) error {
		amounts, err := sumRoleRecords(records, roles, role)
		if err != nil {
			return err
		}
		if len(amounts) == 0 {
			return nil
		}
		shapes = append(shapes, TransactionShape{Shape: shapeType, Amounts: transform(amounts)})
		return nil
	}
	if err := appendRoleShape(TransactionShapeSpend, RecordRoleExpense, negateAmounts); err != nil {
		return Classification{}, err
	}
	if err := appendRoleShape(TransactionShapeRefund, RecordRoleRefund, absAmounts); err != nil {
		return Classification{}, err
	}
	if err := appendRoleShape(TransactionShapeIncome, RecordRoleIncome, absAmounts); err != nil {
		return Classification{}, err
	}
	if err := appendRoleShape(TransactionShapeClawback, RecordRoleClawback, negateAmounts); err != nil {
		return Classification{}, err
	}
	if err := appendRoleShape(TransactionShapeAdjustment, RecordRoleAdjustment, negateAmounts); err != nil {
		return Classification{}, err
	}

	hasExchange := slices.Contains(roles, RecordRoleExchange)
	if hasExchange {
		exchangeShape, err := deriveExchangeShape(records, roles)
		if err != nil {
			return Classification{}, err
		}
		shapes = append(shapes, exchangeShape)
	} else if transferPresent(records, roles) {
		amounts, err := transferAmounts(records, roles)
		if err != nil {
			return Classification{}, err
		}
		shapes = append(shapes, TransactionShape{Shape: TransactionShapeTransfer, Amounts: amounts})
	}

	class := classFromShapes(shapes)
	primaryAmounts := []DisplayAmount{}
	if economicShapeCount(shapes) == 1 {
		for _, shape := range shapes {
			if isEconomicShape(shape.Shape) && shape.Shape != TransactionShapeExchange {
				primaryAmounts = cloneDisplayAmounts(shape.Amounts)
				break
			}
		}
	}

	return Classification{
		Class:          class,
		PrimaryAmounts: primaryAmounts,
		Shapes:         shapes,
		Roles:          roles,
	}, nil
}

func deriveRecordRole(record SemanticRecord) (RecordRole, error) {
	hasCategory := record.CategoryID != nil
	if record.AccountType == accounts.AccountTypeFlow {
		if !hasCategory {
			return "", fmt.Errorf("flow record requires a category")
		}
		switch record.EconomicIntent {
		case categories.CategoryEconomicIntentExpense:
			if record.Amount.Sign() > 0 {
				return RecordRoleExpense, nil
			}
			return RecordRoleRefund, nil
		case categories.CategoryEconomicIntentIncome:
			if record.Amount.Sign() < 0 {
				return RecordRoleIncome, nil
			}
			return RecordRoleClawback, nil
		default:
			return "", fmt.Errorf("flow record has unsupported category intent")
		}
	}
	if hasCategory {
		return "", fmt.Errorf("%s record cannot have a category", record.AccountType)
	}

	switch record.AccountType {
	case accounts.AccountTypeOwned, accounts.AccountTypeParty:
		return RecordRoleBalance, nil
	case accounts.AccountTypeSystem:
		switch record.AccountFQN {
		case "system:exchange":
			return RecordRoleExchange, nil
		case "system:suspense", "system:correction", "system:opening_balance":
			return RecordRoleAdjustment, nil
		default:
			return "", fmt.Errorf("unknown system account")
		}
	default:
		return "", fmt.Errorf("unsupported account type")
	}
}

func semanticRecordError(index int, cause error) error {
	return services.InvalidRequest(fmt.Sprintf("records[%d]: %s", index, cause))
}

func validateExchangeExclusivity(records []SemanticRecord, roles []RecordRole) error {
	if !slices.Contains(roles, RecordRoleExchange) {
		return nil
	}

	currencies := map[string]struct{}{}
	for _, record := range records {
		currencies[record.Currency] = struct{}{}
	}
	if len(currencies) != 2 {
		return exchangeRecordError(roles, "exchange must span exactly two currencies")
	}

	for index, role := range roles {
		if role != RecordRoleBalance && role != RecordRoleExchange {
			return semanticRecordError(index, fmt.Errorf("exchange cannot contain %s records", role))
		}
	}

	signByCurrency := map[string]int{}
	firstBalanceIndex := -1
	for index, role := range roles {
		if role != RecordRoleBalance {
			continue
		}
		if firstBalanceIndex < 0 {
			firstBalanceIndex = index
		}
		sign := records[index].Amount.Sign()
		if existing := signByCurrency[records[index].Currency]; existing != 0 && existing != sign {
			return semanticRecordError(index, fmt.Errorf("exchange balance records in one currency must have one sign"))
		}
		signByCurrency[records[index].Currency] = sign
	}
	if len(signByCurrency) != 2 {
		return exchangeRecordError(roles, "exchange requires balance records in both currencies")
	}
	signs := []int{}
	for _, sign := range signByCurrency {
		signs = append(signs, sign)
	}
	if signs[0] == signs[1] {
		return semanticRecordError(firstBalanceIndex, fmt.Errorf("exchange requires opposite balance signs"))
	}

	totals := map[string]struct {
		amount values.Decimal
		index  int
	}{}
	for index, record := range records {
		total, ok := totals[record.Currency]
		if !ok {
			totals[record.Currency] = struct {
				amount values.Decimal
				index  int
			}{amount: record.Amount, index: index}
			continue
		}
		amount, err := total.amount.Add(record.Amount)
		if err != nil {
			return semanticRecordError(index, fmt.Errorf("exchange must balance to zero in each currency"))
		}
		total.amount = amount
		totals[record.Currency] = total
	}
	for _, total := range totals {
		if total.amount.Sign() != 0 {
			return semanticRecordError(total.index, fmt.Errorf("exchange must balance to zero in each currency"))
		}
	}
	return nil
}

func exchangeRecordError(roles []RecordRole, message string) error {
	return semanticRecordError(slices.Index(roles, RecordRoleExchange), fmt.Errorf("%s", message))
}

func deriveExchangeShape(records []SemanticRecord, roles []RecordRole) (TransactionShape, error) {
	amounts, err := sumRoleRecords(records, roles, RecordRoleBalance)
	if err != nil {
		return TransactionShape{}, err
	}
	var sold DisplayAmount
	var bought DisplayAmount
	for _, amount := range amounts {
		if amount.Amount.Sign() < 0 {
			sold = amount
		} else {
			bought = amount
		}
	}
	rate, err := sold.Amount.Abs().Div(bought.Amount.Abs())
	if err != nil {
		return TransactionShape{}, services.InvalidRequest("exchange effective rate exceeds supported decimal range")
	}
	if rate.Sign() == 0 {
		return TransactionShape{}, services.InvalidRequest("exchange effective rate is below supported decimal precision")
	}
	return TransactionShape{
		Shape:   TransactionShapeExchange,
		Amounts: amounts,
		EffectiveRate: &ExchangeEffectiveRate{
			SoldCurrency:   sold.Currency,
			BoughtCurrency: bought.Currency,
			Rate:           rate,
		},
	}, nil
}

func transferPresent(records []SemanticRecord, roles []RecordRole) bool {
	hasPositive := false
	hasNegative := false
	for index, role := range roles {
		if role != RecordRoleBalance {
			continue
		}
		if records[index].Amount.Sign() > 0 {
			hasPositive = true
		}
		if records[index].Amount.Sign() < 0 {
			hasNegative = true
		}
	}
	return hasPositive && hasNegative
}

func transferAmounts(records []SemanticRecord, roles []RecordRole) ([]DisplayAmount, error) {
	hasParty := false
	for index, role := range roles {
		if role == RecordRoleBalance && records[index].AccountType == accounts.AccountTypeParty {
			hasParty = true
			break
		}
	}
	amounts, err := sumRecords(records, func(index int, record SemanticRecord) bool {
		if roles[index] != RecordRoleBalance {
			return false
		}
		if hasParty {
			return record.AccountType == accounts.AccountTypeParty
		}
		return record.Amount.Sign() > 0
	})
	if err != nil {
		return nil, err
	}
	if hasParty {
		return negateAmounts(amounts), nil
	}
	return amounts, nil
}

func classFromShapes(shapes []TransactionShape) TransactionClass {
	if economicShapeCount(shapes) > 1 {
		return TransactionClassMixed
	}
	for _, shape := range shapes {
		switch shape.Shape {
		case TransactionShapeSpend:
			return TransactionClassSpend
		case TransactionShapeRefund:
			return TransactionClassRefund
		case TransactionShapeIncome:
			return TransactionClassIncome
		case TransactionShapeClawback:
			return TransactionClassClawback
		case TransactionShapeAdjustment:
			return TransactionClassAdjustment
		case TransactionShapeExchange:
			return TransactionClassCurrencyExchange
		}
	}
	return TransactionClassTransfer
}

func economicShapeCount(shapes []TransactionShape) int {
	count := 0
	for _, shape := range shapes {
		if isEconomicShape(shape.Shape) {
			count++
		}
	}
	return count
}

func isEconomicShape(shape TransactionShapeType) bool {
	return shape != TransactionShapeTransfer
}

func sumRoleRecords(records []SemanticRecord, roles []RecordRole, role RecordRole) ([]DisplayAmount, error) {
	return sumRecords(records, func(index int, _ SemanticRecord) bool {
		return roles[index] == role
	})
}

func sumRecords(records []SemanticRecord, include func(int, SemanticRecord) bool) ([]DisplayAmount, error) {
	amounts := []DisplayAmount{}
	for index, record := range records {
		if !include(index, record) {
			continue
		}
		next, err := addDisplayAmount(amounts, DisplayAmount{
			Currency:  record.Currency,
			Amount:    record.Amount,
			AmountUSD: record.AmountUSD,
		})
		if err != nil {
			return nil, err
		}
		amounts = next
	}
	return amounts, nil
}

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
		if amounts[index].AmountUSD == nil || next.AmountUSD == nil {
			amounts[index].AmountUSD = nil
			return amounts, nil
		}
		amountUSD, err := amounts[index].AmountUSD.Add(*next.AmountUSD)
		if err != nil {
			amounts[index].AmountUSD = nil
			return amounts, nil
		}
		amounts[index].AmountUSD = &amountUSD
		return amounts, nil
	}
	amounts = append(amounts, next)
	return amounts, nil
}

func negateAmounts(amounts []DisplayAmount) []DisplayAmount {
	cloned := cloneDisplayAmounts(amounts)
	for index := range cloned {
		cloned[index].Amount = cloned[index].Amount.Neg()
		if cloned[index].AmountUSD != nil {
			amountUSD := cloned[index].AmountUSD.Neg()
			cloned[index].AmountUSD = &amountUSD
		}
	}
	return cloned
}

func absAmounts(amounts []DisplayAmount) []DisplayAmount {
	cloned := cloneDisplayAmounts(amounts)
	for index := range cloned {
		cloned[index].Amount = cloned[index].Amount.Abs()
		if cloned[index].AmountUSD != nil {
			amountUSD := cloned[index].AmountUSD.Abs()
			cloned[index].AmountUSD = &amountUSD
		}
	}
	return cloned
}

func transactionDisplayTitle(transaction Transaction) string {
	from, to := titlePredicates(transaction.Class)
	if from != nil {
		if title := directionalAccountTitle(transaction.Records, from, to); title != "" {
			return title
		}
	}
	if transaction.Class == TransactionClassCurrencyExchange {
		if title := exchangeAccountTitle(transaction.Records); title != "" {
			return title
		}
	}
	if transaction.Class == TransactionClassAdjustment {
		if name, ok := uniqueAccountDisplayLabel(transaction.Records, func(record JournalRecord) bool {
			return record.Role == RecordRoleBalance
		}); ok {
			return name
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
func titlePredicates(class TransactionClass) (func(JournalRecord) bool, func(JournalRecord) bool) {
	switch class {
	case TransactionClassSpend:
		return func(record JournalRecord) bool {
				return record.Role == RecordRoleBalance && record.Amount.Sign() < 0
			}, func(record JournalRecord) bool {
				return record.Role == RecordRoleExpense
			}
	case TransactionClassIncome, TransactionClassRefund:
		wantRole := RecordRoleIncome
		if class == TransactionClassRefund {
			wantRole = RecordRoleRefund
		}
		return func(record JournalRecord) bool {
				return record.Role == wantRole
			}, func(record JournalRecord) bool {
				return record.Role == RecordRoleBalance && record.Amount.Sign() > 0
			}
	case TransactionClassClawback:
		return func(record JournalRecord) bool {
				return record.Role == RecordRoleBalance && record.Amount.Sign() < 0
			}, func(record JournalRecord) bool {
				return record.Role == RecordRoleClawback
			}
	case TransactionClassTransfer:
		return func(record JournalRecord) bool {
				return record.Role == RecordRoleBalance && record.Amount.Sign() < 0
			}, func(record JournalRecord) bool {
				return record.Role == RecordRoleBalance && record.Amount.Sign() > 0
			}
	default:
		return nil, nil
	}
}

func directionalAccountTitle(records []JournalRecord, from, to func(JournalRecord) bool) string {
	fromName, ok := uniqueAccountDisplayLabel(records, from)
	if !ok {
		return ""
	}
	toName, ok := uniqueAccountDisplayLabel(records, to)
	if !ok {
		return ""
	}
	return fromName + " → " + toName
}

func uniqueAccountDisplayLabel(records []JournalRecord, include func(JournalRecord) bool) (string, bool) {
	name := ""
	var accountID int64
	for _, record := range records {
		if !include(record) || record.AccountDisplayLabel == "" {
			continue
		}
		if name == "" {
			name = record.AccountDisplayLabel
			accountID = record.AccountID
			continue
		}
		if record.AccountID != accountID {
			return "", false
		}
	}
	return name, name != ""
}

func exchangeAccountTitle(records []JournalRecord) string {
	soldName, soldCurrency, soldAccountID, soldOK := uniqueExchangeSide(records, -1)
	boughtName, boughtCurrency, boughtAccountID, boughtOK := uniqueExchangeSide(records, 1)
	if !soldOK || !boughtOK {
		return directionalCurrencyMarkerTitle(records)
	}

	soldMarker, boughtMarker := exchangeCurrencyMarkers(soldCurrency, boughtCurrency)
	if soldAccountID == boughtAccountID {
		return fmt.Sprintf("%s (%s → %s)", soldName, soldMarker, boughtMarker)
	}
	return fmt.Sprintf("%s (%s) → %s (%s)", soldName, soldMarker, boughtName, boughtMarker)
}

func uniqueExchangeSide(records []JournalRecord, sign int) (string, string, int64, bool) {
	name := ""
	currencyCode := ""
	var accountID int64
	found := false
	for _, record := range records {
		if record.Role != RecordRoleBalance || record.Amount.Sign() != sign {
			continue
		}
		if !found {
			name = record.AccountDisplayLabel
			currencyCode = record.Currency
			accountID = record.AccountID
			found = true
			continue
		}
		if record.AccountID != accountID {
			return "", "", 0, false
		}
	}
	return name, currencyCode, accountID, found
}

func exchangeCurrencyMarker(currencyCode string) string {
	unit, err := currency.ParseISO(currencyCode)
	if err != nil {
		return currencyCode
	}
	return fmt.Sprint(currency.NarrowSymbol(unit))
}

func exchangeCurrencyMarkers(soldCurrency, boughtCurrency string) (string, string) {
	soldMarker := exchangeCurrencyMarker(soldCurrency)
	boughtMarker := exchangeCurrencyMarker(boughtCurrency)
	if soldMarker == boughtMarker {
		return soldCurrency, boughtCurrency
	}
	return soldMarker, boughtMarker
}

func directionalCurrencyMarkerTitle(records []JournalRecord) string {
	sold := ""
	bought := ""
	for _, record := range records {
		if record.Role != RecordRoleBalance {
			continue
		}
		if record.Amount.Sign() < 0 {
			sold = record.Currency
		} else {
			bought = record.Currency
		}
	}
	if sold == "" || bought == "" {
		return ""
	}
	sold, bought = exchangeCurrencyMarkers(sold, bought)
	return sold + " → " + bought
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
	return dominantRecordTitle(records, func(record JournalRecord) bool {
		return record.Role != RecordRoleBalance
	})
}

func dominantRecordTitle(records []JournalRecord, include func(JournalRecord) bool) string {
	title := ""
	var maxAmount DisplayAmount
	found := false
	for _, record := range records {
		if !include(record) || strings.TrimSpace(record.AccountDisplayLabel) == "" {
			continue
		}
		amount := record.Amount.Abs()
		if !found || amount.Cmp(maxAmount.Amount) > 0 {
			title = record.AccountDisplayLabel
			maxAmount = DisplayAmount{Amount: amount}
			found = true
		}
	}
	return title
}

func cloneDisplayAmounts(amounts []DisplayAmount) []DisplayAmount {
	cloned := append([]DisplayAmount{}, amounts...)
	for index := range cloned {
		if cloned[index].AmountUSD != nil {
			amountUSD := *cloned[index].AmountUSD
			cloned[index].AmountUSD = &amountUSD
		}
	}
	return cloned
}
