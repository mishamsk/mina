package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestShorthandTransactionCreateSignsAndDefaults(t *testing.T) {
	client := newSharedClient(t)
	refs := createShorthandRefs(client)

	spend := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: refs.merchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "12.34",
	})
	assertTransactionClass(t, "spend", spend, httpclient.TransactionClassSpend)
	assertTransactionDisplayTitle(t, "spend", spend, "Primary → Coffee")
	assertRecordAmount(t, spend, refs.checkingAccountID, "-12.34000000")
	assertRecordAmount(t, spend, refs.merchantAccountID, "12.34000000")
	assertDefaultShorthandRecords(t, spend)

	income := createIncomeTransaction(t, client, httpclient.CreateIncomeTransactionRequest{
		InitiatedDate:        apptest.Date("2024-04-02"),
		DestinationAccountId: refs.checkingAccountID,
		SourceAccountId:      refs.employerAccountID,
		CategoryId:           refs.incomeCategoryID,
		Currency:             "USD",
		Amount:               "100.00",
	})
	assertTransactionClass(t, "income", income, httpclient.TransactionClassIncome)
	assertTransactionDisplayTitle(t, "income", income, "Employer → Primary")
	assertRecordAmount(t, income, refs.checkingAccountID, "100.00000000")
	assertRecordAmount(t, income, refs.employerAccountID, "-100.00000000")

	refund := createRefundTransaction(t, client, httpclient.CreateRefundTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-03"),
		DestinationAccountId:  refs.checkingAccountID,
		CounterpartyAccountId: refs.merchantAccountID,
		CategoryId:            refs.refundCategoryID,
		Currency:              "USD",
		Amount:                "5.67",
	})
	assertTransactionClass(t, "refund", refund, httpclient.TransactionClassRefund)
	assertTransactionDisplayTitle(t, "refund", refund, "Coffee → Primary")
	assertRecordAmount(t, refund, refs.checkingAccountID, "5.67000000")
	assertRecordAmount(t, refund, refs.merchantAccountID, "-5.67000000")

	transfer := createTransferTransaction(t, client, httpclient.CreateTransferTransactionRequest{
		InitiatedDate:        apptest.Date("2024-04-04"),
		SourceAccountId:      refs.checkingAccountID,
		DestinationAccountId: refs.savingsAccountID,
		CategoryId:           refs.transferCategoryID,
		Currency:             "USD",
		Amount:               "25.00",
	})
	assertTransactionClass(t, "transfer", transfer, httpclient.TransactionClassTransfer)
	assertTransactionDisplayTitle(t, "transfer", transfer, "Primary → Reserve")
	assertRecordAmount(t, transfer, refs.checkingAccountID, "-25.00000000")
	assertRecordAmount(t, transfer, refs.savingsAccountID, "25.00000000")
}

func TestShorthandTransactionCreateOptionalFieldsAmountUSDAndReadShapes(t *testing.T) {
	client := newSharedClient(t)
	refs := createShorthandRefs(client)
	memo := "Manual coffee"
	pendingDate := apptest.Timestamp("2024-04-05T14:30:00Z")
	postedDate := apptest.Timestamp("2024-04-06T15:45:00Z")
	postingStatus := httpclient.PostingStatusPending
	reconciliationStatus := httpclient.Unreconciled

	created := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-05"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: refs.merchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "7.89",
		MemberId:              &refs.memberID,
		TagIds:                apptest.Int64SlicePtr(refs.tagID),
		Memo:                  &memo,
		PendingDate:           &pendingDate,
		PostedDate:            &postedDate,
		PostingStatus:         &postingStatus,
		ReconciliationStatus:  &reconciliationStatus,
	})
	for _, record := range created.Records {
		if record.MemberId == nil || *record.MemberId != refs.memberID {
			t.Fatalf("member_id = %v, want %d", record.MemberId, refs.memberID)
		}
		assertInt64s(t, record.TagIds, []int64{refs.tagID})
		if record.Memo == nil || *record.Memo != memo {
			t.Fatalf("memo = %v, want %q", record.Memo, memo)
		}
		if !record.PendingDate.Equal(pendingDate) {
			t.Fatalf("pending_date = %v, want %v", record.PendingDate, pendingDate)
		}
		if record.PostedDate == nil || !record.PostedDate.Equal(postedDate) {
			t.Fatalf("posted_date = %v, want %v", record.PostedDate, postedDate)
		}
		if record.PostingStatus != httpclient.PostingStatusPending {
			t.Fatalf("posting_status = %q, want %q", record.PostingStatus, httpclient.PostingStatusPending)
		}
		if record.ReconciliationStatus != httpclient.Unreconciled {
			t.Fatalf("reconciliation_status = %q, want %q", record.ReconciliationStatus, httpclient.Unreconciled)
		}
		if record.Source != httpclient.Manual {
			t.Fatalf("source = %q, want %q", record.Source, httpclient.Manual)
		}
	}
	assertRecordAmountUSD(t, created, refs.checkingAccountID, "-7.89000000")
	assertRecordAmountUSD(t, created, refs.merchantAccountID, "7.89000000")

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.TransactionId)
	if err != nil {
		t.Fatalf("get shorthand transaction request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("get shorthand transaction status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.TransactionId != created.TransactionId || len(read.JSON200.Records) != 2 {
		t.Fatalf("read transaction = %+v, want id %d with 2 records", read.JSON200, created.TransactionId)
	}

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list shorthand transactions request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list shorthand transactions status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	assertTransactionIDs(t, list.JSON200.Transactions, []int64{created.TransactionId})

	search, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		TagId: &refs.tagID,
	})
	if err != nil {
		t.Fatalf("search shorthand records request: %v", err)
	}
	if search.StatusCode() != http.StatusOK {
		t.Fatalf("search shorthand records status = %d, want %d; body %s", search.StatusCode(), http.StatusOK, search.Body)
	}
	assertRecordIDs(t, search.JSON200.Records, []int64{created.Records[0].RecordId, created.Records[1].RecordId})

	client.Scenario().ExchangeRate("USD", "EUR", "2024-04-07T00:00:00Z")
	eur := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-07"),
		FundingAccountId:      refs.euroCashAccountID,
		CounterpartyAccountId: refs.euroMerchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "EUR",
		Amount:                "3.21",
	})
	assertRecordAmountUSD(t, eur, refs.euroCashAccountID, "-2.91818182")
	assertRecordAmountUSD(t, eur, refs.euroMerchantAccountID, "2.91818182")
}

func TestShorthandTransactionInfersNonUSDAmountUSDFromExchangeRates(t *testing.T) {
	client := newSharedClient(t)
	refs := createShorthandRefs(client)

	createExchangeRate(t, client, "USD", "EUR", "1.10000000", "2024-04-01T00:00:00Z")
	createExchangeRate(t, client, "USD", "EUR", "1.20000000", "2024-04-11T00:00:00Z")

	exact := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.euroCashAccountID,
		CounterpartyAccountId: refs.euroMerchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "EUR",
		Amount:                "11.00",
	})
	assertRecordAmountUSD(t, exact, refs.euroCashAccountID, "-10.00000000")
	assertRecordAmountUSD(t, exact, refs.euroMerchantAccountID, "10.00000000")

	interpolated := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-06"),
		FundingAccountId:      refs.euroCashAccountID,
		CounterpartyAccountId: refs.euroMerchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "EUR",
		Amount:                "11.50",
	})
	assertRecordAmountUSD(t, interpolated, refs.euroCashAccountID, "-10.00000000")
	assertRecordAmountUSD(t, interpolated, refs.euroMerchantAccountID, "10.00000000")

	beforeEarliest := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-03-31"),
		FundingAccountId:      refs.euroCashAccountID,
		CounterpartyAccountId: refs.euroMerchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "EUR",
		Amount:                "5.00",
	})
	assertRecordAmountUSDNil(t, beforeEarliest, refs.euroCashAccountID)
	assertRecordAmountUSDNil(t, beforeEarliest, refs.euroMerchantAccountID)

	afterLatest := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-12"),
		FundingAccountId:      refs.euroCashAccountID,
		CounterpartyAccountId: refs.euroMerchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "EUR",
		Amount:                "5.00",
	})
	assertRecordAmountUSDNil(t, afterLatest, refs.euroCashAccountID)
	assertRecordAmountUSDNil(t, afterLatest, refs.euroMerchantAccountID)

	cryptoCash := client.Scenario().AccountWithCurrency("crypto:Shorthand:BTC", "C::BTC")
	cryptoMerchant := client.Scenario().Account("merchant:Shorthand:Crypto")
	crypto := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-06"),
		FundingAccountId:      cryptoCash.AccountId,
		CounterpartyAccountId: cryptoMerchant.AccountId,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "C::BTC",
		Amount:                "1.00",
	})
	assertRecordAmountUSDNil(t, crypto, cryptoCash.AccountId)
	assertRecordAmountUSDNil(t, crypto, cryptoMerchant.AccountId)
}

func TestShorthandTransactionUsesPostedDateForAmountUSDInference(t *testing.T) {
	client := newSharedClient(t)
	refs := createShorthandRefs(client)
	postedDate := apptest.Timestamp("2024-04-02T15:00:00Z")

	createExchangeRate(t, client, "USD", "EUR", "1.00000000", "2024-04-01T00:00:00Z")
	createExchangeRate(t, client, "USD", "EUR", "2.00000000", "2024-04-02T00:00:00Z")

	created := createSpendTransaction(t, client, httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.euroCashAccountID,
		CounterpartyAccountId: refs.euroMerchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "EUR",
		Amount:                "10.00",
		PostedDate:            &postedDate,
	})
	assertRecordAmountUSD(t, created, refs.euroCashAccountID, "-5.00000000")
	assertRecordAmountUSD(t, created, refs.euroMerchantAccountID, "5.00000000")
}

func TestShorthandTransactionValidationErrors(t *testing.T) {
	client := newSharedClient(t)
	refs := createShorthandRefs(client)

	negativeAmount, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: refs.merchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "-1.00",
	})
	if err != nil {
		t.Fatalf("negative amount request: %v", err)
	}
	assertShorthandInvalidRequest(t, "negative amount", negativeAmount.StatusCode(), negativeAmount.JSON400, negativeAmount.Body)

	duplicateTransfer, err := client.REST().CreateTransferTransactionWithResponse(context.Background(), httpclient.CreateTransferTransactionRequest{
		InitiatedDate:        apptest.Date("2024-04-01"),
		SourceAccountId:      refs.checkingAccountID,
		DestinationAccountId: refs.checkingAccountID,
		CategoryId:           refs.transferCategoryID,
		Currency:             "USD",
		Amount:               "1.00",
	})
	if err != nil {
		t.Fatalf("duplicate transfer request: %v", err)
	}
	assertShorthandInvalidRequest(t, "duplicate transfer", duplicateTransfer.StatusCode(), duplicateTransfer.JSON400, duplicateTransfer.Body)

	missingReference, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: 999999,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "1.00",
	})
	if err != nil {
		t.Fatalf("missing reference request: %v", err)
	}
	assertShorthandInvalidRequest(t, "missing reference", missingReference.StatusCode(), missingReference.JSON400, missingReference.Body)

	missingMemberID := int64(999999)
	missingMember, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: refs.merchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "1.00",
		MemberId:              &missingMemberID,
	})
	if err != nil {
		t.Fatalf("missing member request: %v", err)
	}
	assertShorthandInvalidRequest(t, "missing member", missingMember.StatusCode(), missingMember.JSON400, missingMember.Body)

	missingTag, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: refs.merchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "1.00",
		TagIds:                apptest.Int64SlicePtr(999999),
	})
	if err != nil {
		t.Fatalf("missing tag request: %v", err)
	}
	assertShorthandInvalidRequest(t, "missing tag", missingTag.StatusCode(), missingTag.JSON400, missingTag.Body)

	tombstonedMember := client.Scenario().Member("Tombstoned Shorthand Member")
	deleteMember(t, client, tombstonedMember.MemberId)
	tombstonedMemberID := tombstonedMember.MemberId
	tombstonedMemberResponse, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: refs.merchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "1.00",
		MemberId:              &tombstonedMemberID,
	})
	if err != nil {
		t.Fatalf("tombstoned member request: %v", err)
	}
	assertShorthandInvalidRequest(t, "tombstoned member", tombstonedMemberResponse.StatusCode(), tombstonedMemberResponse.JSON400, tombstonedMemberResponse.Body)

	tombstonedTag := client.Scenario().Tag("References:TombstonedShorthandTag")
	deleteTag(t, client, tombstonedTag.TagId)
	tombstonedTagResponse, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: refs.merchantAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "1.00",
		TagIds:                apptest.Int64SlicePtr(tombstonedTag.TagId),
	})
	if err != nil {
		t.Fatalf("tombstoned tag request: %v", err)
	}
	assertShorthandInvalidRequest(t, "tombstoned tag", tombstonedTagResponse.StatusCode(), tombstonedTagResponse.JSON400, tombstonedTagResponse.Body)

	wrongCategoryIntent, err := client.REST().CreateIncomeTransactionWithResponse(context.Background(), httpclient.CreateIncomeTransactionRequest{
		InitiatedDate:        apptest.Date("2024-04-01"),
		DestinationAccountId: refs.checkingAccountID,
		SourceAccountId:      refs.employerAccountID,
		CategoryId:           refs.refundCategoryID,
		Currency:             "USD",
		Amount:               "1.00",
	})
	if err != nil {
		t.Fatalf("wrong category intent request: %v", err)
	}
	assertShorthandInvalidRequest(t, "wrong category intent", wrongCategoryIntent.StatusCode(), wrongCategoryIntent.JSON400, wrongCategoryIntent.Body)

	wrongShape, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), httpclient.CreateSpendTransactionRequest{
		InitiatedDate:         apptest.Date("2024-04-01"),
		FundingAccountId:      refs.checkingAccountID,
		CounterpartyAccountId: refs.savingsAccountID,
		CategoryId:            refs.expenseCategoryID,
		Currency:              "USD",
		Amount:                "1.00",
	})
	if err != nil {
		t.Fatalf("wrong shape request: %v", err)
	}
	assertShorthandInvalidRequest(t, "wrong shape", wrongShape.StatusCode(), wrongShape.JSON400, wrongShape.Body)

	excludedField, err := client.REST().CreateSpendTransactionWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"initiated_date":          "2024-04-01",
		"funding_account_id":      refs.checkingAccountID,
		"counterparty_account_id": refs.merchantAccountID,
		"category_id":             refs.expenseCategoryID,
		"currency":                "USD",
		"amount":                  "1.00",
		"amount_usd":              "1.00",
	}))
	if err != nil {
		t.Fatalf("excluded field request: %v", err)
	}
	assertShorthandInvalidRequest(t, "excluded field", excludedField.StatusCode(), excludedField.JSON400, excludedField.Body)
}

type shorthandRefs struct {
	checkingAccountID     int64
	savingsAccountID      int64
	euroCashAccountID     int64
	merchantAccountID     int64
	euroMerchantAccountID int64
	employerAccountID     int64
	expenseCategoryID     int64
	incomeCategoryID      int64
	refundCategoryID      int64
	transferCategoryID    int64
	tagID                 int64
	memberID              int64
}

func createShorthandRefs(client *apptest.Client) shorthandRefs {
	scenario := client.Scenario()
	checking := scenario.AccountWithCurrency("checking:Shorthand:Primary", "USD")
	savings := scenario.AccountWithCurrency("savings:Shorthand:Reserve", "USD")
	euroCash := scenario.AccountWithCurrency("cash:Shorthand:EUR", "EUR")
	merchant := scenario.Account("merchant:Shorthand:Coffee")
	euroMerchant := scenario.Account("merchant:Shorthand:EuroCoffee")
	employer := scenario.Account("income:Shorthand:Employer")
	expenseCategory := scenario.CategoryWithIntent("Shorthand:Expense", httpclient.CategoryEconomicIntentExpense)
	incomeCategory := scenario.CategoryWithIntent("Shorthand:Income", httpclient.CategoryEconomicIntentIncome)
	refundCategory := scenario.CategoryWithIntent("Shorthand:Refund", httpclient.CategoryEconomicIntentRefund)
	transferCategory := scenario.CategoryWithIntent("Shorthand:Transfer", httpclient.CategoryEconomicIntentTransfer)
	tag := scenario.Tag("Shorthand:Tagged")
	member := scenario.Member("Jordan")

	return shorthandRefs{
		checkingAccountID:     checking.AccountId,
		savingsAccountID:      savings.AccountId,
		euroCashAccountID:     euroCash.AccountId,
		merchantAccountID:     merchant.AccountId,
		euroMerchantAccountID: euroMerchant.AccountId,
		employerAccountID:     employer.AccountId,
		expenseCategoryID:     expenseCategory.CategoryId,
		incomeCategoryID:      incomeCategory.CategoryId,
		refundCategoryID:      refundCategory.CategoryId,
		transferCategoryID:    transferCategory.CategoryId,
		tagID:                 tag.TagId,
		memberID:              member.MemberId,
	}
}

func createSpendTransaction(t *testing.T, client *apptest.Client, request httpclient.CreateSpendTransactionRequest) httpclient.Transaction {
	t.Helper()

	response, err := client.REST().CreateSpendTransactionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create spend transaction request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create spend transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func createIncomeTransaction(t *testing.T, client *apptest.Client, request httpclient.CreateIncomeTransactionRequest) httpclient.Transaction {
	t.Helper()

	response, err := client.REST().CreateIncomeTransactionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create income transaction request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create income transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func createRefundTransaction(t *testing.T, client *apptest.Client, request httpclient.CreateRefundTransactionRequest) httpclient.Transaction {
	t.Helper()

	response, err := client.REST().CreateRefundTransactionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create refund transaction request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create refund transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func createTransferTransaction(t *testing.T, client *apptest.Client, request httpclient.CreateTransferTransactionRequest) httpclient.Transaction {
	t.Helper()

	response, err := client.REST().CreateTransferTransactionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create transfer transaction request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create transfer transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func createExchangeRate(
	t *testing.T,
	client *apptest.Client,
	fromCurrency string,
	toCurrency string,
	rate string,
	effectiveDate string,
) httpclient.ExchangeRate {
	t.Helper()

	response, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  fromCurrency,
		ToCurrency:    toCurrency,
		Rate:          rate,
		EffectiveDate: apptest.Timestamp(effectiveDate),
	})
	if err != nil {
		t.Fatalf("create exchange rate request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create exchange rate status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func assertRecordAmount(t *testing.T, transaction httpclient.Transaction, accountID int64, want string) {
	t.Helper()

	record := transactionRecordByAccount(t, transaction, accountID)
	if record.Amount != want {
		t.Fatalf("record amount for account %d = %q, want %q; records %+v", accountID, record.Amount, want, transaction.Records)
	}
}

func assertRecordAmountUSD(t *testing.T, transaction httpclient.Transaction, accountID int64, want string) {
	t.Helper()

	record := transactionRecordByAccount(t, transaction, accountID)
	if record.AmountUsd == nil || *record.AmountUsd != want {
		t.Fatalf("record amount_usd for account %d = %v, want %q; records %+v", accountID, record.AmountUsd, want, transaction.Records)
	}
}

func assertRecordAmountUSDNil(t *testing.T, transaction httpclient.Transaction, accountID int64) {
	t.Helper()

	record := transactionRecordByAccount(t, transaction, accountID)
	if record.AmountUsd != nil {
		t.Fatalf("record amount_usd for account %d = %v, want nil; records %+v", accountID, record.AmountUsd, transaction.Records)
	}
}

func transactionRecordByAccount(t *testing.T, transaction httpclient.Transaction, accountID int64) httpclient.JournalRecord {
	t.Helper()

	for _, record := range transaction.Records {
		if record.AccountId == accountID {
			return record
		}
	}
	t.Fatalf("missing record for account %d; records %+v", accountID, transaction.Records)
	return httpclient.JournalRecord{}
}

func assertDefaultShorthandRecords(t *testing.T, transaction httpclient.Transaction) {
	t.Helper()

	for _, record := range transaction.Records {
		if record.PostingStatus != httpclient.PostingStatusPosted {
			t.Fatalf("default posting_status = %q, want %q", record.PostingStatus, httpclient.PostingStatusPosted)
		}
		if record.ReconciliationStatus != httpclient.Reconciled {
			t.Fatalf("default reconciliation_status = %q, want %q", record.ReconciliationStatus, httpclient.Reconciled)
		}
		if record.Source != httpclient.Manual {
			t.Fatalf("default source = %q, want %q", record.Source, httpclient.Manual)
		}
	}
}

func assertShorthandInvalidRequest(t *testing.T, label string, gotStatus int, gotBody *httpclient.InvalidRequest, rawBody []byte) {
	t.Helper()

	if gotStatus != http.StatusBadRequest {
		t.Fatalf("%s status = %d, want %d; body %s", label, gotStatus, http.StatusBadRequest, rawBody)
	}
	if gotBody == nil || gotBody.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("%s error = %+v, want invalid_request; body %s", label, gotBody, rawBody)
	}
}
