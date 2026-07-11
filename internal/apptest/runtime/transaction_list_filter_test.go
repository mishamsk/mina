package runtime_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionListFiltersBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	landlord := client.Scenario().Account("expense:Landlord")
	otherMerchant := client.Scenario().Account("expense:OtherMerchant")

	first := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-01-01",
		BalanceID:     refs.CheckingAccountId,
		FlowID:        refs.MerchantAccountId,
		CategoryID:    refs.CategoryId,
		TagID:         refs.TagId,
		MemberID:      &refs.MemberId,
		Memo:          "Lunch 100%_marker",
		Amount:        "12.34",
		PendingDate:   "2024-01-01T00:00:00Z",
		PostedDate:    ptrTo("2024-01-02T00:00:00Z"),
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	second := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-01-02",
		BalanceID:     refs.SavingsAccountId,
		FlowID:        landlord.AccountId,
		CategoryID:    refs.SecondCategoryId,
		TagID:         refs.SecondTagId,
		MemberID:      &refs.SecondMemberId,
		Memo:          "Rent",
		Amount:        "50.00",
		PendingDate:   "2024-01-05T00:00:00Z",
		PostingStatus: httpclient.PostingStatusPending,
	}))
	third := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-01-03",
		BalanceID:     refs.CheckingAccountId,
		FlowID:        refs.MerchantAccountId,
		CategoryID:    refs.CategoryId,
		TagID:         refs.TagId,
		MemberID:      &refs.MemberId,
		Memo:          "Cafe 100XX marker",
		Amount:        "75.00",
		PendingDate:   "2024-01-03T00:00:00Z",
		PostedDate:    ptrTo("2024-01-04T00:00:00Z"),
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	fourth := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-01-04",
		BalanceID:     refs.CheckingAccountId,
		FlowID:        refs.MerchantAccountId,
		CategoryID:    refs.CategoryId,
		TagID:         refs.TagId,
		MemberID:      &refs.MemberId,
		Memo:          "Groceries",
		Amount:        "20.00",
		PendingDate:   "2024-01-04T00:00:00Z",
		PostedDate:    ptrTo("2024-01-06T00:00:00Z"),
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	fifth := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-01-05",
		BalanceID:     refs.SavingsAccountId,
		FlowID:        otherMerchant.AccountId,
		CategoryID:    refs.SecondCategoryId,
		TagID:         refs.SecondTagId,
		MemberID:      &refs.SecondMemberId,
		Memo:          "Utilities",
		Amount:        "35.00",
		PendingDate:   "2024-01-05T12:00:00Z",
		PostedDate:    ptrTo("2024-01-07T00:00:00Z"),
		PostingStatus: httpclient.PostingStatusPosted,
	}))

	cases := []struct {
		name   string
		params *httpclient.ListTransactionsParams
		want   []int64
		total  int64
	}{
		{name: "no params", want: []int64{fifth.JSON201.TransactionId, fourth.JSON201.TransactionId, third.JSON201.TransactionId, second.JSON201.TransactionId, first.JSON201.TransactionId}, total: 5},
		{name: "account", params: &httpclient.ListTransactionsParams{AccountId: ptrTo([]int64{refs.CheckingAccountId})}, want: []int64{fourth.JSON201.TransactionId, third.JSON201.TransactionId, first.JSON201.TransactionId}, total: 3},
		{name: "duplicate account values", params: &httpclient.ListTransactionsParams{AccountId: ptrTo([]int64{refs.CheckingAccountId, refs.CheckingAccountId})}, want: []int64{fourth.JSON201.TransactionId, third.JSON201.TransactionId, first.JSON201.TransactionId}, total: 3},
		{name: "category", params: &httpclient.ListTransactionsParams{CategoryId: ptrTo([]int64{refs.SecondCategoryId})}, want: []int64{fifth.JSON201.TransactionId, second.JSON201.TransactionId}, total: 2},
		{name: "tag", params: &httpclient.ListTransactionsParams{TagId: ptrTo([]int64{refs.SecondTagId})}, want: []int64{fifth.JSON201.TransactionId, second.JSON201.TransactionId}, total: 2},
		{name: "member", params: &httpclient.ListTransactionsParams{MemberId: ptrTo([]int64{refs.SecondMemberId})}, want: []int64{fifth.JSON201.TransactionId, second.JSON201.TransactionId}, total: 2},
		{name: "posting status", params: &httpclient.ListTransactionsParams{PostingStatus: ptrTo([]httpclient.PostingStatus{httpclient.PostingStatusPending})}, want: []int64{second.JSON201.TransactionId}, total: 1},
		{name: "amount min", params: &httpclient.ListTransactionsParams{AmountMin: apptest.StringPtr("70.00")}, want: []int64{third.JSON201.TransactionId}, total: 1},
		{name: "amount max", params: &httpclient.ListTransactionsParams{AmountMax: apptest.StringPtr("-70.00")}, want: []int64{third.JSON201.TransactionId}, total: 1},
		{name: "amount usd min", params: &httpclient.ListTransactionsParams{AmountUsdMin: apptest.StringPtr("70.00")}, want: []int64{third.JSON201.TransactionId}, total: 1},
		{name: "amount usd max", params: &httpclient.ListTransactionsParams{AmountUsdMax: apptest.StringPtr("-70.00")}, want: []int64{third.JSON201.TransactionId}, total: 1},
		{name: "initiated from", params: &httpclient.ListTransactionsParams{InitiatedDateFrom: apptest.DatePtr("2024-01-04")}, want: []int64{fifth.JSON201.TransactionId, fourth.JSON201.TransactionId}, total: 2},
		{name: "initiated to", params: &httpclient.ListTransactionsParams{InitiatedDateTo: apptest.DatePtr("2024-01-02")}, want: []int64{second.JSON201.TransactionId, first.JSON201.TransactionId}, total: 2},
		{name: "pending from", params: &httpclient.ListTransactionsParams{PendingDateFrom: apptest.TimestampPtr("2024-01-05T00:00:00Z")}, want: []int64{fifth.JSON201.TransactionId, second.JSON201.TransactionId}, total: 2},
		{name: "pending to", params: &httpclient.ListTransactionsParams{PendingDateTo: apptest.TimestampPtr("2024-01-03T00:00:00Z")}, want: []int64{third.JSON201.TransactionId, first.JSON201.TransactionId}, total: 2},
		{name: "posted from", params: &httpclient.ListTransactionsParams{PostedDateFrom: apptest.TimestampPtr("2024-01-06T00:00:00Z")}, want: []int64{fifth.JSON201.TransactionId, fourth.JSON201.TransactionId}, total: 2},
		{name: "posted to", params: &httpclient.ListTransactionsParams{PostedDateTo: apptest.TimestampPtr("2024-01-02T00:00:00Z")}, want: []int64{first.JSON201.TransactionId}, total: 1},
		{name: "search memo case insensitive", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("lunch")}, want: []int64{first.JSON201.TransactionId}, total: 1},
		{name: "search escapes like chars", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("100%_")}, want: []int64{first.JSON201.TransactionId}, total: 1},
		{name: "search counterparty case insensitive", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("landLORD")}, want: []int64{second.JSON201.TransactionId}, total: 1},
		{name: "composed dimensions", params: &httpclient.ListTransactionsParams{AccountId: ptrTo([]int64{refs.SavingsAccountId}), CategoryId: ptrTo([]int64{refs.SecondCategoryId}), Search: apptest.StringPtr("landlord")}, want: []int64{second.JSON201.TransactionId}, total: 1},
		{name: "multi value any of", params: &httpclient.ListTransactionsParams{CategoryId: ptrTo([]int64{refs.CategoryId, refs.SecondCategoryId})}, want: []int64{fifth.JSON201.TransactionId, fourth.JSON201.TransactionId, third.JSON201.TransactionId, second.JSON201.TransactionId, first.JSON201.TransactionId}, total: 5},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), tc.params)
			requireNoTransportError(t, "list transactions", err)
			assertTransactionListResponse(t, tc.name, response, tc.want, tc.total)
		})
	}
}

func TestTransactionListFiltersComposeAcrossActiveRecordsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	searchOnlyAccount := client.Scenario().Account("expense:SplitSearchOnly")
	categoryMemo := "category leg"
	accountMemo := "account leg"
	searchMemo := "split needle"

	matched := createTransaction(t, client, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-01-06"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				Currency:             "USD",
				Amount:               "-30.00",
				AmountUsd:            apptest.StringPtr("-30.00"),
				CategoryId:           refs.CategoryId,
				Memo:                 &accountMemo,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "10.00",
				AmountUsd:            apptest.StringPtr("10.00"),
				CategoryId:           refs.SecondCategoryId,
				Memo:                 &categoryMemo,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            searchOnlyAccount.AccountId,
				Currency:             "USD",
				Amount:               "20.00",
				AmountUsd:            apptest.StringPtr("20.00"),
				CategoryId:           refs.CategoryId,
				Memo:                 &searchMemo,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	})

	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AccountId:  ptrTo([]int64{refs.CheckingAccountId}),
		CategoryId: ptrTo([]int64{refs.SecondCategoryId}),
		Search:     apptest.StringPtr("split needle"),
	})
	requireNoTransportError(t, "list transactions split across records", err)
	assertTransactionListResponse(t, "split across records", response, []int64{matched.JSON201.TransactionId}, 1)
}

func TestTransactionListCounterpartySearchSemanticShapesBoundary(t *testing.T) {
	client := newSharedClient(t)
	fixture := newClassificationFixture(t, client)
	transfer := createDatedClassificationTransaction(t, client, "2024-01-07", transferClassificationRequest(fixture))
	exchange := createDatedClassificationTransaction(t, client, "2024-01-08", exchangeClassificationRequest(fixture))

	transferSearch, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Search: apptest.StringPtr("Savings"),
	})
	requireNoTransportError(t, "list transfer counterparty search", err)
	assertTransactionListResponse(t, "transfer counterparty search", transferSearch, []int64{transfer.JSON201.TransactionId}, 1)

	exchangeSearch, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Search: apptest.StringPtr("ExchangeProvider"),
	})
	requireNoTransportError(t, "list exchange provider search", err)
	assertTransactionListResponse(t, "exchange provider search", exchangeSearch, []int64{exchange.JSON201.TransactionId}, 1)
}

func TestTransactionListReferenceMetadataSearchBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	category := scenario.Category("ReferenceSearch:Dining%_Needle")
	secondCategory := scenario.Category("ReferenceSearch:Fuel")
	thirdCategory := scenario.Category("ReferenceSearch:Supplies")
	tag := scenario.Tag("ReferenceSearch:Tags:RoadTrip")
	member := scenario.Member("Casey Metadata")
	checking := createSearchAccount(t, client, httpclient.CreateAccountRequest{
		Fqn:            "checking:ReferenceSearch:Primary%_One",
		AccountType:    httpclient.Balance,
		Currency:       ptrTo("USD"),
		ExternalId:     ptrTo("acct-meta-External%_Needle"),
		ExternalSystem: ptrTo("plaid-meta-noise"),
	})
	merchant := scenario.Account("expense:ReferenceSearch:MerchantFqn")

	first := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-04-01",
		BalanceID:     checking.AccountId,
		FlowID:        merchant.AccountId,
		CategoryID:    category.CategoryId,
		TagID:         tag.TagId,
		MemberID:      &member.MemberId,
		Memo:          "Reference metadata first",
		Amount:        "12.00",
		PendingDate:   "2024-04-01T00:00:00Z",
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	second := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-04-02",
		BalanceID:     scenario.AccountWithCurrency("checking:ReferenceSearch:Second", "USD").AccountId,
		FlowID:        scenario.Account("expense:ReferenceSearch:SecondMerchant").AccountId,
		CategoryID:    secondCategory.CategoryId,
		TagID:         tag.TagId,
		Memo:          "Reference metadata second",
		Amount:        "13.00",
		PendingDate:   "2024-04-02T00:00:00Z",
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	third := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-04-03",
		BalanceID:     scenario.AccountWithCurrency("checking:ReferenceSearch:Third", "USD").AccountId,
		FlowID:        scenario.Account("expense:ReferenceSearch:ThirdMerchant").AccountId,
		CategoryID:    thirdCategory.CategoryId,
		TagID:         tag.TagId,
		Memo:          "Reference metadata third",
		Amount:        "14.00",
		PendingDate:   "2024-04-03T00:00:00Z",
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	jpyAccount := scenario.AccountWithCurrency("checking:ReferenceSearch:YenBalance", "JPY")
	jpyMerchant := scenario.Account("expense:ReferenceSearch:YenMerchant")
	jpyTransaction := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-04-04",
		BalanceID:     jpyAccount.AccountId,
		FlowID:        jpyMerchant.AccountId,
		CategoryID:    secondCategory.CategoryId,
		TagID:         tag.TagId,
		Memo:          "Reference metadata yen",
		Amount:        "1500.00",
		Currency:      "JPY",
		PendingDate:   "2024-04-04T00:00:00Z",
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	eurMetadataAccount := createSearchAccount(t, client, httpclient.CreateAccountRequest{
		Fqn:         "checking:ReferenceSearch:EuroRecord",
		AccountType: httpclient.Balance,
		Currency:    ptrTo("GBP"),
	})
	eurMerchant := scenario.Account("expense:ReferenceSearch:EuroMerchant")
	currencyOnlyTag := scenario.Tag("ReferenceSearch:Tags:CurrencyOnly")
	eurTransaction := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-04-05",
		BalanceID:     eurMetadataAccount.AccountId,
		FlowID:        eurMerchant.AccountId,
		CategoryID:    secondCategory.CategoryId,
		TagID:         currencyOnlyTag.TagId,
		Memo:          "Reference metadata euro record",
		Amount:        "15.00",
		Currency:      "EUR",
		PendingDate:   "2024-04-05T00:00:00Z",
		PostingStatus: httpclient.PostingStatusPosted,
	}))

	limitTwo := 2
	cases := []struct {
		name   string
		params *httpclient.ListTransactionsParams
		want   []int64
		total  int64
	}{
		{name: "category fqn contains with escaped like chars", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("dining%_needle")}, want: []int64{first.JSON201.TransactionId}, total: 1},
		{name: "tag fqn contains case insensitive order", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("roadtrip")}, want: []int64{jpyTransaction.JSON201.TransactionId, third.JSON201.TransactionId, second.JSON201.TransactionId, first.JSON201.TransactionId}, total: 4},
		{name: "tag fqn contains case insensitive with pagination", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("roadtrip"), Limit: &limitTwo}, want: []int64{jpyTransaction.JSON201.TransactionId, third.JSON201.TransactionId}, total: 4},
		{name: "member name contains case insensitive", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("CASEY metadata")}, want: []int64{first.JSON201.TransactionId}, total: 1},
		{name: "account fqn contains balance side", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("primary%_one")}, want: []int64{first.JSON201.TransactionId}, total: 1},
		{name: "account fqn contains flow side", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("merchantfqn")}, want: []int64{first.JSON201.TransactionId}, total: 1},
		{name: "currency exact code case insensitive", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("jpy")}, want: []int64{jpyTransaction.JSON201.TransactionId}, total: 1},
		{name: "currency checks record currency", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("eur")}, want: []int64{eurTransaction.JSON201.TransactionId}, total: 1},
		{name: "currency fragment misses", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("jp")}, want: nil, total: 0},
		{name: "account external id contains with escaped like chars", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("external%_needle")}, want: []int64{first.JSON201.TransactionId}, total: 1},
		{name: "account external system excluded", params: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("plaid-meta-noise")}, want: nil, total: 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), tc.params)
			requireNoTransportError(t, "list transactions by reference metadata search", err)
			assertTransactionListResponse(t, tc.name, response, tc.want, tc.total)
		})
	}
}

func TestTransactionListReferenceMetadataSearchDoesNotDuplicateMultiTagMatchesBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	account := scenario.AccountWithCurrency("checking:ReferenceSearchFanout:Primary", "USD")
	merchant := scenario.Account("expense:ReferenceSearchFanout:Merchant")
	category := scenario.Category("ReferenceSearchFanout:Category")
	firstTag := scenario.Tag("ReferenceSearchFanout:Tags:DupNeedleAlpha")
	secondTag := scenario.Tag("ReferenceSearchFanout:Tags:DupNeedleBeta")
	tagIDs := []int64{firstTag.TagId, secondTag.TagId}
	firstMemo := "first fan-out record"
	secondMemo := "second fan-out record"

	created := createTransaction(t, client, httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-04-06"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            account.AccountId,
				Currency:             "USD",
				Amount:               "-12.00",
				AmountUsd:            apptest.StringPtr("-12.00"),
				CategoryId:           category.CategoryId,
				TagIds:               &tagIDs,
				Memo:                 &firstMemo,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            merchant.AccountId,
				Currency:             "USD",
				Amount:               "12.00",
				AmountUsd:            apptest.StringPtr("12.00"),
				CategoryId:           category.CategoryId,
				TagIds:               &tagIDs,
				Memo:                 &secondMemo,
				PostingStatus:        httpclient.PostingStatusPosted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	})

	limitTwo := 2
	firstPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Search: apptest.StringPtr("dupneedle"),
		Limit:  &limitTwo,
	})
	requireNoTransportError(t, "list transactions by multi-tag fan-out search", err)
	assertTransactionListResponse(t, "multi-tag fan-out search", firstPage, []int64{created.JSON201.TransactionId}, 1)
	assertTransactionListOffset(t, "multi-tag fan-out search", *firstPage.JSON200, 0)

	offsetOne := 1
	secondPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Search: apptest.StringPtr("dupneedle"),
		Limit:  &limitTwo,
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "list transactions by multi-tag fan-out search offset", err)
	assertTransactionListResponse(t, "multi-tag fan-out search offset", secondPage, nil, 1)
	assertTransactionListOffset(t, "multi-tag fan-out search offset", *secondPage.JSON200, 1)
}

func TestTransactionListReferenceMetadataSearchIgnoresReplacedRecordsBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	oldCategory := scenario.Category("ReferenceSearchReplaced:OldCategory")
	oldTag := scenario.Tag("ReferenceSearchReplaced:OldTag")
	oldMember := scenario.Member("Reference Search Old Member")
	oldAccount := createSearchAccount(t, client, httpclient.CreateAccountRequest{
		Fqn:            "checking:ReferenceSearchReplaced:OldPrimary",
		AccountType:    httpclient.Balance,
		Currency:       ptrTo("CHF"),
		ExternalId:     ptrTo("old-ext-search"),
		ExternalSystem: ptrTo("old-system-search"),
	})
	oldMerchant := scenario.Account("expense:ReferenceSearchReplaced:OldMerchant")
	activeCategory := scenario.Category("ReferenceSearchReplaced:ActiveCategory")
	activeTag := scenario.Tag("ReferenceSearchReplaced:ActiveTag")
	activeMember := scenario.Member("Reference Search Active Member")
	activeAccount := scenario.AccountWithCurrency("checking:ReferenceSearchReplaced:ActivePrimary", "USD")
	activeMerchant := scenario.Account("expense:ReferenceSearchReplaced:ActiveMerchant")

	created := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-05-01",
		BalanceID:     oldAccount.AccountId,
		FlowID:        oldMerchant.AccountId,
		CategoryID:    oldCategory.CategoryId,
		TagID:         oldTag.TagId,
		MemberID:      &oldMember.MemberId,
		Memo:          "Old metadata before replacement",
		Amount:        "20.00",
		Currency:      "CHF",
		PendingDate:   "2024-05-01T00:00:00Z",
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	replacement := transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-05-02",
		BalanceID:     activeAccount.AccountId,
		FlowID:        activeMerchant.AccountId,
		CategoryID:    activeCategory.CategoryId,
		TagID:         activeTag.TagId,
		MemberID:      &activeMember.MemberId,
		Memo:          "Active metadata after replacement",
		Amount:        "21.00",
		PendingDate:   "2024-05-02T00:00:00Z",
		PostingStatus: httpclient.PostingStatusPosted,
	})
	replaced, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		created.JSON201.TransactionId,
		httpclient.UpdateTransactionRequest(replacement),
	)
	requireNoTransportError(t, "replace transaction before reference metadata search", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace transaction before reference metadata search status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}

	for _, search := range []string{
		"oldcategory",
		"oldtag",
		"old member",
		"oldprimary",
		"chf",
		"old-ext-search",
		"old-system-search",
	} {
		t.Run(search, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Search: &search})
			requireNoTransportError(t, "list transactions by replaced reference metadata search", err)
			assertTransactionListResponse(t, "replaced reference metadata search "+search, response, nil, 0)
		})
	}

	activeSearch := "activecategory"
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Search: &activeSearch})
	requireNoTransportError(t, "list transactions by active reference metadata search", err)
	assertTransactionListResponse(t, "active reference metadata search", response, []int64{replaced.JSON200.TransactionId}, 1)
}

func TestTransactionListFiltersComposeWithAnchorBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	otherMerchant := client.Scenario().Account("expense:OtherFilteredAnchor")

	first := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-01", "First")
	createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-01-05",
		BalanceID:     refs.SavingsAccountId,
		FlowID:        otherMerchant.AccountId,
		CategoryID:    refs.SecondCategoryId,
		TagID:         refs.SecondTagId,
		MemberID:      &refs.SecondMemberId,
		Memo:          "Filtered out",
		Amount:        "9.00",
		PendingDate:   "2024-01-05T00:00:00Z",
		PostedDate:    ptrTo("2024-01-06T00:00:00Z"),
		PostingStatus: httpclient.PostingStatusPosted,
	}))
	third := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-03", "Third")
	fourth := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-04", "Fourth")

	limitTwo := 2
	midHistory := apptest.Date("2024-01-03")
	midPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AccountId:  ptrTo([]int64{refs.CheckingAccountId}),
		Limit:      &limitTwo,
		AnchorDate: &midHistory,
	})
	requireNoTransportError(t, "list filtered transactions by anchor", err)
	assertTransactionListResponse(t, "mid-history filtered anchor", midPage, []int64{fourth.JSON201.TransactionId, third.JSON201.TransactionId}, 3)
	assertTransactionListOffset(t, "mid-history filtered anchor", *midPage.JSON200, 0)

	olderThanAll := apptest.Date("2023-12-01")
	olderPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AccountId:  ptrTo([]int64{refs.CheckingAccountId}),
		Limit:      &limitTwo,
		AnchorDate: &olderThanAll,
	})
	requireNoTransportError(t, "list filtered transactions by older anchor", err)
	assertTransactionListResponse(t, "older filtered anchor", olderPage, []int64{first.JSON201.TransactionId}, 3)
	assertTransactionListOffset(t, "older filtered anchor", *olderPage.JSON200, 2)

	pageAligned := apptest.Date("2024-01-01")
	alignedPage, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		AccountId:  ptrTo([]int64{refs.CheckingAccountId}),
		Limit:      &limitTwo,
		AnchorDate: &pageAligned,
	})
	requireNoTransportError(t, "list filtered transactions by page-aligned anchor", err)
	assertTransactionListResponse(t, "page-aligned filtered anchor", alignedPage, []int64{first.JSON201.TransactionId}, 3)
	assertTransactionListOffset(t, "page-aligned filtered anchor", *alignedPage.JSON200, 2)

}

func TestTransactionListFiltersIgnoreReplacedRecordsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	updatedMerchant := client.Scenario().Account("expense:UpdatedMerchant")

	created := createTransaction(t, client, transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-02-01",
		BalanceID:     refs.CheckingAccountId,
		FlowID:        refs.MerchantAccountId,
		CategoryID:    refs.CategoryId,
		TagID:         refs.TagId,
		MemberID:      &refs.MemberId,
		Memo:          "edited away memo",
		Amount:        "12.34",
		PendingDate:   "2024-02-01T00:00:00Z",
		PostedDate:    ptrTo("2024-02-02T00:00:00Z"),
		PostingStatus: httpclient.PostingStatusPending,
	}))
	replacement := transactionListFilterRequest(transactionListFilterInput{
		Date:          "2024-02-03",
		BalanceID:     refs.SavingsAccountId,
		FlowID:        updatedMerchant.AccountId,
		CategoryID:    refs.SecondCategoryId,
		TagID:         refs.SecondTagId,
		MemberID:      &refs.SecondMemberId,
		Memo:          "active replacement memo",
		Amount:        "56.78",
		PendingDate:   "2024-02-03T00:00:00Z",
		PostedDate:    ptrTo("2024-02-04T00:00:00Z"),
		PostingStatus: httpclient.PostingStatusPosted,
	})
	replaced, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		created.JSON201.TransactionId,
		httpclient.UpdateTransactionRequest(replacement),
	)
	requireNoTransportError(t, "replace transaction before list filters", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace transaction before list filters status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}

	cases := []struct {
		name   string
		old    *httpclient.ListTransactionsParams
		active *httpclient.ListTransactionsParams
	}{
		{
			name:   "account",
			old:    &httpclient.ListTransactionsParams{AccountId: ptrTo([]int64{refs.CheckingAccountId})},
			active: &httpclient.ListTransactionsParams{AccountId: ptrTo([]int64{refs.SavingsAccountId})},
		},
		{
			name:   "category",
			old:    &httpclient.ListTransactionsParams{CategoryId: ptrTo([]int64{refs.CategoryId})},
			active: &httpclient.ListTransactionsParams{CategoryId: ptrTo([]int64{refs.SecondCategoryId})},
		},
		{
			name:   "tag",
			old:    &httpclient.ListTransactionsParams{TagId: ptrTo([]int64{refs.TagId})},
			active: &httpclient.ListTransactionsParams{TagId: ptrTo([]int64{refs.SecondTagId})},
		},
		{
			name:   "member",
			old:    &httpclient.ListTransactionsParams{MemberId: ptrTo([]int64{refs.MemberId})},
			active: &httpclient.ListTransactionsParams{MemberId: ptrTo([]int64{refs.SecondMemberId})},
		},
		{
			name:   "memo search",
			old:    &httpclient.ListTransactionsParams{Search: apptest.StringPtr("edited away memo")},
			active: &httpclient.ListTransactionsParams{Search: apptest.StringPtr("active replacement memo")},
		},
		{
			name: "amount range",
			old: &httpclient.ListTransactionsParams{
				AmountMin: apptest.StringPtr("12.34"),
				AmountMax: apptest.StringPtr("12.34"),
			},
			active: &httpclient.ListTransactionsParams{
				AmountMin: apptest.StringPtr("56.78"),
				AmountMax: apptest.StringPtr("56.78"),
			},
		},
		{
			name: "amount usd range",
			old: &httpclient.ListTransactionsParams{
				AmountUsdMin: apptest.StringPtr("12.34"),
				AmountUsdMax: apptest.StringPtr("12.34"),
			},
			active: &httpclient.ListTransactionsParams{
				AmountUsdMin: apptest.StringPtr("56.78"),
				AmountUsdMax: apptest.StringPtr("56.78"),
			},
		},
		{
			name: "pending date",
			old: &httpclient.ListTransactionsParams{
				PendingDateFrom: apptest.TimestampPtr("2024-02-01T00:00:00Z"),
				PendingDateTo:   apptest.TimestampPtr("2024-02-01T00:00:00Z"),
			},
			active: &httpclient.ListTransactionsParams{
				PendingDateFrom: apptest.TimestampPtr("2024-02-03T00:00:00Z"),
				PendingDateTo:   apptest.TimestampPtr("2024-02-03T00:00:00Z"),
			},
		},
		{
			name: "posted date",
			old: &httpclient.ListTransactionsParams{
				PostedDateFrom: apptest.TimestampPtr("2024-02-02T00:00:00Z"),
				PostedDateTo:   apptest.TimestampPtr("2024-02-02T00:00:00Z"),
			},
			active: &httpclient.ListTransactionsParams{
				PostedDateFrom: apptest.TimestampPtr("2024-02-04T00:00:00Z"),
				PostedDateTo:   apptest.TimestampPtr("2024-02-04T00:00:00Z"),
			},
		},
		{
			name:   "posting status",
			old:    &httpclient.ListTransactionsParams{PostingStatus: ptrTo([]httpclient.PostingStatus{httpclient.PostingStatusPending})},
			active: &httpclient.ListTransactionsParams{PostingStatus: ptrTo([]httpclient.PostingStatus{httpclient.PostingStatusPosted})},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name+" old", func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), tc.old)
			requireNoTransportError(t, "list transactions by replaced "+tc.name, err)
			assertTransactionListResponse(t, "replaced "+tc.name, response, nil, 0)
		})
		t.Run(tc.name+" active", func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), tc.active)
			requireNoTransportError(t, "list transactions by active "+tc.name, err)
			assertTransactionListResponse(t, "active "+tc.name, response, []int64{replaced.JSON200.TransactionId}, 1)
		})
	}
}

func TestTransactionListFilterValidationBoundary(t *testing.T) {
	client := newSharedClient(t)

	for _, rawQuery := range []string{
		"account_id=0",
		"category_id=0",
		"tag_id=0",
		"member_id=0",
		"posting_status=unknown",
		"amount_min=not-a-decimal",
		"amount_usd_max=100000000000.00",
		"initiated_date_from=2024-02-30",
		"pending_date_from=not-a-time",
		"search=",
	} {
		t.Run(rawQuery, func(t *testing.T) {
			assertInvalidTransactionListQuery(t, client, rawQuery)
		})
	}
}

func TestTransactionListDictionaryFilterReferencesBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	for _, rawQuery := range []string{
		"account_id=999999",
		"category_id=999999",
		"tag_id=999999",
		"member_id=999999",
	} {
		t.Run("missing "+rawQuery, func(t *testing.T) {
			assertInvalidTransactionListQuery(t, client, rawQuery)
		})
	}

	tombstonedAccount := scenario.AccountWithCurrency("checking:TransactionList:TombstonedFilter", "USD")
	deleteAccount(t, client, tombstonedAccount.AccountId)
	tombstonedCategory := scenario.Category("TransactionList:TombstonedFilter")
	deleteCategory(t, client, tombstonedCategory.CategoryId)
	tombstonedTag := scenario.Tag("TransactionList:TombstonedFilter")
	deleteTag(t, client, tombstonedTag.TagId)
	tombstonedMember := scenario.Member("Transaction List Tombstoned Filter")
	deleteMember(t, client, tombstonedMember.MemberId)

	for _, rawQuery := range []string{
		"account_id=" + apptest.FormatID(tombstonedAccount.AccountId),
		"category_id=" + apptest.FormatID(tombstonedCategory.CategoryId),
		"tag_id=" + apptest.FormatID(tombstonedTag.TagId),
		"member_id=" + apptest.FormatID(tombstonedMember.MemberId),
	} {
		t.Run("tombstoned "+rawQuery, func(t *testing.T) {
			assertInvalidTransactionListQuery(t, client, rawQuery)
		})
	}

	hidden := true
	hiddenAccount, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:TransactionList:HiddenFilter",
		AccountType: httpclient.Balance,
		IsHidden:    &hidden,
		Currency:    ptrTo("USD"),
	})
	if err != nil {
		t.Fatalf("hidden transaction list filter account request: %v", err)
	}
	if hiddenAccount.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden transaction list filter account status = %d, want %d; body %s", hiddenAccount.StatusCode(), http.StatusCreated, hiddenAccount.Body)
	}
	hiddenCategory := scenario.CategoryWithHidden("TransactionList:HiddenFilter", hidden)
	hiddenTag, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      "TransactionList:HiddenFilter",
		IsHidden: &hidden,
	})
	if err != nil {
		t.Fatalf("hidden transaction list filter tag request: %v", err)
	}
	if hiddenTag.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden transaction list filter tag status = %d, want %d; body %s", hiddenTag.StatusCode(), http.StatusCreated, hiddenTag.Body)
	}

	for _, rawQuery := range []string{
		"account_id=" + apptest.FormatID(hiddenAccount.JSON201.AccountId),
		"category_id=" + apptest.FormatID(hiddenCategory.CategoryId),
		"tag_id=" + apptest.FormatID(hiddenTag.JSON201.TagId),
	} {
		t.Run("hidden active "+rawQuery, func(t *testing.T) {
			assertEmptyTransactionListQuery(t, client, rawQuery)
		})
	}
}

type transactionListFilterInput struct {
	Date          string
	BalanceID     int64
	FlowID        int64
	CategoryID    int64
	TagID         int64
	MemberID      *int64
	Memo          string
	Amount        string
	Currency      string
	PendingDate   string
	PostedDate    *string
	PostingStatus httpclient.PostingStatus
}

func transactionListFilterRequest(input transactionListFilterInput) httpclient.CreateTransactionRequest {
	tagIDs := []int64{input.TagID}
	pendingDate := apptest.Timestamp(input.PendingDate)
	currency := input.Currency
	if currency == "" {
		currency = "USD"
	}
	var postedDate *time.Time
	if input.PostedDate != nil {
		postedDate = apptest.TimestampPtr(*input.PostedDate)
	}

	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date(input.Date),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            input.BalanceID,
				MemberId:             input.MemberID,
				Currency:             currency,
				Amount:               "-" + input.Amount,
				AmountUsd:            apptest.StringPtr("-" + input.Amount),
				CategoryId:           input.CategoryID,
				TagIds:               &tagIDs,
				Memo:                 &input.Memo,
				PendingDate:          &pendingDate,
				PostedDate:           postedDate,
				PostingStatus:        input.PostingStatus,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
			{
				AccountId:            input.FlowID,
				Currency:             currency,
				Amount:               input.Amount,
				AmountUsd:            apptest.StringPtr(input.Amount),
				CategoryId:           input.CategoryID,
				PendingDate:          &pendingDate,
				PostedDate:           postedDate,
				PostingStatus:        input.PostingStatus,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.ManualSourceManual,
			},
		},
	}
}

func createSearchAccount(t *testing.T, client *apptest.Client, input httpclient.CreateAccountRequest) httpclient.Account {
	t.Helper()

	response, err := client.REST().CreateAccountWithResponse(context.Background(), input)
	requireNoTransportError(t, "create search account", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create search account status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return *response.JSON201
}

func assertTransactionListResponse(t *testing.T, label string, response *httpclient.ListTransactionsResponse, want []int64, total int64) {
	t.Helper()

	if response.StatusCode() != http.StatusOK {
		t.Fatalf("%s status = %d, want %d; body %s", label, response.StatusCode(), http.StatusOK, response.Body)
	}
	assertTransactionIDs(t, response.JSON200.Transactions, want)
	if response.JSON200.TotalCount != total {
		t.Fatalf("%s total_count = %d, want %d; body %+v", label, response.JSON200.TotalCount, total, response.JSON200)
	}
}

func assertEmptyTransactionListQuery(t *testing.T, client *apptest.Client, rawQuery string) {
	t.Helper()

	response, err := client.REST().ListTransactionsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "list transactions", err)
	assertTransactionListResponse(t, "transaction list query "+rawQuery, response, nil, 0)
}
