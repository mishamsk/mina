package runtime_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

type dslFilterFixture struct {
	alpha     *httpclient.CreateTransactionResponse
	beta      *httpclient.CreateTransactionResponse
	multi     *httpclient.CreateTransactionResponse
	refund    *httpclient.CreateTransactionResponse
	scopeLeaf *httpclient.CreateTransactionResponse
}

func createDslFilterFixture(t *testing.T, client *apptest.Client) dslFilterFixture {
	t.Helper()

	refs := createSearchRefs(t, client)
	scenario := client.Scenario()
	flowA := scenario.Account("expense:DslFlowA")
	flowB := scenario.Account("expense:DslFlowB")
	groceriesCategory := scenario.Category("DslScope:Groceries")
	diningCategory := scenario.Category("DslScope:Dining")
	unrelatedCategory := scenario.Category("DslScope:Unrelated")

	alpha := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:        "2024-06-01",
		BalanceID:   refs.CheckingAccountId,
		FlowID:      refs.MerchantAccountId,
		CategoryID:  refs.CategoryId,
		TagID:       refs.TagId,
		MemberID:    &refs.MemberId,
		Memo:        "Alpha",
		Amount:      "10.00",
		PendingDate: "2024-06-01T00:00:00Z",
		PostedDate:  ptrTo("2024-06-02T00:00:00Z"),
		Settlement:  apptest.PostedSettlement(),
	}))
	beta := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:        "2024-06-02",
		BalanceID:   refs.SavingsAccountId,
		FlowID:      flowB.AccountId,
		CategoryID:  refs.SecondCategoryId,
		TagID:       refs.SecondTagId,
		MemberID:    &refs.SecondMemberId,
		Memo:        "Beta",
		Amount:      "50.00",
		PendingDate: "2024-06-02T00:00:00Z",
		Settlement:  apptest.PendingSettlement(),
	}))

	multiRequest := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-06-03"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				Currency:             "USD",
				Amount:               "-30.00",
				AmountUsd:            apptest.StringPtr("-30.00"),
				Settlement:           apptest.PostedSettlement(),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            flowA.AccountId,
				Currency:             "USD",
				Amount:               "15.00",
				AmountUsd:            apptest.StringPtr("15.00"),
				CategoryId:           apptest.Int64Ptr(unrelatedCategory.CategoryId),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            flowB.AccountId,
				Currency:             "USD",
				Amount:               "15.00",
				AmountUsd:            apptest.StringPtr("15.00"),
				CategoryId:           apptest.Int64Ptr(groceriesCategory.CategoryId),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	}
	multi := createTransaction(t, client, multiRequest)

	refundPosted := apptest.Timestamp("2024-06-04T00:00:00Z")
	refundRequest := multiRequest
	refundRequest.InitiatedDate = apptest.Date("2024-06-04")
	refundRequest.Records = []httpclient.CreateJournalRecordRequest{
		{
			AccountId:            refs.CheckingAccountId,
			Currency:             "USD",
			Amount:               "10.00",
			AmountUsd:            apptest.StringPtr("10.00"),
			Settlement:           &httpclient.SettlementIntent{Status: httpclient.SettlementStatusPosted, PostedDate: &refundPosted},
			ReconciliationStatus: httpclient.Reconciled,
			Source:               httpclient.WritableSourceManual,
		},
		{
			AccountId:            refs.MerchantAccountId,
			Currency:             "USD",
			Amount:               "-10.00",
			AmountUsd:            apptest.StringPtr("-10.00"),
			CategoryId:           apptest.Int64Ptr(refs.CategoryId),
			ReconciliationStatus: httpclient.Reconciled,
			Source:               httpclient.WritableSourceManual,
		},
	}
	refund := createTransaction(t, client, refundRequest)

	scopeRequest := multiRequest
	scopeRequest.InitiatedDate = apptest.Date("2024-06-05")
	scopeRequest.Records = []httpclient.CreateJournalRecordRequest{
		{
			AccountId:            refs.CheckingAccountId,
			Currency:             "USD",
			Amount:               "-5.00",
			AmountUsd:            apptest.StringPtr("-5.00"),
			Settlement:           apptest.PostedSettlement(),
			ReconciliationStatus: httpclient.Reconciled,
			Source:               httpclient.WritableSourceManual,
		},
		{
			AccountId:            flowA.AccountId,
			Currency:             "USD",
			Amount:               "5.00",
			AmountUsd:            apptest.StringPtr("5.00"),
			CategoryId:           apptest.Int64Ptr(diningCategory.CategoryId),
			ReconciliationStatus: httpclient.Reconciled,
			Source:               httpclient.WritableSourceManual,
		},
	}
	scopeLeaf := createTransaction(t, client, scopeRequest)

	return dslFilterFixture{
		alpha:     alpha,
		beta:      beta,
		multi:     multi,
		refund:    refund,
		scopeLeaf: scopeLeaf,
	}
}

func listTransactionsWithDSLFilter(t *testing.T, client *apptest.Client, expression string) *httpclient.ListTransactionsResponse {
	t.Helper()
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Filter: apptest.StringPtr(expression),
	})
	requireNoTransportError(t, "list transactions with filter", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("list transactions with filter %q status = %d, want %d; body %s", expression, response.StatusCode(), http.StatusOK, response.Body)
	}
	return response
}

func assertDSLFilterResult(t *testing.T, client *apptest.Client, expression string, want []int64, total int64) {
	t.Helper()
	response := listTransactionsWithDSLFilter(t, client, expression)
	assertTransactionIDs(t, response.JSON200.Transactions, want)
	if response.JSON200.TotalCount != total {
		t.Fatalf("filter %q total_count = %d, want %d; body %+v", expression, response.JSON200.TotalCount, total, response.JSON200)
	}
}

func TestTransactionFilterDSLExpressionsBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := createDslFilterFixture(t, client)
	client.Scenario().Member(`A\tB`)
	client.Scenario().Category(`Dsl\Probe`)
	alpha := fixture.alpha.JSON201.TransactionId
	beta := fixture.beta.JSON201.TransactionId
	multi := fixture.multi.JSON201.TransactionId
	refund := fixture.refund.JSON201.TransactionId
	scopeLeaf := fixture.scopeLeaf.JSON201.TransactionId

	cases := []struct {
		name       string
		expression string
		want       []int64
		total      int64
	}{
		{name: "same-field AND across two accounts", expression: `account:"checking:Chase:Primary" and account:"expense:DslFlowB"`, want: []int64{multi}, total: 1},
		{name: "negation of a tag", expression: `not tag:"Trips:Local"`, want: []int64{scopeLeaf, refund, multi, beta}, total: 4},
		{name: "inclusion and exclusion in one query", expression: `currency:USD and not member:Avery`, want: []int64{scopeLeaf, refund, multi, beta}, total: 4},
		{name: "OR group nested inside AND", expression: `( tag : "Trips:Local" or tag : "Recurring:Monthly" ) and member : Avery`, want: []int64{alpha}, total: 1},
		{name: "AND binds before OR", expression: `tag:"Trips:Local" or tag:"Recurring:Monthly" and member:Blake`, want: []int64{beta, alpha}, total: 2},
		{name: "account hierarchy scope matches descendants", expression: `account:"checking:Chase:*"`, want: []int64{scopeLeaf, refund, multi, alpha}, total: 4},
		{name: "category hierarchy scope matches descendants", expression: `category:"DslScope:*"`, want: []int64{scopeLeaf, multi}, total: 2},
		{name: "exact category does not match siblings", expression: `category:"DslScope:Groceries"`, want: []int64{multi}, total: 1},
		{name: "negated hierarchy scope excludes descendants", expression: `not category:"DslScope:*"`, want: []int64{refund, beta, alpha}, total: 3},
		{name: "tag hierarchy scope under negation", expression: `not tag:"Trips:*"`, want: []int64{scopeLeaf, refund, multi, beta}, total: 4},
		{name: "class term inside expression", expression: `class:spend or class:mixed`, want: []int64{scopeLeaf, multi, beta, alpha}, total: 4},
		{name: "settlement term", expression: `settlement:pending or settlement:not_applicable`, want: []int64{beta}, total: 1},
		{name: "role term composes as an independent record existence", expression: `role:expense and amount<=-25.00`, want: []int64{multi, beta}, total: 2},
		{name: "amount strict comparison with negative value", expression: `amount > -5`, want: []int64{scopeLeaf, refund, multi, beta, alpha}, total: 5},
		{name: "amount exact equality", expression: `amount=-30.00`, want: []int64{multi}, total: 1},
		{name: "initiated exact equality", expression: `initiated=2024-06-04`, want: []int64{refund}, total: 1},
		{name: "posted exact equality", expression: `posted="2024-06-04T00:00:00Z"`, want: []int64{refund}, total: 1},
		{name: "quoted member value", expression: `member:"Avery"`, want: []int64{alpha}, total: 1},
		{name: "unquoted backslash stays literal", expression: `member:A\tB`, want: nil, total: 0},
		{name: "unquoted entity backslash stays literal", expression: `category:Dsl\Probe`, want: nil, total: 0},
		{name: "case-insensitive keywords", expression: `NoT member:Avery OR role:expense`, want: []int64{scopeLeaf, refund, multi, beta, alpha}, total: 5},
		{name: "double negation restores the term", expression: `not not tag:"Trips:Local"`, want: []int64{alpha}, total: 1},
		{name: "lowercase fiat currency normalizes", expression: `currency:usd`, want: []int64{scopeLeaf, refund, multi, beta, alpha}, total: 5},
		{name: "crypto currency value", expression: `currency:"C::nope" and currency:USD`, want: nil, total: 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertDSLFilterResult(t, client, tc.expression, tc.want, tc.total)
		})
	}
}

func TestTransactionFilterDSLQuotedEscapesBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	quotedMember := client.Scenario().Member(`A "quoted" member`)
	backslashMember := client.Scenario().Member(`A \ backslash member`)

	quoted := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:        "2024-06-01",
		BalanceID:   refs.CheckingAccountId,
		FlowID:      refs.MerchantAccountId,
		CategoryID:  refs.CategoryId,
		TagID:       refs.TagId,
		MemberID:    &quotedMember.MemberId,
		Memo:        "quoted member filter",
		Amount:      "10.00",
		PendingDate: "2024-06-01T00:00:00Z",
		Settlement:  apptest.PendingSettlement(),
	}))
	backslash := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:        "2024-06-02",
		BalanceID:   refs.CheckingAccountId,
		FlowID:      refs.MerchantAccountId,
		CategoryID:  refs.CategoryId,
		TagID:       refs.TagId,
		MemberID:    &backslashMember.MemberId,
		Memo:        "backslash member filter",
		Amount:      "20.00",
		PendingDate: "2024-06-02T00:00:00Z",
		Settlement:  apptest.PendingSettlement(),
	}))

	assertDSLFilterResult(t, client, `member : "A \"quoted\" member"`, []int64{quoted.JSON201.TransactionId}, 1)
	assertDSLFilterResult(t, client, `member:"A \\ backslash member"`, []int64{backslash.JSON201.TransactionId}, 1)
}

func TestTransactionFilterDSLAllEntityScopesBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	populated := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:        "2024-06-01",
		BalanceID:   refs.CheckingAccountId,
		FlowID:      refs.MerchantAccountId,
		CategoryID:  refs.CategoryId,
		TagID:       refs.TagId,
		Memo:        "all entity scopes populated",
		Amount:      "10.00",
		PendingDate: "2024-06-01T00:00:00Z",
		Settlement:  apptest.PendingSettlement(),
	}))
	sparse := createTransaction(t, client, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-06-02"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				Currency:             "USD",
				Amount:               "-7.00",
				AmountUsd:            apptest.StringPtr("-7.00"),
				Settlement:           apptest.PendingSettlement(),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.SavingsAccountId,
				Currency:             "USD",
				Amount:               "7.00",
				AmountUsd:            apptest.StringPtr("7.00"),
				Settlement:           apptest.PendingSettlement(),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	})

	assertDSLFilterResult(t, client, `account:*`, []int64{sparse.JSON201.TransactionId, populated.JSON201.TransactionId}, 2)
	assertDSLFilterResult(t, client, `category:*`, []int64{populated.JSON201.TransactionId}, 1)
	assertDSLFilterResult(t, client, `tag:*`, []int64{populated.JSON201.TransactionId}, 1)
}

func TestTransactionFilterDSLRelativeTimeBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	recentPosted := apptest.Timestamp("2026-08-11T00:00:00Z")
	recentPending := apptest.Timestamp("2026-08-09T00:00:00Z")
	recentSettlement := apptest.PostedSettlement()
	recentSettlement.PendingDate = &recentPending
	recentSettlement.PostedDate = &recentPosted
	recentMemo := "recent relative needle"
	recent := createTransaction(t, client, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2026-08-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				Currency:             "USD",
				Amount:               "-12.00",
				AmountUsd:            apptest.StringPtr("-12.00"),
				Memo:                 &recentMemo,
				Settlement:           recentSettlement,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "12.00",
				AmountUsd:            apptest.StringPtr("12.00"),
				CategoryId:           apptest.Int64Ptr(refs.CategoryId),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	})

	boundaryPending := apptest.Timestamp("2026-08-07T06:00:00Z")
	boundaryPosted := apptest.Timestamp("2026-08-10T06:00:00Z")
	boundarySettlement := apptest.PostedSettlement()
	boundarySettlement.PendingDate = &boundaryPending
	boundarySettlement.PostedDate = &boundaryPosted
	boundaryMemo := "time-of-day relative boundary"
	boundary := createTransaction(t, client, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2026-08-08"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				Currency:             "USD",
				Amount:               "-9.00",
				AmountUsd:            apptest.StringPtr("-9.00"),
				Memo:                 &boundaryMemo,
				Settlement:           boundarySettlement,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "9.00",
				AmountUsd:            apptest.StringPtr("9.00"),
				CategoryId:           apptest.Int64Ptr(refs.CategoryId),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	})

	oldPending := apptest.Timestamp("2026-06-02T00:00:00Z")
	oldSettlement := apptest.PendingSettlement()
	oldSettlement.PendingDate = &oldPending
	oldMemo := "old relative needle"
	old := createTransaction(t, client, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2026-06-01"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				Currency:             "USD",
				Amount:               "-7.00",
				AmountUsd:            apptest.StringPtr("-7.00"),
				Memo:                 &oldMemo,
				Settlement:           oldSettlement,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "7.00",
				AmountUsd:            apptest.StringPtr("7.00"),
				CategoryId:           apptest.Int64Ptr(refs.CategoryId),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	})

	cases := []struct {
		name       string
		expression string
		want       []int64
	}{
		{name: "initiated relative lower bound resolves on the UTC civil date", expression: `initiated>=-30d`, want: []int64{recent.JSON201.TransactionId, boundary.JSON201.TransactionId}},
		{name: "pending relative upper bound uses clock time of day", expression: `pending<=-7d`, want: []int64{boundary.JSON201.TransactionId, old.JSON201.TransactionId}},
		{name: "posted relative lower bound includes boundary day", expression: `posted>=-4d`, want: []int64{recent.JSON201.TransactionId}},
		{name: "posted relative upper bound includes same-day earlier instant", expression: `posted<=-3d`, want: []int64{recent.JSON201.TransactionId, boundary.JSON201.TransactionId}},
		{name: "absolute date composes with relative offset", expression: `initiated>=-90d and posted<=+2w`, want: []int64{recent.JSON201.TransactionId, boundary.JSON201.TransactionId}},
		{name: "minute unit uses elapsed minutes", expression: `posted>=-6000m`, want: []int64{recent.JSON201.TransactionId}},
		{name: "month unit differs from minutes", expression: `initiated<=-2mo`, want: []int64{old.JSON201.TransactionId}},
		{name: "large positive week offset stays in the future", expression: `initiated>=+20000w`, want: nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertDSLFilterResult(t, client, tc.expression, tc.want, int64(len(tc.want)))
		})
	}
}

func TestTransactionFilterDSLCalendarRolloverBoundary(t *testing.T) {
	cases := []struct {
		name       string
		now        string
		expression string
		before     string
		boundary   string
	}{
		{name: "month end rolls forward", now: "2024-01-31T12:00:00Z", expression: `initiated>=+1mo`, before: "2024-03-01", boundary: "2024-03-02"},
		{name: "leap day year rolls forward", now: "2024-02-29T12:00:00Z", expression: `initiated>=+1y`, before: "2025-02-28", boundary: "2025-03-01"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(apptest.Timestamp(tc.now))))
			refs := createTransactionRefs(t, client)
			createTransactionForDate(t, client, refs, tc.before, tc.name+" before")
			atBoundary := createTransactionForDate(t, client, refs, tc.boundary, tc.name+" boundary")

			assertDSLFilterResult(t, client, tc.expression, []int64{atBoundary.JSON201.TransactionId}, 1)
		})
	}
}

func TestTransactionFilterDSLCivilTimestampBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	createSettled := func(memo, initiated, pending, posted string) int64 {
		t.Helper()
		pendingDate := apptest.Timestamp(pending)
		postedDate := apptest.Timestamp(posted)
		settlement := apptest.PostedSettlement()
		settlement.PendingDate = &pendingDate
		settlement.PostedDate = &postedDate
		response := createTransaction(t, client, httpclient.CreateTransactionRequest{
			InitiatedDate: apptest.Date(initiated),
			Records: []httpclient.CreateJournalRecordRequest{
				{
					AccountId:            refs.CheckingAccountId,
					Currency:             "USD",
					Amount:               "-5.00",
					AmountUsd:            apptest.StringPtr("-5.00"),
					Memo:                 &memo,
					Settlement:           settlement,
					ReconciliationStatus: httpclient.Reconciled,
					Source:               httpclient.WritableSourceManual,
				},
				{
					AccountId:            refs.MerchantAccountId,
					Currency:             "USD",
					Amount:               "5.00",
					AmountUsd:            apptest.StringPtr("5.00"),
					CategoryId:           apptest.Int64Ptr(refs.CategoryId),
					ReconciliationStatus: httpclient.Reconciled,
					Source:               httpclient.WritableSourceManual,
				},
			},
		})
		return response.JSON201.TransactionId
	}

	before := createSettled("before civil boundary", "2026-08-08", "2026-08-08T23:59:59Z", "2026-08-10T23:59:59Z")
	boundary := createSettled("at civil boundary", "2026-08-09", "2026-08-09T00:00:00Z", "2026-08-11T00:00:00Z")
	createSettled("after civil boundary", "2026-08-09", "2026-08-09T00:00:01Z", "2026-08-11T00:00:01Z")

	assertDSLFilterResult(t, client, `pending<=2026-08-09`, []int64{boundary, before}, 2)
	assertDSLFilterResult(t, client, `posted < "2026-08-11T00:00:01Z"`, []int64{boundary, before}, 2)
}

func TestTransactionFilterDSLLifecycleExpectedBoundary(t *testing.T) {
	base := time.Date(2024, 4, 15, 12, 0, 0, 0, time.UTC)
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(base)))
	refs := createSearchRefs(t, client)

	manualMemo := "manual alongside expected"
	manual := createTransaction(t, client, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-04-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				Currency:             "USD",
				Amount:               "-9.00",
				AmountUsd:            apptest.StringPtr("-9.00"),
				Memo:                 &manualMemo,
				Settlement:           apptest.PostedSettlement(),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "9.00",
				AmountUsd:            apptest.StringPtr("9.00"),
				CategoryId:           apptest.Int64Ptr(refs.CategoryId),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	})

	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDslExpected:Subscription",
		createRecurringDefinitionRefs(t, client, "RecurringDslExpected"),
		"-21.00000000",
		"21.00000000",
		intervalRule(1, "WEEK"),
		"2024-04-10",
	))
	occurrences := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{
		RecurringDefinitionId: &definition.JSON201.RecurringDefinitionId,
	})
	expectedID := occurrences.JSON200.RecurringOccurrences[0].GeneratedTransactionId

	t.Run("default list excludes expected transactions", func(t *testing.T) {
		response, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
		requireNoTransportError(t, "list transactions without filter", err)
		assertTransactionIDs(t, response.JSON200.Transactions, []int64{manual.JSON201.TransactionId})
	})
	t.Run("any filter disables the expected exclusion", func(t *testing.T) {
		assertDSLFilterResult(t, client, `currency:USD`, []int64{*expectedID, manual.JSON201.TransactionId}, 2)
	})
	t.Run("non-negated expected term includes expected transactions", func(t *testing.T) {
		assertDSLFilterResult(t, client, `lifecycle:expected`, []int64{*expectedID}, 1)
		assertDSLFilterResult(t, client, `lifecycle:active or lifecycle:expected`, []int64{*expectedID, manual.JSON201.TransactionId}, 2)
	})
	t.Run("negation controls lifecycle without an implicit exclusion", func(t *testing.T) {
		assertDSLFilterResult(t, client, `not lifecycle:cancelled`, []int64{*expectedID, manual.JSON201.TransactionId}, 2)
	})
	t.Run("explicit expected exclusion stays empty of expected rows", func(t *testing.T) {
		response := listTransactionsWithDSLFilter(t, client, `not lifecycle:expected`)
		for _, transaction := range response.JSON200.Transactions {
			if transaction.TransactionId == *expectedID {
				t.Fatalf("negated expected filter returned expected transaction %d", *expectedID)
			}
		}
	})
}

func TestTransactionFilterDSLTransactionClassComposesBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := createDslFilterFixture(t, client)
	refund := fixture.refund.JSON201.TransactionId

	refundClass := []httpclient.TransactionClass{httpclient.TransactionClassRefund}
	composed, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		TransactionClass: &refundClass,
		Filter:           apptest.StringPtr(`class:spend or class:refund`),
	})
	requireNoTransportError(t, "list transactions with class param and class term", err)
	assertTransactionIDs(t, composed.JSON200.Transactions, []int64{refund})

	narrowed, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		TransactionClass: &refundClass,
		Filter:           apptest.StringPtr(`class:spend`),
	})
	requireNoTransportError(t, "list transactions with contradicting class term", err)
	assertTransactionIDs(t, narrowed.JSON200.Transactions, nil)

	assertDSLFilterResult(t, client, `class:refund`, []int64{refund}, 1)
}

func TestTransactionFilterDSLCapsBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := createDslFilterFixture(t, client)

	t.Run("length cap rejects pathological input", func(t *testing.T) {
		expression := strings.Repeat("not ", 1021) + "((currency:USD))"
		if len(expression) != 4100 {
			t.Fatalf("length rejection probe length = %d, want 4100", len(expression))
		}
		response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
			Filter: &expression,
		})
		requireNoTransportError(t, "list transactions beyond filter length cap", err)
		if response.StatusCode() != http.StatusBadRequest || response.JSON400 == nil ||
			response.JSON400.Error.Message != "filter syntax outside quoted reference values must be at most 4096 characters" {
			t.Fatalf("length cap response status = %d body = %s", response.StatusCode(), response.Body)
		}
	})
	t.Run("length cap excludes a quoted member name", func(t *testing.T) {
		name := strings.Repeat("a", 4090)
		client.Scenario().Member(name)
		expression := `member:"` + name + `"`
		if len(expression) != 4099 {
			t.Fatalf("member length probe = %d, want 4099", len(expression))
		}
		assertDSLFilterResult(t, client, expression, nil, 0)
	})
	t.Run("length cap accepts the maximum size", func(t *testing.T) {
		expression := strings.Repeat("not ", 1020) + "((currency:USD))"
		if len(expression) != 4096 {
			t.Fatalf("cap acceptance probe length = %d, want 4096", len(expression))
		}
		assertDSLFilterResult(t, client, expression, []int64{fixture.scopeLeaf.JSON201.TransactionId, fixture.refund.JSON201.TransactionId, fixture.multi.JSON201.TransactionId, fixture.beta.JSON201.TransactionId, fixture.alpha.JSON201.TransactionId}, 5)
	})
	t.Run("length cap counts Unicode characters", func(t *testing.T) {
		const maxLength = 4096
		expression := `currency:"` + strings.Repeat("界", 1500) + `"`
		if len([]rune(expression)) >= maxLength {
			t.Fatalf("Unicode length probe characters = %d, want fewer than %d", len([]rune(expression)), maxLength)
		}
		if len(expression) <= maxLength {
			t.Fatalf("Unicode length probe bytes = %d, want more than %d", len(expression), maxLength)
		}
		response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &expression})
		requireNoTransportError(t, "list transactions with invalid Unicode currency", err)
		if response.StatusCode() != http.StatusBadRequest || response.JSON400 == nil ||
			!strings.Contains(response.JSON400.Error.Message, "currency value must use ISO 4217") {
			t.Fatalf("Unicode length probe status = %d body = %s", response.StatusCode(), response.Body)
		}
	})
	t.Run("term cap rejects the 101st term", func(t *testing.T) {
		expression := strings.Repeat("role:expense or ", 100) + "role:expense"
		assertInvalidTransactionListQuery(t, client, "filter="+expression)
	})
	t.Run("term cap accepts one hundred terms", func(t *testing.T) {
		expression := strings.Repeat("role:expense or ", 99) + "role:expense"
		assertDSLFilterResult(t, client, expression, []int64{fixture.scopeLeaf.JSON201.TransactionId, fixture.multi.JSON201.TransactionId, fixture.beta.JSON201.TransactionId, fixture.alpha.JSON201.TransactionId}, 4)
	})
	t.Run("depth cap rejects the eleventh level", func(t *testing.T) {
		expression := strings.Repeat("(", 11) + "role:expense" + strings.Repeat(")", 11)
		assertInvalidTransactionListQuery(t, client, "filter="+expression)
	})
	t.Run("depth cap accepts ten levels", func(t *testing.T) {
		expression := strings.Repeat("(", 10) + "role:expense" + strings.Repeat(")", 10)
		assertDSLFilterResult(t, client, expression, []int64{fixture.scopeLeaf.JSON201.TransactionId, fixture.multi.JSON201.TransactionId, fixture.beta.JSON201.TransactionId, fixture.alpha.JSON201.TransactionId}, 4)
	})
	t.Run("relative-offset cap rejects the next magnitude", func(t *testing.T) {
		expression := "initiated>=-100001d"
		response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &expression})
		requireNoTransportError(t, "list transactions beyond relative-offset cap", err)
		if response.StatusCode() != http.StatusBadRequest || response.JSON400 == nil || response.JSON400.Error.Message != "filter relative-offset magnitude must be at most 100000 units at byte 0" {
			t.Fatalf("relative-offset cap response status = %d body = %s", response.StatusCode(), response.Body)
		}
	})
	t.Run("relative-offset cap accepts the maximum magnitude", func(t *testing.T) {
		expression := "initiated>=-100000s"
		response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &expression})
		requireNoTransportError(t, "list transactions at relative-offset cap", err)
		if response.StatusCode() != http.StatusOK {
			t.Fatalf("relative-offset cap boundary status = %d body = %s", response.StatusCode(), response.Body)
		}
	})
}

func TestTransactionFilterDSLErrorMessagesBoundary(t *testing.T) {
	client := newSharedClient(t)

	cases := []struct {
		name          string
		rawQuery      string
		wantSubstring string
	}{
		{name: "unknown field", rawQuery: "filter=" + "bogus:value", wantSubstring: `has unknown field "bogus" at byte 0`},
		{name: "unknown field preserves percent signs", rawQuery: "filter=%25d:x", wantSubstring: `has unknown field "%d" at byte 0`},
		{name: "missing operator", rawQuery: "filter=" + "amount5", wantSubstring: `needs a field:value, field=value, field>value, field>=value, field<value, or field<=value form at byte 0`},
		{name: "unclosed group", rawQuery: "filter=%28role:expense", wantSubstring: `has an unclosed group starting here at byte 0`},
		{name: "unexpected trailing token", rawQuery: "filter=role:expense%29", wantSubstring: `unexpected ) at byte 12`},
		{name: "trailing keyword", rawQuery: "filter=" + "role:expense%20and", wantSubstring: "expected a term at byte 16"},
		{name: "implicit conjunction", rawQuery: "filter=member:Blake%20currency:USD", wantSubstring: `expected and or or before "currency:USD" at byte 13`},
		{name: "dash negation", rawQuery: "filter=-member:Avery", wantSubstring: "does not support dash negation; use not at byte 0"},
		{name: "empty", rawQuery: "filter=", wantSubstring: "must contain at least one term at byte 0"},
		{name: "whitespace only", rawQuery: "filter=%20%09%0A%0D", wantSubstring: "must contain at least one term at byte 0"},
		{name: "unterminated quote", rawQuery: "filter=" + `member:%22Avery`, wantSubstring: "unterminated quoted value at byte 7"},
		{name: "unterminated escape", rawQuery: "filter=member:%22A%5C", wantSubstring: "unterminated escape at byte 7"},
		{name: "invalid quoted escape", rawQuery: "filter=member:%22A%5Cq%22", wantSubstring: "invalid quoted-value escape at byte 9"},
		{name: "adjacent quoted values", rawQuery: "filter=member:%22A%22%22B%22", wantSubstring: "quotes must delimit one complete value at byte 0"},
		{name: "quote embedded in unquoted value", rawQuery: "filter=member:A%22B%22", wantSubstring: "quotes must delimit one complete value at byte 0"},
		{name: "text after quoted value", rawQuery: "filter=member:%22Avery%22x", wantSubstring: "quotes must delimit one complete value at byte 0"},
		{name: "empty member", rawQuery: "filter=member:", wantSubstring: "member value must be a member name at byte 0"},
		{name: "unquoted colon value", rawQuery: "filter=" + "account:checking:Ghost", wantSubstring: "values containing : must be quoted"},
		{name: "membership field with comparison operator", rawQuery: "filter=currency%3DUSD", wantSubstring: "field currency only supports : membership terms"},
		{name: "comparison field with membership operator", rawQuery: "filter=amount:10", wantSubstring: "field amount requires =, >, >=, <, or <= comparisons"},
		{name: "hierarchy scope without base", rawQuery: "filter=category:%22:%2A%22", wantSubstring: "is missing a base FQN at byte 0"},
		{name: "invalid entity FQN", rawQuery: "filter=category:%22A::B%22", wantSubstring: `entity value "A::B" must be a valid FQN at byte 0`},
		{name: "malformed UTF-8 entity scope", rawQuery: "filter=account:%22%FF:%2A%22", wantSubstring: "must be a valid FQN at byte 0"},
		{name: "unknown enum value", rawQuery: "filter=" + "lifecycle:someday", wantSubstring: `field lifecycle has unknown value "someday"`},
		{name: "unknown enum preserves percent signs", rawQuery: "filter=lifecycle:%25d", wantSubstring: `field lifecycle has unknown value "%d" at byte 0`},
		{name: "invalid decimal", rawQuery: "filter=" + "amount>=abc", wantSubstring: "field amount needs a decimal"},
		{name: "out-of-range decimal", rawQuery: "filter=" + "amount_usd>=100000000000.00", wantSubstring: "field amount_usd needs a decimal with at most 10 integer digits and 8 fractional digits"},
		{name: "invalid date", rawQuery: "filter=" + "initiated>=tomorrow", wantSubstring: "field initiated needs YYYY-MM-DD"},
		{name: "invalid pending timestamp", rawQuery: "filter=" + "pending>=not-a-time", wantSubstring: "field pending needs YYYY-MM-DD, RFC3339, or a relative offset like -30d"},
		{name: "invalid posted timestamp", rawQuery: "filter=" + "posted<=not-a-time", wantSubstring: "field posted needs YYYY-MM-DD, RFC3339, or a relative offset like -30d"},
		{name: "invalid currency", rawQuery: "filter=" + "currency:AAA", wantSubstring: "currency value must use ISO 4217 or the C:: crypto prefix"},
		{name: "unresolvable account reference", rawQuery: "filter=" + "account:%22checking:Ghost%22", wantSubstring: "transaction filters reference missing or inactive resource"},
		{name: "unresolvable category reference", rawQuery: "filter=" + "category:Ghost", wantSubstring: "transaction filters reference missing or inactive resource"},
		{name: "unresolvable tag reference", rawQuery: "filter=" + "tag:Ghost", wantSubstring: "transaction filters reference missing or inactive resource"},
		{name: "unresolvable member reference", rawQuery: "filter=" + "member:Ghost", wantSubstring: "transaction filters reference missing or inactive resource"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			response := assertInvalidTransactionListQuery(t, client, tc.rawQuery)
			if response.JSON400 == nil || !strings.Contains(response.JSON400.Error.Message, tc.wantSubstring) {
				t.Fatalf("filter error message = %q, want substring %q", response.JSON400.Error.Message, tc.wantSubstring)
			}
		})
	}

	t.Run("hidden entities resolve in filters", func(t *testing.T) {
		scenario := client.Scenario()
		hiddenCategory := scenario.CategoryWithHidden("DslHidden:Needle", true)
		assertDSLFilterResult(t, client, `category:"DslHidden:Needle"`, nil, 0)
		if hiddenCategory.CategoryId <= 0 {
			t.Fatalf("hidden category fixture missing")
		}
	})

	t.Run("literal asterisks resolve in exact entity filters", func(t *testing.T) {
		scenario := client.Scenario()
		refs := createSearchRefs(t, client)
		literal := scenario.Category("Dsl:*")
		sibling := scenario.Category("Dsl:Sibling")
		scenario.Category("Dsl*Embedded:Leaf")
		literalTransaction := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
			Date:        "2024-07-01",
			BalanceID:   refs.CheckingAccountId,
			FlowID:      refs.MerchantAccountId,
			CategoryID:  literal.CategoryId,
			TagID:       refs.TagId,
			Memo:        "Literal asterisk category",
			Amount:      "10.00",
			PendingDate: "2024-07-01T00:00:00Z",
			Settlement:  apptest.PendingSettlement(),
		}))
		createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
			Date:        "2024-07-02",
			BalanceID:   refs.CheckingAccountId,
			FlowID:      refs.MerchantAccountId,
			CategoryID:  sibling.CategoryId,
			TagID:       refs.TagId,
			Memo:        "Asterisk scope sibling",
			Amount:      "11.00",
			PendingDate: "2024-07-02T00:00:00Z",
			Settlement:  apptest.PendingSettlement(),
		}))
		assertDSLFilterResult(t, client, `category:"Dsl:\*"`, []int64{literalTransaction.JSON201.TransactionId}, 1)
		assertDSLFilterResult(t, client, `category:"Dsl*Embedded:Leaf"`, nil, 0)
	})
}

func TestTransactionFilterDSLActiveReferenceBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	tombstonedAccount := scenario.AccountWithCurrency("checking:DslTombstonedFilter", "USD")
	tombstonedCategory := scenario.Category("DslTombstonedFilter")
	tombstonedTag := scenario.Tag("DslTombstonedFilter")
	tombstonedMember := scenario.Member("Dsl Tombstoned Filter")
	deleteAccount(t, client, tombstonedAccount.AccountId)
	deleteCategory(t, client, tombstonedCategory.CategoryId)
	deleteTag(t, client, tombstonedTag.TagId)
	deleteMember(t, client, tombstonedMember.MemberId)

	for _, expression := range []string{
		`account:"checking:DslTombstonedFilter"`,
		`category:DslTombstonedFilter`,
		`tag:DslTombstonedFilter`,
		`member:"Dsl Tombstoned Filter"`,
	} {
		t.Run("tombstoned "+expression, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &expression})
			requireNoTransportError(t, "list transactions with tombstoned filter reference", err)
			if response.StatusCode() != http.StatusBadRequest || response.JSON400 == nil || !strings.Contains(response.JSON400.Error.Message, "transaction filters reference missing or inactive resource") {
				t.Fatalf("tombstoned filter %q status = %d body = %s", expression, response.StatusCode(), response.Body)
			}
		})
	}

	hidden := true
	hiddenAccount, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		AccountType: httpclient.WritableAccountTypeOwned,
		Currency:    apptest.StringPtr("USD"),
		Fqn:         "checking:DslHiddenFilter",
		IsHidden:    &hidden,
	})
	requireNoTransportError(t, "create hidden filter account", err)
	if hiddenAccount.StatusCode() != http.StatusCreated {
		t.Fatalf("create hidden filter account status = %d body = %s", hiddenAccount.StatusCode(), hiddenAccount.Body)
	}
	hiddenCategory := scenario.CategoryWithHidden("DslHiddenFilter", hidden)
	hiddenTag, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      "DslHiddenFilter",
		IsHidden: &hidden,
	})
	requireNoTransportError(t, "create hidden filter tag", err)
	if hiddenTag.StatusCode() != http.StatusCreated {
		t.Fatalf("create hidden filter tag status = %d body = %s", hiddenTag.StatusCode(), hiddenTag.Body)
	}
	hiddenMember := scenario.Member("Dsl Hidden Filter")
	hiddenMemberResponse, err := client.REST().UpdateMemberHiddenWithResponse(context.Background(), hiddenMember.MemberId, httpclient.UpdateMemberHiddenRequest{IsHidden: true})
	requireNoTransportError(t, "hide filter member", err)
	if hiddenMemberResponse.StatusCode() != http.StatusOK {
		t.Fatalf("hide filter member status = %d body = %s", hiddenMemberResponse.StatusCode(), hiddenMemberResponse.Body)
	}

	for _, expression := range []string{
		`account:"checking:DslHiddenFilter"`,
		`category:DslHiddenFilter`,
		`tag:DslHiddenFilter`,
		`member:"Dsl Hidden Filter"`,
	} {
		t.Run("hidden active "+expression, func(t *testing.T) {
			assertDSLFilterResult(t, client, expression, nil, 0)
		})
	}
	if hiddenAccount.JSON201.AccountId <= 0 || hiddenCategory.CategoryId <= 0 || hiddenTag.JSON201.TagId <= 0 || hiddenMember.MemberId <= 0 {
		t.Fatal("hidden reference fixtures missing")
	}
}
