package runtime_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

type semanticFixture struct {
	checking        httpclient.Account
	savings         httpclient.Account
	card            httpclient.Account
	cash            httpclient.Account
	cashEUR         httpclient.Account
	jordan          httpclient.Account
	employerBalance httpclient.Account
	restaurant      httpclient.Account
	mortgageBank    httpclient.Account
	supermarket     httpclient.Account
	fees            httpclient.Account
	interest        httpclient.Account
	employer        httpclient.Account
	lisbon          httpclient.Account
	merchantA       httpclient.Account
	exchange        httpclient.Account
	openingBalance  httpclient.Account
	correction      httpclient.Account
	expense         httpclient.Category
	groceries       httpclient.Category
	feesCategory    httpclient.Category
	travel          httpclient.Category
	mortgage        [4]httpclient.Category
	interestIncome  httpclient.Category
	salary          httpclient.Category
	bonus           httpclient.Category
}

type expectedShape struct {
	shape         httpclient.TransactionShapeType
	amounts       []httpclient.DisplayAmount
	effectiveRate *httpclient.ExchangeEffectiveRate
}

type workedExample struct {
	name           string
	records        func(*semanticFixture) []httpclient.CreateJournalRecordRequest
	class          httpclient.TransactionClass
	displayTitle   string
	primaryAmounts []httpclient.DisplayAmount
	shapes         []expectedShape
	roles          []httpclient.RecordRole
}

func TestDerivedAccountingSemanticsWorkedExamples(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	multiCurrency := client.Scenario().AccountWithType("cash:ExchangeSummaryMulti", httpclient.WritableAccountTypeOwned)

	examples := []workedExample{
		{
			name: "simple spend",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.card.AccountId, "-72.00", "USD", nil),
					semanticRecord(f.restaurant.AccountId, "72.00", "USD", &f.expense.CategoryId),
				}
			},
			class:          httpclient.TransactionClassSpend,
			primaryAmounts: displayAmounts("USD", "-72.00000000"),
			shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmounts("USD", "-72.00000000")}},
			roles:          []httpclient.RecordRole{httpclient.RecordRoleBalance, httpclient.RecordRoleExpense},
		},
		{
			name: "mortgage split keeps one funding record",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "-2400.00", "USD", nil),
					semanticRecord(f.mortgageBank.AccountId, "1800.00", "USD", &f.mortgage[0].CategoryId),
					semanticRecord(f.mortgageBank.AccountId, "400.00", "USD", &f.mortgage[1].CategoryId),
					semanticRecord(f.mortgageBank.AccountId, "150.00", "USD", &f.mortgage[2].CategoryId),
					semanticRecord(f.mortgageBank.AccountId, "50.00", "USD", &f.mortgage[3].CategoryId),
				}
			},
			class:          httpclient.TransactionClassSpend,
			primaryAmounts: displayAmounts("USD", "-2400.00000000"),
			shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmounts("USD", "-2400.00000000")}},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleExpense,
				httpclient.RecordRoleExpense,
				httpclient.RecordRoleExpense,
				httpclient.RecordRoleExpense,
			},
		},
		{
			name: "spend with friend split",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.card.AccountId, "-72.00", "USD", nil),
					semanticRecord(f.restaurant.AccountId, "54.00", "USD", &f.expense.CategoryId),
					semanticRecord(f.jordan.AccountId, "18.00", "USD", nil),
				}
			},
			class:          httpclient.TransactionClassSpend,
			primaryAmounts: displayAmounts("USD", "-54.00000000"),
			shapes: []expectedShape{
				{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmounts("USD", "-54.00000000")},
				{shape: httpclient.TransactionShapeTypeTransfer, amounts: displayAmounts("USD", "-18.00000000")},
			},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleExpense,
				httpclient.RecordRoleBalance,
			},
		},
		{
			name: "party repayment",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "18.00", "USD", nil),
					semanticRecord(f.jordan.AccountId, "-18.00", "USD", nil),
				}
			},
			class:  httpclient.TransactionClassTransfer,
			shapes: []expectedShape{{shape: httpclient.TransactionShapeTypeTransfer, amounts: displayAmounts("USD", "18.00000000")}},
			roles:  []httpclient.RecordRole{httpclient.RecordRoleBalance, httpclient.RecordRoleBalance},
		},
		{
			name: "grocery return nets inside expense",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.card.AccountId, "30.00", "USD", nil),
					semanticRecord(f.supermarket.AccountId, "-30.00", "USD", &f.groceries.CategoryId),
				}
			},
			class:          httpclient.TransactionClassRefund,
			primaryAmounts: displayAmounts("USD", "30.00000000"),
			shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeRefund, amounts: displayAmounts("USD", "30.00000000")}},
			roles:          []httpclient.RecordRole{httpclient.RecordRoleBalance, httpclient.RecordRoleRefund},
		},
		{
			name: "supermarket cash back",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "-120.00", "USD", nil),
					semanticRecord(f.supermarket.AccountId, "100.00", "USD", &f.groceries.CategoryId),
					semanticRecord(f.cash.AccountId, "20.00", "USD", nil),
				}
			},
			class:          httpclient.TransactionClassSpend,
			primaryAmounts: displayAmounts("USD", "-100.00000000"),
			shapes: []expectedShape{
				{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmounts("USD", "-100.00000000")},
				{shape: httpclient.TransactionShapeTypeTransfer, amounts: displayAmounts("USD", "20.00000000")},
			},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleExpense,
				httpclient.RecordRoleBalance,
			},
		},
		{
			name: "transfer with wire charge is spend not mixed",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "-525.00", "USD", nil),
					semanticRecord(f.savings.AccountId, "500.00", "USD", nil),
					semanticRecord(f.fees.AccountId, "25.00", "USD", &f.feesCategory.CategoryId),
				}
			},
			class:          httpclient.TransactionClassSpend,
			primaryAmounts: displayAmounts("USD", "-25.00000000"),
			shapes: []expectedShape{
				{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmounts("USD", "-25.00000000")},
				{shape: httpclient.TransactionShapeTypeTransfer, amounts: displayAmounts("USD", "500.00000000")},
			},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleExpense,
			},
		},
		{
			name: "bank interest",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "2.15", "USD", nil),
					semanticRecord(f.interest.AccountId, "-2.15", "USD", &f.interestIncome.CategoryId),
				}
			},
			class:          httpclient.TransactionClassIncome,
			primaryAmounts: displayAmounts("USD", "2.15000000"),
			shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeIncome, amounts: displayAmounts("USD", "2.15000000")}},
			roles:          []httpclient.RecordRole{httpclient.RecordRoleBalance, httpclient.RecordRoleIncome},
		},
		{
			name: "currency exchange",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "-330.00", "USD", nil),
					semanticRecordWithoutSettlement(f.exchange.AccountId, "330.00", "USD", nil),
					semanticRecordWithoutSettlement(f.exchange.AccountId, "-300.00", "EUR", nil),
					semanticRecord(f.cashEUR.AccountId, "300.00", "EUR", nil),
				}
			},
			class:        httpclient.TransactionClassCurrencyExchange,
			displayTitle: "checking:Joint ($) → Travel:EUR (€)",
			shapes: []expectedShape{{
				shape: httpclient.TransactionShapeTypeExchange,
				amounts: []httpclient.DisplayAmount{
					{Currency: "USD", Amount: "-330.00000000", AmountUsd: apptest.StringPtr("-330.00000000")},
					{Currency: "EUR", Amount: "300.00000000"},
				},
				effectiveRate: &httpclient.ExchangeEffectiveRate{
					SoldCurrency:   "USD",
					BoughtCurrency: "EUR",
					Rate:           "1.10000000",
				},
			}},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleExchange,
				httpclient.RecordRoleExchange,
				httpclient.RecordRoleBalance,
			},
		},
		{
			name: "multi-account currency exchange",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "-200.00", "USD", nil),
					semanticRecord(f.savings.AccountId, "-130.00", "USD", nil),
					semanticRecordWithoutSettlement(f.exchange.AccountId, "330.00", "USD", nil),
					semanticRecordWithoutSettlement(f.exchange.AccountId, "-300.00", "EUR", nil),
					semanticRecord(f.cashEUR.AccountId, "300.00", "EUR", nil),
				}
			},
			class:        httpclient.TransactionClassCurrencyExchange,
			displayTitle: "$ → €",
			shapes: []expectedShape{{
				shape: httpclient.TransactionShapeTypeExchange,
				amounts: []httpclient.DisplayAmount{
					{Currency: "USD", Amount: "-330.00000000", AmountUsd: apptest.StringPtr("-330.00000000")},
					{Currency: "EUR", Amount: "300.00000000"},
				},
				effectiveRate: &httpclient.ExchangeEffectiveRate{
					SoldCurrency:   "USD",
					BoughtCurrency: "EUR",
					Rate:           "1.10000000",
				},
			}},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleExchange,
				httpclient.RecordRoleExchange,
				httpclient.RecordRoleBalance,
			},
		},
		{
			name: "same-account crypto exchange with marker fallback",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(multiCurrency.AccountId, "-330.00", "USD", nil),
					semanticRecordWithoutSettlement(f.exchange.AccountId, "330.00", "USD", nil),
					semanticRecordWithoutSettlement(f.exchange.AccountId, "-300.00", "C::BTC", nil),
					semanticRecord(multiCurrency.AccountId, "300.00", "C::BTC", nil),
				}
			},
			class:        httpclient.TransactionClassCurrencyExchange,
			displayTitle: "cash:ExchangeSummaryMulti ($ → C::BTC)",
			shapes: []expectedShape{{
				shape: httpclient.TransactionShapeTypeExchange,
				amounts: []httpclient.DisplayAmount{
					{Currency: "USD", Amount: "-330.00000000", AmountUsd: apptest.StringPtr("-330.00000000")},
					{Currency: "C::BTC", Amount: "300.00000000"},
				},
				effectiveRate: &httpclient.ExchangeEffectiveRate{
					SoldCurrency:   "USD",
					BoughtCurrency: "C::BTC",
					Rate:           "1.10000000",
				},
			}},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleExchange,
				httpclient.RecordRoleExchange,
				httpclient.RecordRoleBalance,
			},
		},
		{
			name: "same-account currency exchange with colliding markers",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(multiCurrency.AccountId, "-330.00", "USD", nil),
					semanticRecordWithoutSettlement(f.exchange.AccountId, "330.00", "USD", nil),
					semanticRecordWithoutSettlement(f.exchange.AccountId, "-450.00", "CAD", nil),
					semanticRecord(multiCurrency.AccountId, "450.00", "CAD", nil),
				}
			},
			class:        httpclient.TransactionClassCurrencyExchange,
			displayTitle: "cash:ExchangeSummaryMulti (USD → CAD)",
			shapes: []expectedShape{{
				shape: httpclient.TransactionShapeTypeExchange,
				amounts: []httpclient.DisplayAmount{
					{Currency: "USD", Amount: "-330.00000000", AmountUsd: apptest.StringPtr("-330.00000000")},
					{Currency: "CAD", Amount: "450.00000000"},
				},
				effectiveRate: &httpclient.ExchangeEffectiveRate{
					SoldCurrency:   "USD",
					BoughtCurrency: "CAD",
					Rate:           "0.73333333",
				},
			}},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleExchange,
				httpclient.RecordRoleExchange,
				httpclient.RecordRoleBalance,
			},
		},
		{
			name: "purchase abroad is ordinary spend",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.cashEUR.AccountId, "-60.00", "EUR", nil),
					semanticRecord(f.lisbon.AccountId, "60.00", "EUR", &f.travel.CategoryId),
				}
			},
			class:          httpclient.TransactionClassSpend,
			primaryAmounts: displayAmountsWithoutUSD("EUR", "-60.00000000"),
			shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmountsWithoutUSD("EUR", "-60.00000000")}},
			roles:          []httpclient.RecordRole{httpclient.RecordRoleBalance, httpclient.RecordRoleExpense},
		},
		{
			name: "income clawback",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "-500.00", "USD", nil),
					semanticRecord(f.employer.AccountId, "500.00", "USD", &f.bonus.CategoryId),
				}
			},
			class:          httpclient.TransactionClassClawback,
			primaryAmounts: displayAmounts("USD", "-500.00000000"),
			shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeClawback, amounts: displayAmounts("USD", "-500.00000000")}},
			roles:          []httpclient.RecordRole{httpclient.RecordRoleBalance, httpclient.RecordRoleClawback},
		},
		{
			name: "paycheck settles party balance",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "3200.00", "USD", nil),
					semanticRecord(f.employer.AccountId, "-3000.00", "USD", &f.salary.CategoryId),
					semanticRecord(f.employerBalance.AccountId, "-200.00", "USD", nil),
				}
			},
			class:          httpclient.TransactionClassIncome,
			primaryAmounts: displayAmounts("USD", "3000.00000000"),
			shapes: []expectedShape{
				{shape: httpclient.TransactionShapeTypeIncome, amounts: displayAmounts("USD", "3000.00000000")},
				{shape: httpclient.TransactionShapeTypeTransfer, amounts: displayAmounts("USD", "200.00000000")},
			},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleIncome,
				httpclient.RecordRoleBalance,
			},
		},
		{
			name: "salary net of wire fee is mixed",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "2985.00", "USD", nil),
					semanticRecord(f.employer.AccountId, "-3000.00", "USD", &f.salary.CategoryId),
					semanticRecord(f.fees.AccountId, "15.00", "USD", &f.feesCategory.CategoryId),
				}
			},
			class:        httpclient.TransactionClassMixed,
			displayTitle: "Acme Payroll",
			shapes: []expectedShape{
				{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmounts("USD", "-15.00000000")},
				{shape: httpclient.TransactionShapeTypeIncome, amounts: displayAmounts("USD", "3000.00000000")},
			},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleIncome,
				httpclient.RecordRoleExpense,
			},
		},
		{
			name: "mixed transaction uses uniform memo",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				memo := "Payroll correction"
				records := []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "2985.00", "USD", nil),
					semanticRecord(f.employer.AccountId, "-3000.00", "USD", &f.salary.CategoryId),
					semanticRecord(f.fees.AccountId, "15.00", "USD", &f.feesCategory.CategoryId),
				}
				for index := range records {
					records[index].Memo = &memo
				}
				return records
			},
			class:        httpclient.TransactionClassMixed,
			displayTitle: "Payroll correction",
			shapes: []expectedShape{
				{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmounts("USD", "-15.00000000")},
				{shape: httpclient.TransactionShapeTypeIncome, amounts: displayAmounts("USD", "3000.00000000")},
			},
			roles: []httpclient.RecordRole{
				httpclient.RecordRoleBalance,
				httpclient.RecordRoleIncome,
				httpclient.RecordRoleExpense,
			},
		},
		{
			name: "opening balance",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.checking.AccountId, "1000.00", "USD", nil),
					semanticRecordWithoutSettlement(f.openingBalance.AccountId, "-1000.00", "USD", nil),
				}
			},
			class:          httpclient.TransactionClassAdjustment,
			displayTitle:   "checking:Joint",
			primaryAmounts: displayAmounts("USD", "1000.00000000"),
			shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeAdjustment, amounts: displayAmounts("USD", "1000.00000000")}},
			roles:          []httpclient.RecordRole{httpclient.RecordRoleBalance, httpclient.RecordRoleAdjustment},
		},
	}

	for index, example := range examples {
		t.Run(example.name, func(t *testing.T) {
			response, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
				InitiatedDate: apptest.Date("2024-06-" + twoDigits(index+1)),
				Records:       example.records(fixture),
			})
			requireClientResponse(t, "create worked example", err, response.StatusCode(), http.StatusCreated, response.Body)
			assertDerivedTransaction(t, *response.JSON201, example)
		})
	}
}

func TestCurrencyCountDoesNotClassifyExchange(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)

	response, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-07-01"),
		Records: []httpclient.CreateJournalRecordRequest{
			semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
			semanticRecord(fixture.restaurant.AccountId, "10.00", "USD", &fixture.expense.CategoryId),
			semanticRecord(fixture.cashEUR.AccountId, "-9.00", "EUR", nil),
			semanticRecord(fixture.lisbon.AccountId, "9.00", "EUR", &fixture.travel.CategoryId),
		},
	})
	requireClientResponse(t, "create mixed-currency spend", err, response.StatusCode(), http.StatusCreated, response.Body)
	assertDerivedTransaction(t, *response.JSON201, workedExample{
		class: httpclient.TransactionClassSpend,
		primaryAmounts: []httpclient.DisplayAmount{
			{Currency: "USD", Amount: "-10.00000000", AmountUsd: apptest.StringPtr("-10.00000000")},
			{Currency: "EUR", Amount: "-9.00000000"},
		},
		shapes: []expectedShape{{
			shape: httpclient.TransactionShapeTypeSpend,
			amounts: []httpclient.DisplayAmount{
				{Currency: "USD", Amount: "-10.00000000", AmountUsd: apptest.StringPtr("-10.00000000")},
				{Currency: "EUR", Amount: "-9.00000000"},
			},
		}},
		roles: []httpclient.RecordRole{
			httpclient.RecordRoleBalance,
			httpclient.RecordRoleExpense,
			httpclient.RecordRoleBalance,
			httpclient.RecordRoleExpense,
		},
	})
}

func TestPersistedDisplayAmountUSDAggregationAndNullPropagation(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)

	completeRecords := []httpclient.CreateJournalRecordRequest{
		semanticRecord(fixture.cashEUR.AccountId, "-72.00", "EUR", nil),
		semanticRecord(fixture.lisbon.AccountId, "20.00", "EUR", &fixture.travel.CategoryId),
		semanticRecord(fixture.lisbon.AccountId, "34.00", "EUR", &fixture.travel.CategoryId),
		semanticRecord(fixture.jordan.AccountId, "18.00", "EUR", nil),
	}
	completeRecords[0].AmountUsd = apptest.StringPtr("-79.20")
	completeRecords[1].AmountUsd = apptest.StringPtr("22.00")
	completeRecords[2].AmountUsd = apptest.StringPtr("37.40")
	completeRecords[3].AmountUsd = apptest.StringPtr("19.80")
	complete, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-07-10"),
		Records:       completeRecords,
	})
	requireClientResponse(t, "create valued complex transaction", err, complete.StatusCode(), http.StatusCreated, complete.Body)
	assertDerivedTransaction(t, *complete.JSON201, workedExample{
		class:          httpclient.TransactionClassSpend,
		primaryAmounts: displayAmountsWithUSD("EUR", "-54.00000000", "-59.40000000"),
		shapes: []expectedShape{
			{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmountsWithUSD("EUR", "-54.00000000", "-59.40000000")},
			{shape: httpclient.TransactionShapeTypeTransfer, amounts: displayAmountsWithUSD("EUR", "-18.00000000", "-19.80000000")},
		},
		roles: []httpclient.RecordRole{
			httpclient.RecordRoleBalance,
			httpclient.RecordRoleExpense,
			httpclient.RecordRoleExpense,
			httpclient.RecordRoleBalance,
		},
	})

	partialRecords := []httpclient.CreateJournalRecordRequest{
		semanticRecord(fixture.cashEUR.AccountId, "-60.00", "EUR", nil),
		semanticRecord(fixture.lisbon.AccountId, "40.00", "EUR", &fixture.travel.CategoryId),
		semanticRecord(fixture.lisbon.AccountId, "20.00", "EUR", &fixture.travel.CategoryId),
	}
	partialRecords[0].AmountUsd = apptest.StringPtr("-66.00")
	partialRecords[1].AmountUsd = apptest.StringPtr("44.00")
	partial, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-07-11"),
		Records:       partialRecords,
	})
	requireClientResponse(t, "create partially valued transaction", err, partial.StatusCode(), http.StatusCreated, partial.Body)
	assertDerivedTransaction(t, *partial.JSON201, workedExample{
		class:          httpclient.TransactionClassSpend,
		primaryAmounts: displayAmountsWithoutUSD("EUR", "-60.00000000"),
		shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmountsWithoutUSD("EUR", "-60.00000000")}},
		roles: []httpclient.RecordRole{
			httpclient.RecordRoleBalance,
			httpclient.RecordRoleExpense,
			httpclient.RecordRoleExpense,
		},
	})
}

func TestPersistedDisplayAmountUSDOverflowIsUnavailable(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	memo := "USD display aggregation overflow"
	records := []httpclient.CreateJournalRecordRequest{
		semanticRecord(fixture.cashEUR.AccountId, "-8000000000.00", "EUR", nil),
		semanticRecord(fixture.lisbon.AccountId, "4000000000.00", "EUR", &fixture.travel.CategoryId),
		semanticRecord(fixture.lisbon.AccountId, "4000000000.00", "EUR", &fixture.travel.CategoryId),
	}
	for index := range records {
		records[index].Memo = &memo
	}
	records[1].AmountUsd = apptest.StringPtr("5080000000.00")
	records[2].AmountUsd = apptest.StringPtr("5080000000.00")

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-07-12"),
		Records:       records,
	})
	requireClientResponse(t, "create transaction with overflowing USD display aggregation", err, created.StatusCode(), http.StatusCreated, created.Body)

	want := workedExample{
		class:          httpclient.TransactionClassSpend,
		primaryAmounts: displayAmountsWithoutUSD("EUR", "-8000000000.00000000"),
		shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmountsWithoutUSD("EUR", "-8000000000.00000000")}},
		roles: []httpclient.RecordRole{
			httpclient.RecordRoleBalance,
			httpclient.RecordRoleExpense,
			httpclient.RecordRoleExpense,
		},
	}
	assertDerivedTransaction(t, *created.JSON201, want)

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId, nil)
	requireClientResponse(t, "read transaction with overflowing USD display aggregation", err, read.StatusCode(), http.StatusOK, read.Body)
	assertDerivedTransaction(t, *read.JSON200, want)

	listed, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Search: &memo})
	requireClientResponse(t, "list transaction with overflowing USD display aggregation", err, listed.StatusCode(), http.StatusOK, listed.Body)
	if len(listed.JSON200.Transactions) != 1 {
		t.Fatalf("listed transactions = %d, want 1", len(listed.JSON200.Transactions))
	}
	assertDerivedTransaction(t, listed.JSON200.Transactions[0], want)
}

func TestCategoryRuleNamesOffendingRecords(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)

	tests := []struct {
		name       string
		records    []httpclient.CreateJournalRecordRequest
		recordPath string
	}{
		{
			name: "category on owned record",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", &fixture.expense.CategoryId),
				semanticRecord(fixture.restaurant.AccountId, "10.00", "USD", &fixture.expense.CategoryId),
			},
			recordPath: "records[0]",
		},
		{
			name: "missing category on flow record",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
				semanticRecord(fixture.restaurant.AccountId, "10.00", "USD", nil),
			},
			recordPath: "records[1]",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
				InitiatedDate: apptest.Date("2024-07-02"),
				Records:       test.records,
			})
			requireClientResponse(t, "reject category rule violation", err, response.StatusCode(), http.StatusBadRequest, response.Body)
			if response.JSON400 == nil || !strings.Contains(response.JSON400.Error.Message, test.recordPath) {
				t.Fatalf("category rule error = %+v, want offending path %q", response.JSON400, test.recordPath)
			}
		})
	}
}

func TestExchangeExclusivityNamesOffendingRecords(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	multiCurrency := client.Scenario().AccountWithType("cash:MultiCurrency", httpclient.WritableAccountTypeOwned)

	tests := []struct {
		name    string
		records []httpclient.CreateJournalRecordRequest
	}{
		{
			name: "exactly two currencies",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "10.00", "USD", nil),
			},
		},
		{
			name: "no flow records",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "-9.00", "EUR", nil),
				semanticRecord(fixture.lisbon.AccountId, "9.00", "EUR", &fixture.travel.CategoryId),
			},
		},
		{
			name: "no adjustment records",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "-9.00", "EUR", nil),
				semanticRecord(fixture.correction.AccountId, "9.00", "EUR", nil),
			},
		},
		{
			name: "opposite balance signs",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "10.00", "USD", nil),
				semanticRecord(fixture.cashEUR.AccountId, "-9.00", "EUR", nil),
				semanticRecord(fixture.exchange.AccountId, "9.00", "EUR", nil),
			},
		},
		{
			name: "one balance sign per currency",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
				semanticRecord(fixture.savings.AccountId, "3.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "7.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "-9.00", "EUR", nil),
				semanticRecord(fixture.cashEUR.AccountId, "9.00", "EUR", nil),
			},
		},
		{
			name: "balance records in both currencies",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "-9.00", "EUR", nil),
				semanticRecord(fixture.exchange.AccountId, "9.00", "EUR", nil),
			},
		},
		{
			name: "not three currencies",
			records: []httpclient.CreateJournalRecordRequest{
				semanticRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "10.00", "USD", nil),
				semanticRecord(fixture.exchange.AccountId, "-9.00", "EUR", nil),
				semanticRecord(fixture.cashEUR.AccountId, "9.00", "EUR", nil),
				semanticRecord(multiCurrency.AccountId, "-1.00", "JPY", nil),
				semanticRecord(fixture.exchange.AccountId, "1.00", "JPY", nil),
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
				InitiatedDate: apptest.Date("2024-07-03"),
				Records:       test.records,
			})
			requireClientResponse(t, "reject exchange exclusivity violation", err, response.StatusCode(), http.StatusBadRequest, response.Body)
			if response.JSON400 == nil || !strings.Contains(response.JSON400.Error.Message, "records[") {
				t.Fatalf("exchange error = %+v, want offending record path", response.JSON400)
			}
		})
	}
}

func TestClassifyTransactionDraft(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)

	unbalanced, err := client.REST().ClassifyTransactionWithResponse(context.Background(), httpclient.ClassifyTransactionRequest{
		Records: []httpclient.ClassifyJournalRecordRequest{
			classificationRecord(fixture.checking.AccountId, "-12.00", "USD", nil),
			classificationRecord(fixture.restaurant.AccountId, "10.00", "USD", &fixture.expense.CategoryId),
		},
	})
	requireClientResponse(t, "classify unbalanced draft", err, unbalanced.StatusCode(), http.StatusOK, unbalanced.Body)
	if unbalanced.JSON200.TransactionClass != httpclient.TransactionClassSpend {
		t.Fatalf("unbalanced draft class = %q, want spend", unbalanced.JSON200.TransactionClass)
	}
	if got := unbalanced.JSON200.Records; len(got) != 2 ||
		got[0].RecordRole != httpclient.RecordRoleBalance ||
		got[1].RecordRole != httpclient.RecordRoleExpense {
		t.Fatalf("unbalanced draft roles = %+v", got)
	}
	assertDisplayAmountsEqual(
		t,
		"unbalanced draft primary amounts",
		unbalanced.JSON200.PrimaryAmounts,
		displayAmountsWithoutUSD("USD", "-10.00000000"),
	)
	if got := unbalanced.JSON200.Shapes; len(got) != 1 ||
		got[0].Shape != httpclient.TransactionShapeTypeSpend {
		t.Fatalf("unbalanced draft shapes = %+v", got)
	} else {
		assertDisplayAmountsEqual(
			t,
			"unbalanced draft shape amounts",
			got[0].Amounts,
			displayAmountsWithoutUSD("USD", "-10.00000000"),
		)
	}

	exchange, err := client.REST().ClassifyTransactionWithResponse(context.Background(), httpclient.ClassifyTransactionRequest{
		Records: []httpclient.ClassifyJournalRecordRequest{
			classificationRecord(fixture.checking.AccountId, "-110.00", "USD", nil),
			classificationRecord(fixture.exchange.AccountId, "110.00", "USD", nil),
			classificationRecord(fixture.exchange.AccountId, "-100.00", "EUR", nil),
			classificationRecord(fixture.cashEUR.AccountId, "100.00", "EUR", nil),
		},
	})
	requireClientResponse(t, "classify exchange draft", err, exchange.StatusCode(), http.StatusOK, exchange.Body)
	if got := exchange.JSON200.Shapes; len(got) != 1 ||
		got[0].Shape != httpclient.TransactionShapeTypeExchange {
		t.Fatalf("exchange draft shapes = %+v", got)
	} else {
		assertDisplayAmountsEqual(
			t,
			"exchange draft shape amounts",
			got[0].Amounts,
			[]httpclient.DisplayAmount{
				{Currency: "USD", Amount: "-110.00000000"},
				{Currency: "EUR", Amount: "100.00000000"},
			},
		)
		wantRate := &httpclient.ExchangeEffectiveRate{
			SoldCurrency:   "USD",
			BoughtCurrency: "EUR",
			Rate:           "1.10000000",
		}
		if !effectiveRatesEqual(got[0].EffectiveRate, wantRate) {
			t.Fatalf("exchange draft effective rate = %+v, want %+v", got[0].EffectiveRate, wantRate)
		}
	}

	categoryViolation, err := client.REST().ClassifyTransactionWithResponse(context.Background(), httpclient.ClassifyTransactionRequest{
		Records: []httpclient.ClassifyJournalRecordRequest{
			classificationRecord(fixture.checking.AccountId, "-10.00", "USD", &fixture.expense.CategoryId),
		},
	})
	requireClientResponse(t, "classify category violation", err, categoryViolation.StatusCode(), http.StatusBadRequest, categoryViolation.Body)

	exchangeViolation, err := client.REST().ClassifyTransactionWithResponse(context.Background(), httpclient.ClassifyTransactionRequest{
		Records: []httpclient.ClassifyJournalRecordRequest{
			classificationRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
			classificationRecord(fixture.exchange.AccountId, "10.00", "USD", nil),
		},
	})
	requireClientResponse(t, "classify exchange violation", err, exchangeViolation.StatusCode(), http.StatusBadRequest, exchangeViolation.Body)

	unbalancedExchange, err := client.REST().ClassifyTransactionWithResponse(context.Background(), httpclient.ClassifyTransactionRequest{
		Records: []httpclient.ClassifyJournalRecordRequest{
			classificationRecord(fixture.checking.AccountId, "-10.00", "USD", nil),
			classificationRecord(fixture.exchange.AccountId, "9.00", "USD", nil),
			classificationRecord(fixture.exchange.AccountId, "-8.00", "EUR", nil),
			classificationRecord(fixture.cashEUR.AccountId, "8.00", "EUR", nil),
		},
	})
	requireClientResponse(t, "classify unbalanced exchange", err, unbalancedExchange.StatusCode(), http.StatusBadRequest, unbalancedExchange.Body)
	if unbalancedExchange.JSON400 == nil || !strings.Contains(unbalancedExchange.JSON400.Error.Message, "records[") {
		t.Fatalf("unbalanced exchange error = %+v, want offending record path", unbalancedExchange.JSON400)
	}
}

func TestRecurringDefinitionDisplayAmountsHaveNoUSDValuation(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "RecurringDisplayAmountUSD")
	created := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"RecurringDisplayAmountUSD:Monthly",
		refs,
		"-12.00",
		"12.00",
		intervalRule(1, "MONTH"),
		"2024-07-01",
	))
	assertDisplayAmountsEqual(
		t,
		"date-free recurring display amounts",
		created.JSON201.DisplayAmounts,
		displayAmountsWithoutUSD("USD", "-12.00000000"),
	)
}

func TestExchangeShorthand(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	member := client.Scenario().Member("Exchange shorthand member")
	tag := client.Scenario().Tag("Exchange:Shorthand")
	memo := "Exchange optional fields"
	pendingDate := apptest.Timestamp("2024-07-04T12:00:00Z")
	postedDate := apptest.Timestamp("2024-07-05T13:00:00Z")
	reconciliationStatus := httpclient.Unreconciled

	response, err := client.REST().CreateExchangeTransactionWithResponse(context.Background(), httpclient.CreateExchangeTransactionRequest{
		InitiatedDate:   apptest.Date("2024-07-04"),
		SoldAccountId:   fixture.checking.AccountId,
		BoughtAccountId: fixture.cashEUR.AccountId,
		SoldAmount:      "110.00",
		BoughtAmount:    "100.00",
		MemberId:        &member.MemberId,
		TagIds:          apptest.Int64SlicePtr(tag.TagId),
		Memo:            &memo,
		Settlement: &httpclient.SettlementIntent{
			Status:      httpclient.SettlementStatusPosted,
			PendingDate: &pendingDate,
			PostedDate:  &postedDate,
		},
		ReconciliationStatus: &reconciliationStatus,
	})
	requireClientResponse(t, "create exchange shorthand", err, response.StatusCode(), http.StatusCreated, response.Body)
	if len(response.JSON201.Records) != 4 {
		t.Fatalf("exchange shorthand records = %d, want 4", len(response.JSON201.Records))
	}
	for _, record := range response.JSON201.Records {
		if record.MemberId == nil || *record.MemberId != member.MemberId {
			t.Fatalf("member_id = %v, want %d", record.MemberId, member.MemberId)
		}
		assertInt64s(t, record.TagIds, []int64{tag.TagId})
		if record.Memo == nil || *record.Memo != memo {
			t.Fatalf("memo = %v, want %q", record.Memo, memo)
		}
		if record.Settlement != nil {
			if *record.Settlement != httpclient.SettlementStatusPosted || record.PendingDate == nil || !record.PendingDate.Equal(pendingDate) || record.PostedDate == nil || !record.PostedDate.Equal(postedDate) {
				t.Fatalf("balance settlement/pending_date/posted_date = %v/%v/%v, want posted/%v/%v", record.Settlement, record.PendingDate, record.PostedDate, pendingDate, postedDate)
			}
		} else if record.PendingDate != nil || record.PostedDate != nil {
			t.Fatalf("system record pending_date/posted_date = %v/%v, want nil/nil", record.PendingDate, record.PostedDate)
		}
		if record.ReconciliationStatus != reconciliationStatus {
			t.Fatalf("reconciliation_status = %q, want %q", record.ReconciliationStatus, reconciliationStatus)
		}
	}
	assertDerivedTransaction(t, *response.JSON201, workedExample{
		class:        httpclient.TransactionClassCurrencyExchange,
		displayTitle: "checking:Joint ($) → Travel:EUR (€)",
		shapes: []expectedShape{{
			shape: httpclient.TransactionShapeTypeExchange,
			amounts: []httpclient.DisplayAmount{
				{Currency: "USD", Amount: "-110.00000000", AmountUsd: apptest.StringPtr("-110.00000000")},
				{Currency: "EUR", Amount: "100.00000000"},
			},
			effectiveRate: &httpclient.ExchangeEffectiveRate{
				SoldCurrency:   "USD",
				BoughtCurrency: "EUR",
				Rate:           "1.10000000",
			},
		}},
		roles: []httpclient.RecordRole{
			httpclient.RecordRoleBalance,
			httpclient.RecordRoleExchange,
			httpclient.RecordRoleExchange,
			httpclient.RecordRoleBalance,
		},
	})
}

func TestExchangeShorthandRejectsRateRoundedToZero(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)

	response, err := client.REST().CreateExchangeTransactionWithResponse(context.Background(), httpclient.CreateExchangeTransactionRequest{
		InitiatedDate:   apptest.Date("2024-07-04"),
		SoldAccountId:   fixture.checking.AccountId,
		BoughtAccountId: fixture.cashEUR.AccountId,
		SoldAmount:      "0.00000001",
		BoughtAmount:    "9999999999",
	})
	requireClientResponse(t, "reject exchange rate rounded to zero", err, response.StatusCode(), http.StatusBadRequest, response.Body)
	if response.JSON400 == nil || !strings.Contains(response.JSON400.Error.Message, "below supported decimal precision") {
		t.Fatalf("zero exchange rate error = %+v, want supported precision message", response.JSON400)
	}
}

func TestExchangeShorthandSingleAndMultiCurrencyCombinations(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	singleUSD := scenario.AccountWithCurrency("exchange:single:USD", "USD")
	singleEUR := scenario.AccountWithCurrency("exchange:single:EUR", "EUR")
	multiSold := scenario.AccountWithType("exchange:multi:sold", httpclient.WritableAccountTypeOwned)
	multiBought := scenario.AccountWithType("exchange:multi:bought", httpclient.WritableAccountTypeOwned)

	successes := []struct {
		name           string
		soldAccount    int64
		boughtAccount  int64
		soldCurrency   *string
		boughtCurrency *string
		wantSold       string
		wantBought     string
	}{
		{name: "single to single", soldAccount: singleUSD.AccountId, boughtAccount: singleEUR.AccountId, wantSold: "USD", wantBought: "EUR"},
		{name: "multi to single", soldAccount: multiSold.AccountId, boughtAccount: singleEUR.AccountId, soldCurrency: apptest.StringPtr("USD"), wantSold: "USD", wantBought: "EUR"},
		{name: "single to multi", soldAccount: singleUSD.AccountId, boughtAccount: multiBought.AccountId, boughtCurrency: apptest.StringPtr("EUR"), wantSold: "USD", wantBought: "EUR"},
		{name: "multi to multi", soldAccount: multiSold.AccountId, boughtAccount: multiBought.AccountId, soldCurrency: apptest.StringPtr("USD"), boughtCurrency: apptest.StringPtr("EUR"), wantSold: "USD", wantBought: "EUR"},
	}
	for _, testCase := range successes {
		t.Run(testCase.name, func(t *testing.T) {
			response, err := client.REST().CreateExchangeTransactionWithResponse(
				context.Background(),
				httpclient.CreateExchangeTransactionRequest{
					BoughtAccountId: testCase.boughtAccount,
					BoughtAmount:    "100.00",
					BoughtCurrency:  testCase.boughtCurrency,
					InitiatedDate:   apptest.Date("2024-07-07"),
					SoldAccountId:   testCase.soldAccount,
					SoldAmount:      "110.00",
					SoldCurrency:    testCase.soldCurrency,
				},
			)
			requireClientResponse(t, "create exchange combination", err, response.StatusCode(), http.StatusCreated, response.Body)
			if len(response.JSON201.Records) != 4 {
				t.Fatalf("exchange combination records = %d, want 4", len(response.JSON201.Records))
			}
			for accountID, wantCurrency := range map[int64]string{
				testCase.soldAccount:   testCase.wantSold,
				testCase.boughtAccount: testCase.wantBought,
			} {
				matched := false
				for _, record := range response.JSON201.Records {
					if record.AccountId != accountID {
						continue
					}
					matched = true
					if record.Currency != wantCurrency {
						t.Fatalf("account %d record currency = %q, want %q", accountID, record.Currency, wantCurrency)
					}
				}
				if !matched {
					t.Fatalf("exchange combination has no record for account %d", accountID)
				}
			}
		})
	}

	failures := []struct {
		name    string
		request httpclient.CreateExchangeTransactionRequest
	}{
		{
			name: "multi side requires explicit currency",
			request: httpclient.CreateExchangeTransactionRequest{
				BoughtAccountId: singleEUR.AccountId,
				BoughtAmount:    "100.00",
				InitiatedDate:   apptest.Date("2024-07-07"),
				SoldAccountId:   multiSold.AccountId,
				SoldAmount:      "110.00",
			},
		},
		{
			name: "explicit currency must match single account",
			request: httpclient.CreateExchangeTransactionRequest{
				BoughtAccountId: singleEUR.AccountId,
				BoughtAmount:    "100.00",
				InitiatedDate:   apptest.Date("2024-07-07"),
				SoldAccountId:   singleUSD.AccountId,
				SoldAmount:      "110.00",
				SoldCurrency:    apptest.StringPtr("EUR"),
			},
		},
		{
			name: "resolved currencies must differ",
			request: httpclient.CreateExchangeTransactionRequest{
				BoughtAccountId: multiBought.AccountId,
				BoughtAmount:    "100.00",
				BoughtCurrency:  apptest.StringPtr("USD"),
				InitiatedDate:   apptest.Date("2024-07-07"),
				SoldAccountId:   singleUSD.AccountId,
				SoldAmount:      "110.00",
			},
		},
	}
	for _, testCase := range failures {
		t.Run(testCase.name, func(t *testing.T) {
			response, err := client.REST().CreateExchangeTransactionWithResponse(context.Background(), testCase.request)
			requireClientResponse(t, "reject exchange combination", err, response.StatusCode(), http.StatusBadRequest, response.Body)
		})
	}
}

func TestExchangeShorthandRejectsInvalidAccounts(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	tests := []struct {
		name            string
		soldAccountID   int64
		boughtAccountID int64
		message         string
	}{
		{
			name:            "same account",
			soldAccountID:   fixture.checking.AccountId,
			boughtAccountID: fixture.checking.AccountId,
			message:         "must be positive and differ",
		},
		{
			name:            "flow account",
			soldAccountID:   fixture.restaurant.AccountId,
			boughtAccountID: fixture.cashEUR.AccountId,
			message:         "must be owned or party accounts",
		},
		{
			name:            "same currency",
			soldAccountID:   fixture.checking.AccountId,
			boughtAccountID: fixture.savings.AccountId,
			message:         "must differ",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response, err := client.REST().CreateExchangeTransactionWithResponse(
				context.Background(),
				httpclient.CreateExchangeTransactionRequest{
					InitiatedDate:   apptest.Date("2024-07-06"),
					SoldAccountId:   test.soldAccountID,
					BoughtAccountId: test.boughtAccountID,
					SoldAmount:      "110.00",
					BoughtAmount:    "100.00",
				},
			)
			requireClientResponse(t, "reject exchange shorthand", err, response.StatusCode(), http.StatusBadRequest, response.Body)
			if response.JSON400 == nil || !strings.Contains(response.JSON400.Error.Message, test.message) {
				t.Fatalf("exchange shorthand error = %+v, want %q", response.JSON400, test.message)
			}
		})
	}
}

func newSemanticFixture(t *testing.T, client *apptest.Client) *semanticFixture {
	t.Helper()
	scenario := client.Scenario()
	systems := fixedSystemAccounts(t, client)
	employer := scenario.AccountWithDisplayLabel(
		"employers:Acme:payroll",
		"Acme Payroll",
		httpclient.WritableAccountTypeFlow,
	)

	return &semanticFixture{
		checking:        scenario.AccountWithCurrency("banks:Chase:checking:Joint", "USD"),
		savings:         scenario.AccountWithCurrency("banks:Ally:savings:Emergency", "USD"),
		card:            scenario.AccountWithCurrency("banks:Chase:credit_card:Sapphire", "USD"),
		cash:            scenario.AccountWithCurrency("cash:Wallet", "USD"),
		cashEUR:         scenario.AccountWithCurrency("cash:Travel:EUR", "EUR"),
		jordan:          scenario.AccountWithType("people:Jordan:balance", httpclient.WritableAccountTypeParty),
		employerBalance: scenario.AccountWithType("employers:Acme:balance", httpclient.WritableAccountTypeParty),
		restaurant:      scenario.AccountWithType("merchants:Restaurant:Local", httpclient.WritableAccountTypeFlow),
		mortgageBank:    scenario.AccountWithType("banks:FannieMay", httpclient.WritableAccountTypeFlow),
		supermarket:     scenario.AccountWithType("merchants:Supermarket", httpclient.WritableAccountTypeFlow),
		fees:            scenario.AccountWithType("banks:Chase:fees", httpclient.WritableAccountTypeFlow),
		interest:        scenario.AccountWithType("banks:Chase:interest", httpclient.WritableAccountTypeFlow),
		employer:        employer,
		lisbon:          scenario.AccountWithType("merchants:Travel:Dining:Lisbon", httpclient.WritableAccountTypeFlow),
		merchantA:       scenario.AccountWithType("merchants:Market:A", httpclient.WritableAccountTypeFlow),
		exchange:        systems["system:exchange"],
		openingBalance:  systems["system:opening_balance"],
		correction:      systems["system:correction"],
		expense:         scenario.CategoryWithIntent("Food:Restaurants", httpclient.CategoryEconomicIntentExpense),
		groceries:       scenario.CategoryWithIntent("Food:Groceries", httpclient.CategoryEconomicIntentExpense),
		feesCategory:    scenario.CategoryWithIntent("Banking:Fees", httpclient.CategoryEconomicIntentExpense),
		travel:          scenario.CategoryWithIntent("Travel:Dining", httpclient.CategoryEconomicIntentExpense),
		mortgage: [4]httpclient.Category{
			scenario.CategoryWithIntent("Housing:Mortgage:Principal", httpclient.CategoryEconomicIntentExpense),
			scenario.CategoryWithIntent("Housing:Mortgage:Interest", httpclient.CategoryEconomicIntentExpense),
			scenario.CategoryWithIntent("Housing:Insurance", httpclient.CategoryEconomicIntentExpense),
			scenario.CategoryWithIntent("Housing:Mortgage:Servicing", httpclient.CategoryEconomicIntentExpense),
		},
		interestIncome: scenario.CategoryWithIntent("Banking:Interest", httpclient.CategoryEconomicIntentIncome),
		salary:         scenario.CategoryWithIntent("Income:Salary", httpclient.CategoryEconomicIntentIncome),
		bonus:          scenario.CategoryWithIntent("Income:Bonus", httpclient.CategoryEconomicIntentIncome),
	}
}

func fixedSystemAccounts(t *testing.T, client *apptest.Client) map[string]httpclient.Account {
	t.Helper()
	accountType := httpclient.AccountTypeSystem
	response, err := client.REST().ListAccountsWithResponse(context.Background(), &httpclient.ListAccountsParams{
		AccountType: accountTypes(accountType),
	})
	requireClientResponse(t, "list fixed system accounts", err, response.StatusCode(), http.StatusOK, response.Body)
	accounts := make(map[string]httpclient.Account, len(response.JSON200.Accounts))
	for _, account := range response.JSON200.Accounts {
		accounts[account.Fqn] = account
	}
	return accounts
}

func semanticRecord(accountID int64, amount string, currency string, categoryID *int64) httpclient.CreateJournalRecordRequest {
	record := httpclient.CreateJournalRecordRequest{
		AccountId:            accountID,
		Amount:               amount,
		CategoryId:           categoryID,
		Currency:             currency,
		ReconciliationStatus: httpclient.Reconciled,
		Source:               httpclient.WritableSourceManual,
	}
	if categoryID == nil {
		record.Settlement = apptest.PostedSettlement()
	}
	return record
}

func semanticRecordWithoutSettlement(accountID int64, amount string, currency string, categoryID *int64) httpclient.CreateJournalRecordRequest {
	record := semanticRecord(accountID, amount, currency, categoryID)
	record.Settlement = nil
	return record
}

func classificationRecord(accountID int64, amount string, currency string, categoryID *int64) httpclient.ClassifyJournalRecordRequest {
	return httpclient.ClassifyJournalRecordRequest{
		AccountId:  accountID,
		Amount:     amount,
		CategoryId: categoryID,
		Currency:   currency,
	}
}

func displayAmounts(currency string, amount string) []httpclient.DisplayAmount {
	return displayAmountsWithUSD(currency, amount, amount)
}

func displayAmountsWithUSD(currency string, amount string, amountUSD string) []httpclient.DisplayAmount {
	return []httpclient.DisplayAmount{{Currency: currency, Amount: amount, AmountUsd: apptest.StringPtr(amountUSD)}}
}

func displayAmountsWithoutUSD(currency string, amount string) []httpclient.DisplayAmount {
	return []httpclient.DisplayAmount{{Currency: currency, Amount: amount}}
}

func assertDerivedTransaction(t *testing.T, transaction httpclient.Transaction, want workedExample) {
	t.Helper()
	if transaction.TransactionClass != want.class {
		t.Fatalf("class = %q, want %q; transaction %+v", transaction.TransactionClass, want.class, transaction)
	}
	if want.displayTitle != "" {
		assertTransactionDisplayTitle(t, "derived transaction", transaction, want.displayTitle)
	}
	assertDisplayAmountsEqual(t, "primary amounts", transaction.PrimaryAmounts, want.primaryAmounts)
	if len(transaction.Shapes) != len(want.shapes) {
		t.Fatalf("shapes = %+v, want %+v", transaction.Shapes, want.shapes)
	}
	shapesByType := make(map[httpclient.TransactionShapeType]httpclient.TransactionShape, len(transaction.Shapes))
	for _, shape := range transaction.Shapes {
		if _, duplicate := shapesByType[shape.Shape]; duplicate {
			t.Fatalf("duplicate shape %q in %+v", shape.Shape, transaction.Shapes)
		}
		shapesByType[shape.Shape] = shape
	}
	for _, expected := range want.shapes {
		shape, ok := shapesByType[expected.shape]
		if !ok {
			t.Fatalf("missing shape %q in %+v", expected.shape, transaction.Shapes)
		}
		assertDisplayAmountsEqual(t, "shape amounts", shape.Amounts, expected.amounts)
		if !effectiveRatesEqual(shape.EffectiveRate, expected.effectiveRate) {
			t.Fatalf("shape %q effective rate = %+v, want %+v", shape.Shape, shape.EffectiveRate, expected.effectiveRate)
		}
	}
	if len(transaction.Records) != len(want.roles) {
		t.Fatalf("records = %d, want roles %d", len(transaction.Records), len(want.roles))
	}
	for index, role := range want.roles {
		if transaction.Records[index].RecordRole != role {
			t.Fatalf("record[%d] role = %q, want %q", index, transaction.Records[index].RecordRole, role)
		}
	}
}

func assertTransactionClass(t *testing.T, label string, transaction httpclient.Transaction, want httpclient.TransactionClass) {
	t.Helper()
	if transaction.TransactionClass != want {
		t.Fatalf("%s class = %q, want %q", label, transaction.TransactionClass, want)
	}
}

func assertTransactionDisplayTitle(t *testing.T, label string, transaction httpclient.Transaction, want string) {
	t.Helper()
	if transaction.DisplayTitle != want {
		t.Fatalf("%s display title = %q, want %q", label, transaction.DisplayTitle, want)
	}
}

func assertDisplayAmountsEqual(t *testing.T, label string, got, want []httpclient.DisplayAmount) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %+v, want %+v", label, got, want)
	}
	for index := range want {
		if got[index].Currency != want[index].Currency ||
			got[index].Amount != want[index].Amount ||
			!stringPointersEqual(got[index].AmountUsd, want[index].AmountUsd) {
			t.Fatalf("%s[%d] = %+v, want %+v", label, index, got[index], want[index])
		}
	}
}

func stringPointersEqual(got, want *string) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

func effectiveRatesEqual(got, want *httpclient.ExchangeEffectiveRate) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

func twoDigits(value int) string {
	if value < 10 {
		return "0" + string(rune('0'+value))
	}
	return string([]byte{byte('0' + value/10), byte('0' + value%10)})
}

// classificationFixture keeps the list and aggregate tests readable while their
// assertions are restated around the new derived semantics.
type classificationFixture struct {
	checking         httpclient.Account
	savings          httpclient.Account
	cashEUR          httpclient.Account
	merchant         httpclient.Account
	feeProvider      httpclient.Account
	employer         httpclient.Account
	exchangeProvider httpclient.Account
	openingSystem    httpclient.Account
	correctionSystem httpclient.Account
	expenseCategory  httpclient.Category
	feeCategory      httpclient.Category
	refundCategory   httpclient.Category
	incomeCategory   httpclient.Category
}

func newClassificationFixture(t *testing.T, client *apptest.Client) classificationFixture {
	t.Helper()
	fixture := newSemanticFixture(t, client)
	return classificationFixture{
		checking:         fixture.checking,
		savings:          fixture.savings,
		cashEUR:          fixture.cashEUR,
		merchant:         fixture.merchantA,
		feeProvider:      fixture.fees,
		employer:         fixture.employer,
		exchangeProvider: fixture.exchange,
		openingSystem:    fixture.openingBalance,
		correctionSystem: fixture.correction,
		expenseCategory:  fixture.expense,
		feeCategory:      fixture.feesCategory,
		refundCategory:   fixture.groceries,
		incomeCategory:   fixture.salary,
	}
}

func record(accountID, categoryID int64, currency, amount string) httpclient.CreateJournalRecordRequest {
	return semanticRecord(accountID, amount, currency, apptest.Int64Ptr(categoryID))
}

func balanceRecord(accountID int64, currency, amount string) httpclient.CreateJournalRecordRequest {
	return semanticRecord(accountID, amount, currency, nil)
}

func classificationRequest(records ...httpclient.CreateJournalRecordRequest) httpclient.CreateTransactionRequest {
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-01-01"),
		Records:       records,
	}
}

func transferClassificationRequest(fixture classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(
		semanticRecord(fixture.checking.AccountId, "-50.00", "USD", nil),
		semanticRecord(fixture.savings.AccountId, "50.00", "USD", nil),
	)
}

func exchangeClassificationRequest(fixture classificationFixture) httpclient.CreateTransactionRequest {
	return classificationRequest(
		semanticRecord(fixture.checking.AccountId, "-110.00", "USD", nil),
		semanticRecordWithoutSettlement(fixture.exchangeProvider.AccountId, "110.00", "USD", nil),
		semanticRecordWithoutSettlement(fixture.exchangeProvider.AccountId, "-100.00", "EUR", nil),
		semanticRecord(fixture.cashEUR.AccountId, "100.00", "EUR", nil),
	)
}

func createDatedClassificationTransaction(
	t *testing.T,
	client *apptest.Client,
	date string,
	request httpclient.CreateTransactionRequest,
) *httpclient.CreateTransactionResponse {
	t.Helper()
	request.InitiatedDate = apptest.Date(date)
	response, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	requireClientResponse(t, "create dated classification transaction", err, response.StatusCode(), http.StatusCreated, response.Body)
	return response
}
