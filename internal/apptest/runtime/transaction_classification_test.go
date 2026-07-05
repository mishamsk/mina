package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionClassificationClassesBoundary(t *testing.T) {
	cases := []struct {
		name      string
		wantClass httpclient.TransactionClass
		wantTitle string
		request   func(*classificationFixture) httpclient.CreateTransactionRequest
	}{
		{name: "spend", wantClass: httpclient.TransactionClassSpend, wantTitle: "Checking → Local", request: spendClassificationRequest},
		{name: "cross-currency spend", wantClass: httpclient.TransactionClassSpend, wantTitle: "Checking → Local", request: crossCurrencySpendClassificationRequest},
		{name: "income", wantClass: httpclient.TransactionClassIncome, wantTitle: "Employer → Checking", request: incomeClassificationRequest},
		{name: "refund", wantClass: httpclient.TransactionClassRefund, wantTitle: "Local → Checking", request: refundClassificationRequest},
		{name: "transfer", wantClass: httpclient.TransactionClassTransfer, wantTitle: "Checking → Savings", request: transferClassificationRequest},
		{name: "currency exchange", wantClass: httpclient.TransactionClassCurrencyExchange, wantTitle: "USD → EUR", request: exchangeClassificationRequest},
		{name: "fee", wantClass: httpclient.TransactionClassSpend, wantTitle: "Checking → Fees", request: feeClassificationRequest},
		{name: "transfer with fee", wantClass: httpclient.TransactionClassTransfer, wantTitle: "Checking → Savings", request: transferWithFeeClassificationRequest},
		{name: "exchange with fee and fx", wantClass: httpclient.TransactionClassCurrencyExchange, wantTitle: "USD → EUR", request: exchangeWithFeeAndFXClassificationRequest},
		{name: "adjustment", wantClass: httpclient.TransactionClassAdjustment, wantTitle: "Checking", request: adjustmentClassificationRequest},
		{name: "fx gain loss", wantClass: httpclient.TransactionClassFxGainLoss, wantTitle: "Checking", request: fxGainLossClassificationRequest},
		{name: "mixed", wantClass: httpclient.TransactionClassMixed, wantTitle: "Employer", request: mixedClassificationRequest},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := newSharedClient(t)
			fixture := newClassificationFixture(t, client)

			created, err := client.REST().CreateTransactionWithResponse(context.Background(), tc.request(fixture))
			requireNoTransportError(t, "create transaction", err)
			if created.StatusCode() != http.StatusCreated {
				t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
			}
			assertTransactionClass(t, "created", *created.JSON201, tc.wantClass)
			assertTransactionDisplayTitle(t, "created", *created.JSON201, tc.wantTitle)

			read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
			requireNoTransportError(t, "read transaction", err)
			if read.StatusCode() != http.StatusOK {
				t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
			}
			assertTransactionClass(t, "read", *read.JSON200, tc.wantClass)
			assertTransactionDisplayTitle(t, "read", *read.JSON200, tc.wantTitle)

			list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
			requireNoTransportError(t, "list transactions", err)
			if list.StatusCode() != http.StatusOK {
				t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
			}
			if len(list.JSON200.Transactions) != 1 {
				t.Fatalf("list count = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
			}
			assertTransactionClass(t, "listed", list.JSON200.Transactions[0], tc.wantClass)
			assertTransactionDisplayTitle(t, "listed", list.JSON200.Transactions[0], tc.wantTitle)
		})
	}
}

func TestTransactionListClassFilterParityBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)
	cases := []struct {
		date    string
		class   httpclient.TransactionClass
		request func(*classificationFixture) httpclient.CreateTransactionRequest
	}{
		{date: "2024-06-01", class: httpclient.TransactionClassSpend, request: spendClassificationRequest},
		{date: "2024-06-02", class: httpclient.TransactionClassSpend, request: crossCurrencySpendClassificationRequest},
		{date: "2024-06-03", class: httpclient.TransactionClassSpend, request: feeClassificationRequest},
		{date: "2024-06-04", class: httpclient.TransactionClassIncome, request: incomeClassificationRequest},
		{date: "2024-06-05", class: httpclient.TransactionClassRefund, request: refundClassificationRequest},
		{date: "2024-06-06", class: httpclient.TransactionClassTransfer, request: transferClassificationRequest},
		{date: "2024-06-07", class: httpclient.TransactionClassTransfer, request: transferWithFeeClassificationRequest},
		{date: "2024-06-08", class: httpclient.TransactionClassCurrencyExchange, request: exchangeClassificationRequest},
		{date: "2024-06-09", class: httpclient.TransactionClassCurrencyExchange, request: exchangeWithFeeAndFXClassificationRequest},
		{date: "2024-06-10", class: httpclient.TransactionClassAdjustment, request: adjustmentClassificationRequest},
		{date: "2024-06-11", class: httpclient.TransactionClassFxGainLoss, request: fxGainLossClassificationRequest},
		{date: "2024-06-12", class: httpclient.TransactionClassMixed, request: mixedClassificationRequest},
	}
	idsByClass := map[httpclient.TransactionClass][]int64{}
	for _, tc := range cases {
		request := tc.request(fixture)
		request.InitiatedDate = apptest.Date(tc.date)
		created, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
		requireNoTransportError(t, "create classified transaction", err)
		if created.StatusCode() != http.StatusCreated {
			t.Fatalf("create %s status = %d, want %d; body %s", tc.class, created.StatusCode(), http.StatusCreated, created.Body)
		}
		if created.JSON201.TransactionClass != tc.class {
			t.Fatalf("created transaction_class = %q, want %q; body %+v", created.JSON201.TransactionClass, tc.class, created.JSON201)
		}
		idsByClass[tc.class] = append([]int64{created.JSON201.TransactionId}, idsByClass[tc.class]...)
	}

	for _, tc := range cases {
		t.Run(string(tc.class), func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
				TransactionClass: ptrTo([]httpclient.TransactionClass{tc.class}),
			})
			requireNoTransportError(t, "list transactions by class", err)
			assertTransactionListResponse(t, "class filter", response, idsByClass[tc.class], int64(len(idsByClass[tc.class])))
			for _, transaction := range response.JSON200.Transactions {
				if transaction.TransactionClass != tc.class {
					t.Fatalf("listed transaction_class = %q, want %q; transaction %+v", transaction.TransactionClass, tc.class, transaction)
				}
			}
		})
	}
}

func TestTransactionListClassFilterCompositionBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)
	spend := createDatedClassificationTransaction(t, client, "2024-06-01", spendClassificationRequest(fixture))
	income := createDatedClassificationTransaction(t, client, "2024-06-02", incomeClassificationRequest(fixture))
	refund := createDatedClassificationTransaction(t, client, "2024-06-03", refundClassificationRequest(fixture))
	createDatedClassificationTransaction(t, client, "2024-06-04", transferClassificationRequest(fixture))

	classAndAccount, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AccountId:        ptrTo([]int64{fixture.employer.AccountId}),
		TransactionClass: ptrTo([]httpclient.TransactionClass{httpclient.TransactionClassIncome}),
	})
	requireNoTransportError(t, "list class and account filter", err)
	assertTransactionListResponse(t, "class and account filter", classAndAccount, []int64{income.JSON201.TransactionId}, 1)

	limitTwo := 2
	offsetOne := 1
	paged, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		TransactionClass: ptrTo([]httpclient.TransactionClass{
			httpclient.TransactionClassSpend,
			httpclient.TransactionClassIncome,
			httpclient.TransactionClassRefund,
		}),
		Limit:  &limitTwo,
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "list paged class filter", err)
	assertTransactionListResponse(t, "paged class filter", paged, []int64{income.JSON201.TransactionId, spend.JSON201.TransactionId}, 3)
	assertTransactionListOffset(t, "paged class filter", *paged.JSON200, 1)

	anchor := apptest.Date("2024-06-02")
	anchored, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		TransactionClass: ptrTo([]httpclient.TransactionClass{
			httpclient.TransactionClassSpend,
			httpclient.TransactionClassIncome,
			httpclient.TransactionClassRefund,
		}),
		Limit:      &limitTwo,
		AnchorDate: &anchor,
	})
	requireNoTransportError(t, "list anchored class filter", err)
	assertTransactionListResponse(t, "anchored class filter", anchored, []int64{refund.JSON201.TransactionId, income.JSON201.TransactionId}, 3)
	assertTransactionListOffset(t, "anchored class filter", *anchored.JSON200, 0)

	assertInvalidTransactionListQuery(t, client, "transaction_class=not_a_class")
}

func TestTransactionListClassFilterUsesReplacementClassBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)
	created := createDatedClassificationTransaction(t, client, "2024-06-01", spendClassificationRequest(fixture))
	replacement := incomeClassificationRequest(fixture)
	replacement.InitiatedDate = apptest.Date("2024-06-02")

	replaced, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		created.JSON201.TransactionId,
		httpclient.UpdateTransactionRequest(replacement),
	)
	requireNoTransportError(t, "replace transaction for class filter", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace transaction for class filter status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	assertTransactionClass(t, "replaced", *replaced.JSON200, httpclient.TransactionClassIncome)

	oldClass, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		TransactionClass: ptrTo([]httpclient.TransactionClass{httpclient.TransactionClassSpend}),
	})
	requireNoTransportError(t, "list old class after replacement", err)
	assertTransactionListResponse(t, "old class after replacement", oldClass, nil, 0)

	activeClass, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		TransactionClass: ptrTo([]httpclient.TransactionClass{httpclient.TransactionClassIncome}),
	})
	requireNoTransportError(t, "list active class after replacement", err)
	assertTransactionListResponse(t, "active class after replacement", activeClass, []int64{replaced.JSON200.TransactionId}, 1)
}

func TestTransactionDisplayTitleMemoFallbackBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), mixedMemoClassificationRequest(fixture))
	requireNoTransportError(t, "create mixed memo transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertTransactionClass(t, "created", *created.JSON201, httpclient.TransactionClassMixed)
	assertTransactionDisplayTitle(t, "created", *created.JSON201, "Mixed payroll correction")

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "read mixed memo transaction", err)
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	assertTransactionDisplayTitle(t, "read", *read.JSON200, "Mixed payroll correction")

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "list mixed memo transactions", err)
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 1 {
		t.Fatalf("list count = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
	assertTransactionDisplayTitle(t, "listed", list.JSON200.Transactions[0], "Mixed payroll correction")
}

func TestTransactionDisplayTitleUsesAccountIdentityForUniquenessBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	fixture := newClassificationFixture(t, client)
	jointA := scenario.AccountWithCurrency("banks:Chase:Joint", "USD")
	jointB := scenario.AccountWithCurrency("banks:Ally:Joint", "USD")

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), classificationRequest(
		record(jointA.AccountId, fixture.expenseCategory.CategoryId, "USD", "-7.00"),
		record(jointB.AccountId, fixture.expenseCategory.CategoryId, "USD", "-5.00"),
		record(fixture.merchant.AccountId, fixture.expenseCategory.CategoryId, "USD", "12.00"),
	))
	requireNoTransportError(t, "create duplicate leaf transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertTransactionClass(t, "created", *created.JSON201, httpclient.TransactionClassSpend)
	assertTransactionDisplayTitle(t, "created", *created.JSON201, "Local")
}

func TestTransactionClassificationDisplayAmountsBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), spendClassificationRequest(fixture))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertSpendDisplayAmounts(t, "created", *created.JSON201)

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "read transaction", err)
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	assertSpendDisplayAmounts(t, "read", *read.JSON200)

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "list transactions", err)
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 1 {
		t.Fatalf("list count = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
	assertSpendDisplayAmounts(t, "listed", list.JSON200.Transactions[0])
}

func TestTransactionMultiComponentDisplayAmountsBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), exchangeWithFeeAndFXClassificationRequest(fixture))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertExchangeWithFeeAndFXDisplayAmounts(t, "created", *created.JSON201)

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "read transaction", err)
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	assertExchangeWithFeeAndFXDisplayAmounts(t, "read", *read.JSON200)

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "list transactions", err)
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 1 {
		t.Fatalf("list count = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
	assertExchangeWithFeeAndFXDisplayAmounts(t, "listed", list.JSON200.Transactions[0])
}

func TestTransactionSemanticShapeValidationBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)

	invalidCreate, err := client.REST().CreateTransactionWithResponse(context.Background(), invalidExpenseShapeRequest(fixture))
	requireNoTransportError(t, "create invalid transaction", err)
	if invalidCreate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid create status = %d, want %d; body %s", invalidCreate.StatusCode(), http.StatusBadRequest, invalidCreate.Body)
	}
	if invalidCreate.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid create code = %q, want %q", invalidCreate.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), spendClassificationRequest(fixture))
	requireNoTransportError(t, "create valid transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create valid status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	replace, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, httpclient.UpdateTransactionRequest(invalidExpenseShapeRequest(fixture)))
	requireNoTransportError(t, "replace invalid transaction", err)
	if replace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid replace status = %d, want %d; body %s", replace.StatusCode(), http.StatusBadRequest, replace.Body)
	}
	afterRejectedReplace, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "read after rejected replace", err)
	if afterRejectedReplace.StatusCode() != http.StatusOK {
		t.Fatalf("read after rejected replace status = %d, want %d; body %s", afterRejectedReplace.StatusCode(), http.StatusOK, afterRejectedReplace.Body)
	}
	assertTransactionClass(t, "after rejected replace", *afterRejectedReplace.JSON200, httpclient.TransactionClassSpend)
	assertRecordIDs(t, afterRejectedReplace.JSON200.Records, recordIDs(created.JSON201.Records))

	invalidExchange, err := client.REST().CreateTransactionWithResponse(context.Background(), invalidExchangeShapeRequest(fixture))
	requireNoTransportError(t, "create invalid exchange transaction", err)
	if invalidExchange.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid exchange status = %d, want %d; body %s", invalidExchange.StatusCode(), http.StatusBadRequest, invalidExchange.Body)
	}
}

func TestTransactionReplaceReclassifiesBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), spendClassificationRequest(fixture))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	replaced, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, httpclient.UpdateTransactionRequest(incomeClassificationRequest(fixture)))
	requireNoTransportError(t, "replace transaction", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	if replaced.JSON200.TransactionId != created.JSON201.TransactionId {
		t.Fatalf("replace transaction_id = %d, want %d", replaced.JSON200.TransactionId, created.JSON201.TransactionId)
	}
	assertTransactionClass(t, "replaced", *replaced.JSON200, httpclient.TransactionClassIncome)
	assertTransactionDisplayTitle(t, "replaced", *replaced.JSON200, "Employer → Checking")
	assertIncomeDisplayAmounts(t, "replaced", *replaced.JSON200)
}

func TestBulkSemanticValidationRejectsBreakingUpdatesBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), spendClassificationRequest(fixture))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	fundingRecordID := created.JSON201.Records[0].RecordId
	counterpartyRecordID := created.JSON201.Records[1].RecordId

	badCategory, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds:  []int64{counterpartyRecordID},
		CategoryId: fixture.transferCategory.CategoryId,
	})
	requireNoTransportError(t, "bulk category", err)
	if badCategory.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bulk category status = %d, want %d; body %s", badCategory.StatusCode(), http.StatusBadRequest, badCategory.Body)
	}

	badAccount, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{counterpartyRecordID},
		AccountId: fixture.savings.AccountId,
	})
	requireNoTransportError(t, "bulk account", err)
	if badAccount.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bulk account status = %d, want %d; body %s", badAccount.StatusCode(), http.StatusBadRequest, badAccount.Body)
	}

	records, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{CategoryId: &fixture.expenseCategory.CategoryId})
	requireNoTransportError(t, "search original category", err)
	if records.StatusCode() != http.StatusOK {
		t.Fatalf("search status = %d, want %d; body %s", records.StatusCode(), http.StatusOK, records.Body)
	}
	assertRecordIDs(t, records.JSON200.Records, []int64{fundingRecordID, counterpartyRecordID})

	savingsRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{AccountId: &fixture.savings.AccountId})
	requireNoTransportError(t, "search rejected account", err)
	if savingsRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search rejected account status = %d, want %d; body %s", savingsRecords.StatusCode(), http.StatusOK, savingsRecords.Body)
	}
	assertRecordIDs(t, savingsRecords.JSON200.Records, nil)
}

func TestBulkSemanticValidationRejectsAllAffectedTransactionsBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)

	first, err := client.REST().CreateTransactionWithResponse(context.Background(), spendClassificationRequest(fixture))
	requireNoTransportError(t, "create first transaction", err)
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("create first status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}
	second, err := client.REST().CreateTransactionWithResponse(context.Background(), spendClassificationRequest(fixture))
	requireNoTransportError(t, "create second transaction", err)
	if second.StatusCode() != http.StatusCreated {
		t.Fatalf("create second status = %d, want %d; body %s", second.StatusCode(), http.StatusCreated, second.Body)
	}

	rejected, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{
		RecordIds: []int64{
			first.JSON201.Records[0].RecordId,
			first.JSON201.Records[1].RecordId,
			second.JSON201.Records[1].RecordId,
		},
		CategoryId: fixture.feeCategory.CategoryId,
	})
	requireNoTransportError(t, "bulk category across transactions", err)
	if rejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bulk category status = %d, want %d; body %s", rejected.StatusCode(), http.StatusBadRequest, rejected.Body)
	}

	feeRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{CategoryId: &fixture.feeCategory.CategoryId})
	requireNoTransportError(t, "search rejected fee category", err)
	if feeRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search fee status = %d, want %d; body %s", feeRecords.StatusCode(), http.StatusOK, feeRecords.Body)
	}
	assertRecordIDs(t, feeRecords.JSON200.Records, nil)

	expenseRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{CategoryId: &fixture.expenseCategory.CategoryId})
	requireNoTransportError(t, "search original expense category", err)
	if expenseRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search expense status = %d, want %d; body %s", expenseRecords.StatusCode(), http.StatusOK, expenseRecords.Body)
	}
	wantExpenseRecords := append(recordIDs(first.JSON201.Records), recordIDs(second.JSON201.Records)...)
	assertRecordIDs(t, expenseRecords.JSON200.Records, wantExpenseRecords)
}

type classificationFixture struct {
	checking           httpclient.Account
	savings            httpclient.Account
	cashEUR            httpclient.Account
	merchant           httpclient.Account
	employer           httpclient.Account
	exchangeProvider   httpclient.Account
	feeProvider        httpclient.Account
	openingSystem      httpclient.Account
	fxSystem           httpclient.Account
	expenseCategory    httpclient.Category
	feeCategory        httpclient.Category
	incomeCategory     httpclient.Category
	refundCategory     httpclient.Category
	transferCategory   httpclient.Category
	exchangeCategory   httpclient.Category
	adjustmentCategory httpclient.Category
	fxCategory         httpclient.Category
}

func newClassificationFixture(t *testing.T, client *apptest.Client) *classificationFixture {
	t.Helper()
	scenario := client.Scenario()

	return &classificationFixture{
		checking:           scenario.AccountWithCurrency("banks:Checking", "USD"),
		savings:            scenario.AccountWithCurrency("banks:Savings", "USD"),
		cashEUR:            scenario.AccountWithCurrency("cash:Travel:EUR", "EUR"),
		merchant:           scenario.Account("merchant:Local"),
		employer:           scenario.Account("income:Employer"),
		exchangeProvider:   scenario.Account("merchant:ExchangeProvider"),
		feeProvider:        scenario.Account("bank:Fees"),
		openingSystem:      scenario.AccountWithType("system:opening_balance", httpclient.System),
		fxSystem:           scenario.AccountWithType("system:fx_gain_loss", httpclient.System),
		expenseCategory:    scenario.CategoryWithIntent("Food:Restaurants", httpclient.CategoryEconomicIntentExpense),
		feeCategory:        scenario.CategoryWithIntent("Bank:Fees", httpclient.CategoryEconomicIntentFee),
		incomeCategory:     scenario.CategoryWithIntent("Income:Salary", httpclient.CategoryEconomicIntentIncome),
		refundCategory:     scenario.CategoryWithIntent("Refunds:Merchants", httpclient.CategoryEconomicIntentRefund),
		transferCategory:   scenario.CategoryWithIntent("Transfer", httpclient.CategoryEconomicIntentTransfer),
		exchangeCategory:   scenario.CategoryWithIntent("Currency:Exchange", httpclient.CategoryEconomicIntentExchange),
		adjustmentCategory: scenario.CategoryWithIntent("Adjustment:Opening", httpclient.CategoryEconomicIntentAdjustment),
		fxCategory:         scenario.CategoryWithIntent("FX:GainLoss", httpclient.CategoryEconomicIntentFxGainLoss),
	}
}

func spendClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(record(f.checking.AccountId, f.expenseCategory.CategoryId, "USD", "-12.34"), record(f.merchant.AccountId, f.expenseCategory.CategoryId, "USD", "12.34"))
}

func crossCurrencySpendClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(
		record(f.checking.AccountId, f.exchangeCategory.CategoryId, "USD", "-110.00"),
		record(f.exchangeProvider.AccountId, f.exchangeCategory.CategoryId, "USD", "110.00"),
		record(f.exchangeProvider.AccountId, f.exchangeCategory.CategoryId, "EUR", "-100.00"),
		record(f.cashEUR.AccountId, f.exchangeCategory.CategoryId, "EUR", "100.00"),
		record(f.cashEUR.AccountId, f.expenseCategory.CategoryId, "EUR", "-100.00"),
		record(f.merchant.AccountId, f.expenseCategory.CategoryId, "EUR", "100.00"),
	)
}

func incomeClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(record(f.checking.AccountId, f.incomeCategory.CategoryId, "USD", "100.00"), record(f.employer.AccountId, f.incomeCategory.CategoryId, "USD", "-100.00"))
}

func refundClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(record(f.checking.AccountId, f.refundCategory.CategoryId, "USD", "8.00"), record(f.merchant.AccountId, f.refundCategory.CategoryId, "USD", "-8.00"))
}

func transferClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(record(f.checking.AccountId, f.transferCategory.CategoryId, "USD", "-25.00"), record(f.savings.AccountId, f.transferCategory.CategoryId, "USD", "25.00"))
}

func feeClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(record(f.checking.AccountId, f.feeCategory.CategoryId, "USD", "-5.00"), record(f.feeProvider.AccountId, f.feeCategory.CategoryId, "USD", "5.00"))
}

func transferWithFeeClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	memo := "Transfer with bank fee"
	return classificationRequest(
		recordWithMemo(f.checking.AccountId, f.transferCategory.CategoryId, "USD", "-25.00", memo),
		recordWithMemo(f.savings.AccountId, f.transferCategory.CategoryId, "USD", "25.00", memo),
		recordWithMemo(f.checking.AccountId, f.feeCategory.CategoryId, "USD", "-1.00", memo),
		recordWithMemo(f.feeProvider.AccountId, f.feeCategory.CategoryId, "USD", "1.00", memo),
	)
}

func exchangeClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(
		record(f.checking.AccountId, f.exchangeCategory.CategoryId, "USD", "-110.00"),
		record(f.exchangeProvider.AccountId, f.exchangeCategory.CategoryId, "USD", "110.00"),
		record(f.exchangeProvider.AccountId, f.exchangeCategory.CategoryId, "EUR", "-100.00"),
		record(f.cashEUR.AccountId, f.exchangeCategory.CategoryId, "EUR", "100.00"),
	)
}

func exchangeWithFeeAndFXClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(
		record(f.checking.AccountId, f.exchangeCategory.CategoryId, "USD", "-110.00"),
		record(f.exchangeProvider.AccountId, f.exchangeCategory.CategoryId, "USD", "110.00"),
		record(f.exchangeProvider.AccountId, f.exchangeCategory.CategoryId, "EUR", "-100.00"),
		record(f.cashEUR.AccountId, f.exchangeCategory.CategoryId, "EUR", "100.00"),
		record(f.checking.AccountId, f.feeCategory.CategoryId, "USD", "-2.00"),
		record(f.feeProvider.AccountId, f.feeCategory.CategoryId, "USD", "2.00"),
		record(f.checking.AccountId, f.fxCategory.CategoryId, "USD", "3.00"),
		record(f.fxSystem.AccountId, f.fxCategory.CategoryId, "USD", "-3.00"),
	)
}

func adjustmentClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(record(f.checking.AccountId, f.adjustmentCategory.CategoryId, "USD", "40.00"), record(f.openingSystem.AccountId, f.adjustmentCategory.CategoryId, "USD", "-40.00"))
}

func fxGainLossClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(record(f.checking.AccountId, f.fxCategory.CategoryId, "USD", "3.00"), record(f.fxSystem.AccountId, f.fxCategory.CategoryId, "USD", "-3.00"))
}

func mixedClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(
		record(f.checking.AccountId, f.expenseCategory.CategoryId, "USD", "-12.00"),
		record(f.merchant.AccountId, f.expenseCategory.CategoryId, "USD", "12.00"),
		record(f.checking.AccountId, f.incomeCategory.CategoryId, "USD", "100.00"),
		record(f.employer.AccountId, f.incomeCategory.CategoryId, "USD", "-100.00"),
	)
}

func mixedMemoClassificationRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	memo := "Mixed payroll correction"
	return classificationRequest(
		recordWithMemo(f.checking.AccountId, f.expenseCategory.CategoryId, "USD", "-12.00", memo),
		recordWithMemo(f.merchant.AccountId, f.expenseCategory.CategoryId, "USD", "12.00", memo),
		recordWithMemo(f.checking.AccountId, f.incomeCategory.CategoryId, "USD", "100.00", memo),
		recordWithMemo(f.employer.AccountId, f.incomeCategory.CategoryId, "USD", "-100.00", memo),
	)
}

func invalidExpenseShapeRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(record(f.checking.AccountId, f.expenseCategory.CategoryId, "USD", "-10.00"), record(f.savings.AccountId, f.expenseCategory.CategoryId, "USD", "10.00"))
}

func invalidExchangeShapeRequest(f *classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(
		record(f.checking.AccountId, f.exchangeCategory.CategoryId, "USD", "-10.00"),
		record(f.savings.AccountId, f.exchangeCategory.CategoryId, "USD", "10.00"),
		record(f.exchangeProvider.AccountId, f.exchangeCategory.CategoryId, "EUR", "-9.00"),
		record(f.exchangeProvider.AccountId, f.exchangeCategory.CategoryId, "EUR", "9.00"),
	)
}

func classificationRequest(records ...httpclient.CreateJournalRecordRequest) httpclient.CreateTransactionRequest {
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-06-01"),
		Records:       records,
	}
}

func createDatedClassificationTransaction(t *testing.T, client *apptest.Client, date string, request httpclient.CreateTransactionRequest) *httpclient.CreateTransactionResponse {
	t.Helper()

	request.InitiatedDate = apptest.Date(date)
	created, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	requireNoTransportError(t, "create dated classification transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create dated classification transaction status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	return created
}

func record(accountID int64, categoryID int64, currency string, amount string) httpclient.CreateJournalRecordRequest {
	return httpclient.CreateJournalRecordRequest{
		AccountId:            accountID,
		CategoryId:           categoryID,
		Currency:             currency,
		Amount:               amount,
		AmountUsd:            nil,
		PostingStatus:        httpclient.Posted,
		ReconciliationStatus: httpclient.Reconciled,
		Source:               httpclient.Manual,
	}
}

func recordWithMemo(accountID int64, categoryID int64, currency string, amount string, memo string) httpclient.CreateJournalRecordRequest {
	record := record(accountID, categoryID, currency, amount)
	record.Memo = &memo
	return record
}

func assertTransactionClass(t *testing.T, label string, transaction httpclient.Transaction, want httpclient.TransactionClass) {
	t.Helper()
	if transaction.TransactionClass != want {
		t.Fatalf("%s transaction_class = %q, want %q; transaction %+v", label, transaction.TransactionClass, want, transaction)
	}
	if transaction.Components == nil {
		t.Fatalf("%s components = nil, want array", label)
	}
	if transaction.PrimaryAmounts == nil {
		t.Fatalf("%s primary_amounts = nil, want array", label)
	}
}

func assertTransactionDisplayTitle(t *testing.T, label string, transaction httpclient.Transaction, want string) {
	t.Helper()
	if transaction.DisplayTitle != want {
		t.Fatalf("%s display_title = %q, want %q; transaction %+v", label, transaction.DisplayTitle, want, transaction)
	}
}

func assertSpendDisplayAmounts(t *testing.T, label string, transaction httpclient.Transaction) {
	t.Helper()
	assertDisplayAmounts(t, label+" primary_amounts", transaction.PrimaryAmounts, []httpclient.DisplayAmount{{Currency: "USD", Amount: "-12.34000000"}})
	if len(transaction.Components) != 1 {
		t.Fatalf("%s components count = %d, want 1; transaction %+v", label, len(transaction.Components), transaction)
	}
	component := transaction.Components[0]
	if component.Intent != httpclient.CategoryEconomicIntentExpense {
		t.Fatalf("%s component intent = %q, want %q", label, component.Intent, httpclient.CategoryEconomicIntentExpense)
	}
	assertDisplayAmounts(t, label+" expense component amounts", component.Amounts, []httpclient.DisplayAmount{{Currency: "USD", Amount: "-12.34000000"}})
}

func assertIncomeDisplayAmounts(t *testing.T, label string, transaction httpclient.Transaction) {
	t.Helper()
	assertDisplayAmounts(t, label+" primary_amounts", transaction.PrimaryAmounts, []httpclient.DisplayAmount{{Currency: "USD", Amount: "100.00000000"}})
	if len(transaction.Components) != 1 {
		t.Fatalf("%s components count = %d, want 1; transaction %+v", label, len(transaction.Components), transaction)
	}
	component := transaction.Components[0]
	if component.Intent != httpclient.CategoryEconomicIntentIncome {
		t.Fatalf("%s component intent = %q, want %q", label, component.Intent, httpclient.CategoryEconomicIntentIncome)
	}
	assertDisplayAmounts(t, label+" income component amounts", component.Amounts, []httpclient.DisplayAmount{{Currency: "USD", Amount: "100.00000000"}})
}

func assertExchangeWithFeeAndFXDisplayAmounts(t *testing.T, label string, transaction httpclient.Transaction) {
	t.Helper()
	assertDisplayAmounts(t, label+" primary_amounts", transaction.PrimaryAmounts, nil)
	if len(transaction.Components) != 3 {
		t.Fatalf("%s components count = %d, want 3; transaction %+v", label, len(transaction.Components), transaction)
	}

	fee := transaction.Components[0]
	if fee.Intent != httpclient.CategoryEconomicIntentFee {
		t.Fatalf("%s fee component intent = %q, want %q", label, fee.Intent, httpclient.CategoryEconomicIntentFee)
	}
	assertDisplayAmounts(t, label+" fee component amounts", fee.Amounts, []httpclient.DisplayAmount{{Currency: "USD", Amount: "-2.00000000"}})

	exchange := transaction.Components[1]
	if exchange.Intent != httpclient.CategoryEconomicIntentExchange {
		t.Fatalf("%s exchange component intent = %q, want %q", label, exchange.Intent, httpclient.CategoryEconomicIntentExchange)
	}
	assertDisplayAmounts(t, label+" exchange component amounts", exchange.Amounts, []httpclient.DisplayAmount{
		{Currency: "EUR", Amount: "100.00000000"},
		{Currency: "USD", Amount: "-110.00000000"},
	})

	fx := transaction.Components[2]
	if fx.Intent != httpclient.CategoryEconomicIntentFxGainLoss {
		t.Fatalf("%s fx component intent = %q, want %q", label, fx.Intent, httpclient.CategoryEconomicIntentFxGainLoss)
	}
	assertDisplayAmounts(t, label+" fx component amounts", fx.Amounts, []httpclient.DisplayAmount{{Currency: "USD", Amount: "3.00000000"}})
}

func assertDisplayAmounts(t *testing.T, label string, got []httpclient.DisplayAmount, want []httpclient.DisplayAmount) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s count = %d, want %d; amounts %+v", label, len(got), len(want), got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("%s[%d] = %+v, want %+v", label, index, got[index], want[index])
		}
	}
}
