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
					semanticRecord(f.exchange.AccountId, "330.00", "USD", nil),
					semanticRecord(f.exchange.AccountId, "-300.00", "EUR", nil),
					semanticRecord(f.cashEUR.AccountId, "300.00", "EUR", nil),
				}
			},
			class:        httpclient.TransactionClassCurrencyExchange,
			displayTitle: "USD → EUR",
			shapes: []expectedShape{{
				shape: httpclient.TransactionShapeTypeExchange,
				amounts: []httpclient.DisplayAmount{
					{Currency: "USD", Amount: "-330.00000000"},
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
			name: "purchase abroad is ordinary spend",
			records: func(f *semanticFixture) []httpclient.CreateJournalRecordRequest {
				return []httpclient.CreateJournalRecordRequest{
					semanticRecord(f.cashEUR.AccountId, "-60.00", "EUR", nil),
					semanticRecord(f.lisbon.AccountId, "60.00", "EUR", &f.travel.CategoryId),
				}
			},
			class:          httpclient.TransactionClassSpend,
			primaryAmounts: displayAmounts("EUR", "-60.00000000"),
			shapes:         []expectedShape{{shape: httpclient.TransactionShapeTypeSpend, amounts: displayAmounts("EUR", "-60.00000000")}},
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
			displayTitle: "payroll",
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
					semanticRecord(f.openingBalance.AccountId, "-1000.00", "USD", nil),
				}
			},
			class:          httpclient.TransactionClassAdjustment,
			displayTitle:   "Joint",
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
			{Currency: "USD", Amount: "-10.00000000"},
			{Currency: "EUR", Amount: "-9.00000000"},
		},
		shapes: []expectedShape{{
			shape: httpclient.TransactionShapeTypeSpend,
			amounts: []httpclient.DisplayAmount{
				{Currency: "USD", Amount: "-10.00000000"},
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
				semanticRecord(fixture.cash.AccountId, "-1.00", "JPY", nil),
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
		displayAmounts("USD", "-10.00000000"),
	)
	if got := unbalanced.JSON200.Shapes; len(got) != 1 ||
		got[0].Shape != httpclient.TransactionShapeTypeSpend {
		t.Fatalf("unbalanced draft shapes = %+v", got)
	} else {
		assertDisplayAmountsEqual(
			t,
			"unbalanced draft shape amounts",
			got[0].Amounts,
			displayAmounts("USD", "-10.00000000"),
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

func TestExchangeShorthand(t *testing.T) {
	client := newSharedClient(t)
	fixture := newSemanticFixture(t, client)
	member := client.Scenario().Member("Exchange shorthand member")
	tag := client.Scenario().Tag("Exchange:Shorthand")
	memo := "Exchange optional fields"
	pendingDate := apptest.Timestamp("2024-07-04T12:00:00Z")
	postedDate := apptest.Timestamp("2024-07-05T13:00:00Z")
	postingStatus := httpclient.PostingStatusPending
	reconciliationStatus := httpclient.Unreconciled

	response, err := client.REST().CreateExchangeTransactionWithResponse(context.Background(), httpclient.CreateExchangeTransactionRequest{
		InitiatedDate:        apptest.Date("2024-07-04"),
		SoldAccountId:        fixture.checking.AccountId,
		BoughtAccountId:      fixture.cashEUR.AccountId,
		SoldAmount:           "110.00",
		BoughtAmount:         "100.00",
		MemberId:             &member.MemberId,
		TagIds:               apptest.Int64SlicePtr(tag.TagId),
		Memo:                 &memo,
		PendingDate:          &pendingDate,
		PostedDate:           &postedDate,
		PostingStatus:        &postingStatus,
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
		if !record.PendingDate.Equal(pendingDate) {
			t.Fatalf("pending_date = %v, want %v", record.PendingDate, pendingDate)
		}
		if record.PostedDate == nil || !record.PostedDate.Equal(postedDate) {
			t.Fatalf("posted_date = %v, want %v", record.PostedDate, postedDate)
		}
		if record.PostingStatus != postingStatus {
			t.Fatalf("posting_status = %q, want %q", record.PostingStatus, postingStatus)
		}
		if record.ReconciliationStatus != reconciliationStatus {
			t.Fatalf("reconciliation_status = %q, want %q", record.ReconciliationStatus, reconciliationStatus)
		}
	}
	assertDerivedTransaction(t, *response.JSON201, workedExample{
		class: httpclient.TransactionClassCurrencyExchange,
		shapes: []expectedShape{{
			shape: httpclient.TransactionShapeTypeExchange,
			amounts: []httpclient.DisplayAmount{
				{Currency: "USD", Amount: "-110.00000000"},
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
			message:         "must have two distinct currencies",
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
		employer:        scenario.AccountWithType("employers:Acme:payroll", httpclient.WritableAccountTypeFlow),
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
		AccountType: &accountType,
	})
	requireClientResponse(t, "list fixed system accounts", err, response.StatusCode(), http.StatusOK, response.Body)
	accounts := make(map[string]httpclient.Account, len(response.JSON200.Accounts))
	for _, account := range response.JSON200.Accounts {
		accounts[account.Fqn] = account
	}
	return accounts
}

func semanticRecord(accountID int64, amount string, currency string, categoryID *int64) httpclient.CreateJournalRecordRequest {
	return httpclient.CreateJournalRecordRequest{
		AccountId:            accountID,
		Amount:               amount,
		CategoryId:           categoryID,
		Currency:             currency,
		PostingStatus:        httpclient.PostingStatusPosted,
		ReconciliationStatus: httpclient.Reconciled,
		Source:               httpclient.WritableSourceManual,
	}
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
		if got[index] != want[index] {
			t.Fatalf("%s[%d] = %+v, want %+v", label, index, got[index], want[index])
		}
	}
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
		semanticRecord(fixture.exchangeProvider.AccountId, "110.00", "USD", nil),
		semanticRecord(fixture.exchangeProvider.AccountId, "-100.00", "EUR", nil),
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
