package runtime_test

import (
	"bytes"
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionCreateReadListBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	if created.JSON201.InitiatedDate.String() != "2024-03-10" {
		t.Fatalf("initiated_date = %q, want 2024-03-10", created.JSON201.InitiatedDate)
	}
	if len(created.JSON201.Records) != 2 {
		t.Fatalf("created record count = %d, want 2; body %+v", len(created.JSON201.Records), created.JSON201)
	}
	if created.JSON201.Records[0].AccountId != refs.CheckingAccountId || created.JSON201.Records[1].AccountId != refs.MerchantAccountId {
		t.Fatalf("created account ids = %d/%d, want %d/%d", created.JSON201.Records[0].AccountId, created.JSON201.Records[1].AccountId, refs.CheckingAccountId, refs.MerchantAccountId)
	}
	if created.JSON201.Records[0].MemberId == nil || *created.JSON201.Records[0].MemberId != refs.MemberId {
		t.Fatalf("member_id = %v, want %d", created.JSON201.Records[0].MemberId, refs.MemberId)
	}
	assertInt64s(t, created.JSON201.Records[0].TagIds, []int64{refs.TagId})

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.TransactionId != created.JSON201.TransactionId {
		t.Fatalf("read transaction id = %d, want %d", read.JSON200.TransactionId, created.JSON201.TransactionId)
	}
	if len(read.JSON200.Records) != 2 {
		t.Fatalf("read record count = %d, want 2; body %+v", len(read.JSON200.Records), read.JSON200)
	}
	if read.JSON200.Records[0].Memo == nil || *read.JSON200.Records[0].Memo != "Lunch" {
		t.Fatalf("read memo = %v, want Lunch", read.JSON200.Records[0].Memo)
	}

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 1 {
		t.Fatalf("transaction count = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
	if list.JSON200.Transactions[0].TransactionId != created.JSON201.TransactionId || len(list.JSON200.Transactions[0].Records) != 2 {
		t.Fatalf("listed transaction = %+v, want id %d with 2 records", list.JSON200.Transactions[0], created.JSON201.TransactionId)
	}
}

func TestTransactionListPaginationBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	third := createTransactionForDate(t, client, refs, "2024-01-03", "Third")
	first := createTransactionForDate(t, client, refs, "2024-01-01", "First")
	second := createTransactionForDate(t, client, refs, "2024-01-02", "Second")

	defaultList, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default list request: %v", err)
	}
	if defaultList.StatusCode() != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode(), http.StatusOK, defaultList.Body)
	}
	assertTransactionIDs(t, defaultList.JSON200.Transactions, []int64{first.JSON201.TransactionId, second.JSON201.TransactionId, third.JSON201.TransactionId})

	limitOne := 1
	limitPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Limit: &limitOne})
	if err != nil {
		t.Fatalf("limit page request: %v", err)
	}
	if limitPage.StatusCode() != http.StatusOK {
		t.Fatalf("limit page status = %d, want %d; body %s", limitPage.StatusCode(), http.StatusOK, limitPage.Body)
	}
	assertTransactionIDs(t, limitPage.JSON200.Transactions, []int64{first.JSON201.TransactionId})

	offsetOne := 1
	offsetPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Offset: &offsetOne})
	if err != nil {
		t.Fatalf("offset page request: %v", err)
	}
	if offsetPage.StatusCode() != http.StatusOK {
		t.Fatalf("offset page status = %d, want %d; body %s", offsetPage.StatusCode(), http.StatusOK, offsetPage.Body)
	}
	assertTransactionIDs(t, offsetPage.JSON200.Transactions, []int64{second.JSON201.TransactionId, third.JSON201.TransactionId})

	window, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Limit:  &limitOne,
		Offset: &offsetOne,
	})
	if err != nil {
		t.Fatalf("window request: %v", err)
	}
	if window.StatusCode() != http.StatusOK {
		t.Fatalf("window status = %d, want %d; body %s", window.StatusCode(), http.StatusOK, window.Body)
	}
	assertTransactionIDs(t, window.JSON200.Transactions, []int64{second.JSON201.TransactionId})
	if len(window.JSON200.Transactions[0].Records) != 2 {
		t.Fatalf("window nested record count = %d, want 2; body %+v", len(window.JSON200.Transactions[0].Records), window.JSON200.Transactions[0])
	}

	assertInvalidTransactionListQuery(t, client, "limit=0")
	assertInvalidTransactionListQuery(t, client, "limit=501")
	assertInvalidTransactionListQuery(t, client, "offset=-1")
}

func TestTransactionRecordFieldsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	record := created.JSON201.Records[0]
	if record.PostingStatus != httpclient.Posted {
		t.Fatalf("posting_status = %q, want %q", record.PostingStatus, httpclient.Posted)
	}
	if record.ReconciliationStatus != httpclient.Reconciled {
		t.Fatalf("reconciliation_status = %q, want %q", record.ReconciliationStatus, httpclient.Reconciled)
	}
	if record.Source != httpclient.Manual {
		t.Fatalf("source = %q, want %q", record.Source, httpclient.Manual)
	}
	if !record.PendingDate.Equal(apptest.Timestamp("2024-03-10T00:00:00Z")) {
		t.Fatalf("pending_date = %v, want 2024-03-10T00:00:00Z", record.PendingDate)
	}
	if record.PostedDate == nil || !record.PostedDate.Equal(apptest.Timestamp("2024-03-11T00:00:00Z")) {
		t.Fatalf("posted_date = %v, want 2024-03-11T00:00:00Z", record.PostedDate)
	}
	if record.Amount != "-12.34000000" || record.AmountUsd == nil || *record.AmountUsd != "-12.34000000" {
		t.Fatalf("amounts = %q/%v, want -12.34000000/-12.34000000", record.Amount, record.AmountUsd)
	}
	assertInt64s(t, record.TagIds, []int64{refs.TagId})
	if record.CreatedAt.IsZero() || record.UpdatedAt.IsZero() {
		t.Fatalf("timestamps = %q/%q, want populated created_at/updated_at", record.CreatedAt, record.UpdatedAt)
	}

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if len(read.JSON200.Records) != 2 {
		t.Fatalf("read record count = %d, want 2; body %+v", len(read.JSON200.Records), read.JSON200)
	}
	readRecord := read.JSON200.Records[0]
	if readRecord.RecordId != record.RecordId {
		t.Fatalf("read record id = %d, want %d", readRecord.RecordId, record.RecordId)
	}
	if readRecord.PostingStatus != httpclient.Posted {
		t.Fatalf("read posting_status = %q, want %q", readRecord.PostingStatus, httpclient.Posted)
	}
	if readRecord.ReconciliationStatus != httpclient.Reconciled {
		t.Fatalf("read reconciliation_status = %q, want %q", readRecord.ReconciliationStatus, httpclient.Reconciled)
	}
	if readRecord.Source != httpclient.Manual {
		t.Fatalf("read source = %q, want %q", readRecord.Source, httpclient.Manual)
	}
	if !readRecord.PendingDate.Equal(apptest.Timestamp("2024-03-10T00:00:00Z")) {
		t.Fatalf("read pending_date = %v, want 2024-03-10T00:00:00Z", readRecord.PendingDate)
	}
	if readRecord.PostedDate == nil || !readRecord.PostedDate.Equal(apptest.Timestamp("2024-03-11T00:00:00Z")) {
		t.Fatalf("read posted_date = %v, want 2024-03-11T00:00:00Z", readRecord.PostedDate)
	}
	if readRecord.Amount != "-12.34000000" || readRecord.AmountUsd == nil || *readRecord.AmountUsd != "-12.34000000" {
		t.Fatalf("read amounts = %q/%v, want -12.34000000/-12.34000000", readRecord.Amount, readRecord.AmountUsd)
	}
	assertInt64s(t, readRecord.TagIds, []int64{refs.TagId})
	if readRecord.CreatedAt != record.CreatedAt || readRecord.UpdatedAt != record.UpdatedAt {
		t.Fatalf("read timestamps = %q/%q, want %q/%q", readRecord.CreatedAt, readRecord.UpdatedAt, record.CreatedAt, record.UpdatedAt)
	}
}

func TestTransactionTimestampsNormalizeOffsetInputBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	memo := "Offset lunch"
	pendingDate := parseTimestamp(t, "2024-03-10T00:30:00-05:00")
	postedDate := parseTimestamp(t, "2024-03-11T00:30:00-04:00")
	wantPendingDate := apptest.Timestamp("2024-03-10T05:30:00Z")
	wantPostedDate := apptest.Timestamp("2024-03-11T04:30:00Z")
	wantPendingJSON := `"pending_date":"2024-03-10T05:30:00Z"`
	wantPostedJSON := `"posted_date":"2024-03-11T04:30:00Z"`
	req := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				MemberId:             &refs.MemberId,
				Currency:             "USD",
				Amount:               "-12.34",
				AmountUsd:            apptest.StringPtr("-12.34"),
				CategoryId:           refs.CategoryId,
				TagIds:               apptest.Int64SlicePtr(refs.TagId),
				Memo:                 &memo,
				PendingDate:          &pendingDate,
				PostedDate:           &postedDate,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "12.34",
				AmountUsd:            apptest.StringPtr("12.34"),
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	}

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), req)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertRecordTimestamps(t, "created", created.JSON201.Records[0], wantPendingDate, wantPostedDate)
	assertBodyContains(t, "created", created.Body, wantPendingJSON)
	assertBodyContains(t, "created", created.Body, wantPostedJSON)

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	assertRecordTimestamps(t, "read", read.JSON200.Records[0], wantPendingDate, wantPostedDate)
	assertBodyContains(t, "read", read.Body, wantPendingJSON)
	assertBodyContains(t, "read", read.Body, wantPostedJSON)

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 1 {
		t.Fatalf("transaction count = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
	assertRecordTimestamps(t, "list", list.JSON200.Transactions[0].Records[0], wantPendingDate, wantPostedDate)
	assertBodyContains(t, "list", list.Body, wantPendingJSON)
	assertBodyContains(t, "list", list.Body, wantPostedJSON)

	search, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		PendingDateFrom: &pendingDate,
		PendingDateTo:   &pendingDate,
		PostedDateFrom:  &postedDate,
		PostedDateTo:    &postedDate,
	})
	if err != nil {
		t.Fatalf("search request: %v", err)
	}
	if search.StatusCode() != http.StatusOK {
		t.Fatalf("search status = %d, want %d; body %s", search.StatusCode(), http.StatusOK, search.Body)
	}
	assertRecordIDs(t, search.JSON200.Records, []int64{created.JSON201.Records[0].RecordId})
	assertRecordTimestamps(t, "search", search.JSON200.Records[0], wantPendingDate, wantPostedDate)
	assertBodyContains(t, "search", search.Body, wantPendingJSON)
	assertBodyContains(t, "search", search.Body, wantPostedJSON)
}

func TestTransactionAllowsNullAndUnbalancedAmountUSD(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	req := balancedTransactionRequest(refs)
	req.Records[0].Currency = "C::ETHEREUM-LONG-TOKEN"
	req.Records[1].Currency = "C::ETHEREUM-LONG-TOKEN"
	req.Records[0].AmountUsd = nil
	req.Records[1].AmountUsd = apptest.StringPtr("11.00")

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), req)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	if created.JSON201.Records[0].AmountUsd != nil {
		t.Fatalf("first amount_usd = %v, want nil", created.JSON201.Records[0].AmountUsd)
	}
	if created.JSON201.Records[1].AmountUsd == nil || *created.JSON201.Records[1].AmountUsd != "11.00000000" {
		t.Fatalf("second amount_usd = %v, want 11.00000000", created.JSON201.Records[1].AmountUsd)
	}

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 1 {
		t.Fatalf("transaction count after create = %d, want 1; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
}

func TestTransactionCreateInfersMissingAmountUSD(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	usdRequest := balancedTransactionRequest(refs)
	usdRequest.Records[0].AmountUsd = nil
	usdRequest.Records[1].AmountUsd = nil
	usd, err := client.REST().CreateTransactionWithResponse(context.Background(), usdRequest)
	if err != nil {
		t.Fatalf("USD create request: %v", err)
	}
	if usd.StatusCode() != http.StatusCreated {
		t.Fatalf("USD create status = %d, want %d; body %s", usd.StatusCode(), http.StatusCreated, usd.Body)
	}
	assertRecordAmountUSD(t, *usd.JSON201, refs.CheckingAccountId, "-12.34000000")
	assertRecordAmountUSD(t, *usd.JSON201, refs.MerchantAccountId, "12.34000000")

	createExchangeRate(t, client, "USD", "EUR", "1.10000000", "2024-03-10T00:00:00Z")
	eurCash := client.Scenario().AccountWithCurrency("cash:Transaction:EUR", "EUR")
	eurMerchant := client.Scenario().Account("merchant:Transaction:EuroCoffee")
	eurRequest := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            eurCash.AccountId,
				Currency:             "EUR",
				Amount:               "-11.00",
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            eurMerchant.AccountId,
				Currency:             "EUR",
				Amount:               "11.00",
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	}
	eur, err := client.REST().CreateTransactionWithResponse(context.Background(), eurRequest)
	if err != nil {
		t.Fatalf("EUR create request: %v", err)
	}
	if eur.StatusCode() != http.StatusCreated {
		t.Fatalf("EUR create status = %d, want %d; body %s", eur.StatusCode(), http.StatusCreated, eur.Body)
	}
	assertRecordAmountUSD(t, *eur.JSON201, eurCash.AccountId, "-10.00000000")
	assertRecordAmountUSD(t, *eur.JSON201, eurMerchant.AccountId, "10.00000000")

	explicitRequest := eurRequest
	explicitRequest.Records[0].AmountUsd = apptest.StringPtr("-99.00")
	explicit, err := client.REST().CreateTransactionWithResponse(context.Background(), explicitRequest)
	if err != nil {
		t.Fatalf("explicit amount_usd create request: %v", err)
	}
	if explicit.StatusCode() != http.StatusCreated {
		t.Fatalf("explicit amount_usd create status = %d, want %d; body %s", explicit.StatusCode(), http.StatusCreated, explicit.Body)
	}
	assertRecordAmountUSD(t, *explicit.JSON201, eurCash.AccountId, "-99.00000000")
	assertRecordAmountUSD(t, *explicit.JSON201, eurMerchant.AccountId, "10.00000000")
}

func TestTransactionLeavesUnrepresentableInferredAmountUSDNull(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	currency := "C::TINY-RATE"
	createExchangeRate(t, client, "USD", currency, "0.00000001", "2024-03-10T00:00:00Z")
	cash := client.Scenario().AccountWithCurrency("cash:Transaction:TinyRate", currency)
	counterparty := client.Scenario().Account("merchant:Transaction:TinyRate")

	request := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            cash.AccountId,
				Currency:             currency,
				Amount:               "-100.00",
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            counterparty.AccountId,
				Currency:             currency,
				Amount:               "100.00",
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	}

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create transaction request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertRecordAmountUSDNil(t, *created.JSON201, cash.AccountId)
	assertRecordAmountUSDNil(t, *created.JSON201, counterparty.AccountId)
}

func TestTransactionAcceptsCurrencyExchangeBalancedPerCurrency(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	scenario := client.Scenario()
	provider := scenario.Account("merchant:ExchangeProvider")
	cashEUR := scenario.AccountWithCurrency("cash:Travel:EUR", "EUR")
	exchangeCategory := scenario.CategoryWithIntent("Currency:Exchange", httpclient.CategoryEconomicIntentExchange)

	req := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				Currency:             "USD",
				Amount:               "-110.00",
				AmountUsd:            apptest.StringPtr("-110.00"),
				CategoryId:           exchangeCategory.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            provider.AccountId,
				Currency:             "USD",
				Amount:               "110.00",
				AmountUsd:            apptest.StringPtr("110.00"),
				CategoryId:           exchangeCategory.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            provider.AccountId,
				Currency:             "EUR",
				Amount:               "-100.00",
				AmountUsd:            apptest.StringPtr("-110.00"),
				CategoryId:           exchangeCategory.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            cashEUR.AccountId,
				Currency:             "EUR",
				Amount:               "100.00",
				AmountUsd:            nil,
				CategoryId:           exchangeCategory.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	}

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), req)
	if err != nil {
		t.Fatalf("exchange create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("exchange create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	if len(created.JSON201.Records) != 4 {
		t.Fatalf("exchange record count = %d, want 4; body %+v", len(created.JSON201.Records), created.JSON201)
	}
	if created.JSON201.TransactionClass != httpclient.TransactionClassCurrencyExchange {
		t.Fatalf("exchange class = %q, want %q", created.JSON201.TransactionClass, httpclient.TransactionClassCurrencyExchange)
	}
}

func TestTransactionRejectsPerCurrencyImbalanceAndDoesNotPersist(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	req := balancedTransactionRequest(refs)
	req.Records[1].Amount = "11.00"

	rejected, err := client.REST().CreateTransactionWithResponse(context.Background(), req)
	if err != nil {
		t.Fatalf("imbalance request: %v", err)
	}
	if rejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("imbalance status = %d, want %d; body %s", rejected.StatusCode(), http.StatusBadRequest, rejected.Body)
	}

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 0 {
		t.Fatalf("transaction count after rejected create = %d, want 0; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}
}

func TestTransactionValidationErrors(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	missingAccount := balancedTransactionRequest(refs)
	missingAccount.Records[0].AccountId = 999
	missingAccountResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), missingAccount)
	if err != nil {
		t.Fatalf("missing account request: %v", err)
	}
	if missingAccountResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing account status = %d, want %d; body %s", missingAccountResponse.StatusCode(), http.StatusBadRequest, missingAccountResponse.Body)
	}

	missingMember := balancedTransactionRequest(refs)
	*missingMember.Records[0].MemberId = 999
	missingMemberResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), missingMember)
	if err != nil {
		t.Fatalf("missing member request: %v", err)
	}
	if missingMemberResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing member status = %d, want %d; body %s", missingMemberResponse.StatusCode(), http.StatusBadRequest, missingMemberResponse.Body)
	}

	missingCategory := balancedTransactionRequest(refs)
	missingCategory.Records[0].CategoryId = 999
	missingCategoryResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), missingCategory)
	if err != nil {
		t.Fatalf("missing category request: %v", err)
	}
	if missingCategoryResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing category status = %d, want %d; body %s", missingCategoryResponse.StatusCode(), http.StatusBadRequest, missingCategoryResponse.Body)
	}

	missingTag := balancedTransactionRequest(refs)
	missingTag.Records[0].TagIds = apptest.Int64SlicePtr(999)
	missingTagResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), missingTag)
	if err != nil {
		t.Fatalf("missing tag request: %v", err)
	}
	if missingTagResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing tag status = %d, want %d; body %s", missingTagResponse.StatusCode(), http.StatusBadRequest, missingTagResponse.Body)
	}

	invalidStatus := balancedTransactionRequest(refs)
	invalidStatus.Records[0].PostingStatus = httpclient.PostingStatus("settled")
	invalidStatusResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), invalidStatus)
	if err != nil {
		t.Fatalf("invalid status request: %v", err)
	}
	if invalidStatusResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid status status = %d, want %d; body %s", invalidStatusResponse.StatusCode(), http.StatusBadRequest, invalidStatusResponse.Body)
	}

	invalidReconciliation := balancedTransactionRequest(refs)
	invalidReconciliation.Records[0].ReconciliationStatus = httpclient.ReconciliationStatus("matched")
	invalidReconciliationResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), invalidReconciliation)
	if err != nil {
		t.Fatalf("invalid reconciliation request: %v", err)
	}
	if invalidReconciliationResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid reconciliation status = %d, want %d; body %s", invalidReconciliationResponse.StatusCode(), http.StatusBadRequest, invalidReconciliationResponse.Body)
	}

	invalidSource := balancedTransactionRequest(refs)
	invalidSource.Records[0].Source = httpclient.Source("imported")
	invalidSourceResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), invalidSource)
	if err != nil {
		t.Fatalf("invalid source request: %v", err)
	}
	if invalidSourceResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid source status = %d, want %d; body %s", invalidSourceResponse.StatusCode(), http.StatusBadRequest, invalidSourceResponse.Body)
	}

	unknownCurrency := balancedTransactionRequest(refs)
	unknownCurrency.Records[0].Currency = "ZZZ"
	unknownCurrencyResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), unknownCurrency)
	if err != nil {
		t.Fatalf("unknown currency request: %v", err)
	}
	if unknownCurrencyResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unknown currency status = %d, want %d; body %s", unknownCurrencyResponse.StatusCode(), http.StatusBadRequest, unknownCurrencyResponse.Body)
	}

	invalidDate := balancedTransactionRequest(refs)
	invalidDateResponse, err := client.REST().CreateTransactionWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"initiated_date": "2024-02-30",
		"records":        invalidDate.Records,
	}))
	if err != nil {
		t.Fatalf("invalid date request: %v", err)
	}
	if invalidDateResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid date status = %d, want %d; body %s", invalidDateResponse.StatusCode(), http.StatusBadRequest, invalidDateResponse.Body)
	}

	tooManyIntegerDigits := balancedTransactionRequest(refs)
	tooManyIntegerDigits.Records[0].Amount = "-12345678901"
	tooManyIntegerDigitsResponse, err := client.REST().CreateTransactionWithResponse(context.Background(), tooManyIntegerDigits)
	if err != nil {
		t.Fatalf("too many integer digits request: %v", err)
	}
	if tooManyIntegerDigitsResponse.StatusCode() != http.StatusBadRequest {
		t.Fatalf("too many integer digits status = %d, want %d; body %s", tooManyIntegerDigitsResponse.StatusCode(), http.StatusBadRequest, tooManyIntegerDigitsResponse.Body)
	}

	pagedListQuery, err := client.REST().ListTransactionsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("limit=1"))
	if err != nil {
		t.Fatalf("paged list query request: %v", err)
	}
	if pagedListQuery.StatusCode() != http.StatusOK {
		t.Fatalf("paged list query status = %d, want %d; body %s", pagedListQuery.StatusCode(), http.StatusOK, pagedListQuery.Body)
	}
}

func TestTransactionRejectsTombstonedAccountAndCategoryReferences(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	tombstonedAccount := client.Scenario().Account("merchant:TombstonedTransactionReference")
	deleteAccount, err := client.REST().DeleteAccountWithResponse(context.Background(), tombstonedAccount.AccountId)
	if err != nil {
		t.Fatalf("delete account request: %v", err)
	}
	if deleteAccount.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete account status = %d, want %d; body %s", deleteAccount.StatusCode(), http.StatusNoContent, deleteAccount.Body)
	}

	tombstonedCategory := client.Scenario().Category("Food:TombstonedTransactionReference")
	deleteCategory, err := client.REST().DeleteCategoryWithResponse(context.Background(), tombstonedCategory.CategoryId)
	if err != nil {
		t.Fatalf("delete category request: %v", err)
	}
	if deleteCategory.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete category status = %d, want %d; body %s", deleteCategory.StatusCode(), http.StatusNoContent, deleteCategory.Body)
	}

	createWithTombstonedAccount := balancedTransactionRequest(refs)
	createWithTombstonedAccount.Records[1].AccountId = tombstonedAccount.AccountId
	rejectedCreateAccount, err := client.REST().CreateTransactionWithResponse(context.Background(), createWithTombstonedAccount)
	if err != nil {
		t.Fatalf("create with tombstoned account request: %v", err)
	}
	if rejectedCreateAccount.StatusCode() != http.StatusBadRequest {
		t.Fatalf("create with tombstoned account status = %d, want %d; body %s", rejectedCreateAccount.StatusCode(), http.StatusBadRequest, rejectedCreateAccount.Body)
	}

	createWithTombstonedCategory := balancedTransactionRequest(refs)
	createWithTombstonedCategory.Records[0].CategoryId = tombstonedCategory.CategoryId
	rejectedCreateCategory, err := client.REST().CreateTransactionWithResponse(context.Background(), createWithTombstonedCategory)
	if err != nil {
		t.Fatalf("create with tombstoned category request: %v", err)
	}
	if rejectedCreateCategory.StatusCode() != http.StatusBadRequest {
		t.Fatalf("create with tombstoned category status = %d, want %d; body %s", rejectedCreateCategory.StatusCode(), http.StatusBadRequest, rejectedCreateCategory.Body)
	}

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	if err != nil {
		t.Fatalf("create base transaction request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create base transaction status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	replaceWithTombstonedAccount := replacementTransactionRequest(refs)
	replaceWithTombstonedAccount.Records[1].AccountId = tombstonedAccount.AccountId
	rejectedReplaceAccount, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, replaceWithTombstonedAccount)
	if err != nil {
		t.Fatalf("replace with tombstoned account request: %v", err)
	}
	if rejectedReplaceAccount.StatusCode() != http.StatusBadRequest {
		t.Fatalf("replace with tombstoned account status = %d, want %d; body %s", rejectedReplaceAccount.StatusCode(), http.StatusBadRequest, rejectedReplaceAccount.Body)
	}

	replaceWithTombstonedCategory := replacementTransactionRequest(refs)
	replaceWithTombstonedCategory.Records[0].CategoryId = tombstonedCategory.CategoryId
	rejectedReplaceCategory, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, replaceWithTombstonedCategory)
	if err != nil {
		t.Fatalf("replace with tombstoned category request: %v", err)
	}
	if rejectedReplaceCategory.StatusCode() != http.StatusBadRequest {
		t.Fatalf("replace with tombstoned category status = %d, want %d; body %s", rejectedReplaceCategory.StatusCode(), http.StatusBadRequest, rejectedReplaceCategory.Body)
	}
}

func TestTransactionRejectsTombstonedMemberAndTagReferences(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	tombstonedMember := client.Scenario().Member("Tombstoned Transaction Member")
	deleteMember(t, client, tombstonedMember.MemberId)
	tombstonedTag := client.Scenario().Tag("References:TombstonedTransactionTag")
	deleteTag(t, client, tombstonedTag.TagId)

	createWithTombstonedMember := balancedTransactionRequest(refs)
	createWithTombstonedMember.Records[0].MemberId = &tombstonedMember.MemberId
	rejectedCreateMember, err := client.REST().CreateTransactionWithResponse(context.Background(), createWithTombstonedMember)
	if err != nil {
		t.Fatalf("create with tombstoned member request: %v", err)
	}
	if rejectedCreateMember.StatusCode() != http.StatusBadRequest {
		t.Fatalf("create with tombstoned member status = %d, want %d; body %s", rejectedCreateMember.StatusCode(), http.StatusBadRequest, rejectedCreateMember.Body)
	}

	createWithTombstonedTag := balancedTransactionRequest(refs)
	createWithTombstonedTag.Records[0].TagIds = apptest.Int64SlicePtr(tombstonedTag.TagId)
	rejectedCreateTag, err := client.REST().CreateTransactionWithResponse(context.Background(), createWithTombstonedTag)
	if err != nil {
		t.Fatalf("create with tombstoned tag request: %v", err)
	}
	if rejectedCreateTag.StatusCode() != http.StatusBadRequest {
		t.Fatalf("create with tombstoned tag status = %d, want %d; body %s", rejectedCreateTag.StatusCode(), http.StatusBadRequest, rejectedCreateTag.Body)
	}

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	if err != nil {
		t.Fatalf("create base transaction request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create base transaction status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	replaceWithTombstonedMember := replacementTransactionRequest(refs)
	replaceWithTombstonedMember.Records[0].MemberId = &tombstonedMember.MemberId
	rejectedReplaceMember, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, replaceWithTombstonedMember)
	if err != nil {
		t.Fatalf("replace with tombstoned member request: %v", err)
	}
	if rejectedReplaceMember.StatusCode() != http.StatusBadRequest {
		t.Fatalf("replace with tombstoned member status = %d, want %d; body %s", rejectedReplaceMember.StatusCode(), http.StatusBadRequest, rejectedReplaceMember.Body)
	}

	replaceWithTombstonedTag := replacementTransactionRequest(refs)
	replaceWithTombstonedTag.Records[0].TagIds = apptest.Int64SlicePtr(tombstonedTag.TagId)
	rejectedReplaceTag, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, replaceWithTombstonedTag)
	if err != nil {
		t.Fatalf("replace with tombstoned tag request: %v", err)
	}
	if rejectedReplaceTag.StatusCode() != http.StatusBadRequest {
		t.Fatalf("replace with tombstoned tag status = %d, want %d; body %s", rejectedReplaceTag.StatusCode(), http.StatusBadRequest, rejectedReplaceTag.Body)
	}
}

func TestTransactionAcceptsHiddenActiveReferences(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	hidden := true

	hiddenChecking, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:HiddenTransactionReference",
		AccountType: httpclient.Balance,
		Currency:    apptest.StringPtr("USD"),
		IsHidden:    &hidden,
	})
	if err != nil {
		t.Fatalf("create hidden checking account request: %v", err)
	}
	if hiddenChecking.StatusCode() != http.StatusCreated {
		t.Fatalf("create hidden checking account status = %d, want %d; body %s", hiddenChecking.StatusCode(), http.StatusCreated, hiddenChecking.Body)
	}
	hiddenMerchant, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "merchant:HiddenTransactionReference",
		AccountType: httpclient.Flow,
		IsHidden:    &hidden,
	})
	if err != nil {
		t.Fatalf("create hidden merchant account request: %v", err)
	}
	if hiddenMerchant.StatusCode() != http.StatusCreated {
		t.Fatalf("create hidden merchant account status = %d, want %d; body %s", hiddenMerchant.StatusCode(), http.StatusCreated, hiddenMerchant.Body)
	}
	hiddenCategory := client.Scenario().CategoryWithHidden("Food:HiddenTransactionReference", hidden)
	hiddenTagResponse, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      "References:HiddenTransactionTag",
		IsHidden: &hidden,
	})
	if err != nil {
		t.Fatalf("create hidden tag request: %v", err)
	}
	if hiddenTagResponse.StatusCode() != http.StatusCreated {
		t.Fatalf("create hidden tag status = %d, want %d; body %s", hiddenTagResponse.StatusCode(), http.StatusCreated, hiddenTagResponse.Body)
	}

	request := balancedTransactionRequest(refs)
	request.Records[0].AccountId = hiddenChecking.JSON201.AccountId
	request.Records[0].CategoryId = hiddenCategory.CategoryId
	request.Records[0].TagIds = apptest.Int64SlicePtr(hiddenTagResponse.JSON201.TagId)
	request.Records[1].AccountId = hiddenMerchant.JSON201.AccountId
	request.Records[1].CategoryId = hiddenCategory.CategoryId
	created, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create with hidden references request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create with hidden references status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertInt64s(t, created.JSON201.Records[0].TagIds, []int64{hiddenTagResponse.JSON201.TagId})

	replacement := replacementTransactionRequest(refs)
	replacement.Records[0].AccountId = hiddenChecking.JSON201.AccountId
	replacement.Records[0].CategoryId = hiddenCategory.CategoryId
	replacement.Records[0].TagIds = apptest.Int64SlicePtr(hiddenTagResponse.JSON201.TagId)
	replacement.Records[1].AccountId = hiddenMerchant.JSON201.AccountId
	replacement.Records[1].CategoryId = hiddenCategory.CategoryId
	replaced, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.JSON201.TransactionId, replacement)
	if err != nil {
		t.Fatalf("replace with hidden references request: %v", err)
	}
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace with hidden references status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	assertInt64s(t, replaced.JSON200.Records[0].TagIds, []int64{hiddenTagResponse.JSON201.TagId})
}

type transactionRefs struct {
	CheckingAccountId int64
	MerchantAccountId int64
	CategoryId        int64
	TagId             int64
	MemberId          int64
}

func createTransactionRefs(t *testing.T, client *apptest.Client) transactionRefs {
	t.Helper()

	refs := client.Scenario().TransactionRefs()

	return transactionRefs{
		CheckingAccountId: refs.CheckingAccountID,
		MerchantAccountId: refs.MerchantAccountID,
		CategoryId:        refs.CategoryID,
		TagId:             refs.TagID,
		MemberId:          refs.MemberID,
	}
}

func createTransactionForDate(t *testing.T, client *apptest.Client, refs transactionRefs, date string, memo string) *httpclient.CreateTransactionResponse {
	t.Helper()

	request := balancedTransactionRequest(refs)
	request.InitiatedDate = apptest.Date(date)
	request.Records[0].Memo = &memo
	response, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create transaction for %s request: %v", date, err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create transaction for %s status = %d, want %d; body %s", date, response.StatusCode(), http.StatusCreated, response.Body)
	}

	return response
}

func balancedTransactionRequest(refs transactionRefs) httpclient.CreateTransactionRequest {
	memo := "Lunch"
	pendingDate := apptest.Timestamp("2024-03-10T00:00:00Z")
	postedDate := apptest.Timestamp("2024-03-11T00:00:00Z")
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				MemberId:             &refs.MemberId,
				Currency:             "USD",
				Amount:               "-12.34",
				AmountUsd:            apptest.StringPtr("-12.34"),
				CategoryId:           refs.CategoryId,
				TagIds:               apptest.Int64SlicePtr(refs.TagId),
				Memo:                 &memo,
				PendingDate:          &pendingDate,
				PostedDate:           &postedDate,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "12.34",
				AmountUsd:            apptest.StringPtr("12.34"),
				CategoryId:           refs.CategoryId,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	}
}

func assertTransactionIDs(t *testing.T, transactions []httpclient.Transaction, want []int64) {
	t.Helper()

	got := make([]int64, 0, len(transactions))
	for _, transaction := range transactions {
		got = append(got, transaction.TransactionId)
	}
	assertInt64s(t, got, want)
}

func assertInvalidTransactionListQuery(t *testing.T, client *apptest.Client, rawQuery string) {
	t.Helper()

	response, err := client.REST().ListTransactionsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery(rawQuery))
	if err != nil {
		t.Fatalf("invalid transaction list query %q request: %v", rawQuery, err)
	}
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid transaction list query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusBadRequest, response.Body)
	}
	if response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid transaction list query %q code = %+v, want %q", rawQuery, response.JSON400, httpclient.APIErrorCodeInvalidRequest)
	}
}

func assertInt64s(t *testing.T, got []int64, want []int64) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("int64 slice length = %d, want %d; got %+v", len(got), len(want), got)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("int64 slice at %d = %d, want %d; got %+v", i, got[i], want[i], got)
		}
	}
}

func parseTimestamp(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse timestamp %q: %v", value, err)
	}

	return parsed
}

func assertRecordTimestamps(t *testing.T, label string, record httpclient.JournalRecord, wantPending time.Time, wantPosted time.Time) {
	t.Helper()

	if !record.PendingDate.Equal(wantPending) {
		t.Fatalf("%s pending_date = %v, want %s", label, record.PendingDate, wantPending.Format(time.RFC3339))
	}
	if record.PostedDate == nil || !record.PostedDate.Equal(wantPosted) {
		t.Fatalf("%s posted_date = %v, want %s", label, record.PostedDate, wantPosted.Format(time.RFC3339))
	}
}

func assertBodyContains(t *testing.T, label string, body []byte, want string) {
	t.Helper()

	if !bytes.Contains(body, []byte(want)) {
		t.Fatalf("%s body missing %s: %s", label, want, body)
	}
}
