package runtime_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionSemanticAmountFilters(t *testing.T) {
	client := newSharedClient(t)
	f := newSemanticFixture(t, client)
	split := []httpclient.CreateJournalRecordRequest{semanticRecord(f.checking.AccountId, "-100", "USD", nil)}
	for range 10 {
		split = append(split, semanticRecord(f.restaurant.AccountId, "10", "USD", &f.expense.CategoryId))
	}
	// One category contribution must not replace the complete spend candidate.
	split[1].CategoryId = &f.groceries.CategoryId
	usdOverflow := []httpclient.CreateJournalRecordRequest{
		semanticRecord(f.cashEUR.AccountId, "-2", "EUR", nil),
		semanticRecord(f.restaurant.AccountId, "1", "EUR", &f.expense.CategoryId),
		semanticRecord(f.restaurant.AccountId, "1", "EUR", &f.expense.CategoryId),
	}
	for i := range usdOverflow {
		usdOverflow[i].AmountUsd = apptest.StringPtr("6000000000")
	}
	converted := []httpclient.CreateJournalRecordRequest{
		semanticRecord(f.cashEUR.AccountId, "-19.5", "EUR", nil), semanticRecord(f.restaurant.AccountId, "19.5", "EUR", &f.expense.CategoryId),
	}
	converted[0].AmountUsd = apptest.StringPtr("-25")
	converted[1].AmountUsd = apptest.StringPtr("25")
	partial := []httpclient.CreateJournalRecordRequest{
		semanticRecord(f.cashEUR.AccountId, "-19.5", "EUR", nil), semanticRecord(f.restaurant.AccountId, "9.75", "EUR", &f.expense.CategoryId), semanticRecord(f.restaurant.AccountId, "9.75", "EUR", &f.expense.CategoryId),
	}
	partial[1].AmountUsd = apptest.StringPtr("9.75")

	intermediateOverflow := []httpclient.CreateJournalRecordRequest{
		semanticRecord(f.cashEUR.AccountId, "-1", "EUR", nil), semanticRecordWithoutSettlement(f.correction.AccountId, "1", "EUR", nil), semanticRecordWithoutSettlement(f.correction.AccountId, "1", "EUR", nil), semanticRecordWithoutSettlement(f.correction.AccountId, "-1", "EUR", nil),
	}
	intermediateOverflow[1].AmountUsd = apptest.StringPtr("6000000000")
	intermediateOverflow[2].AmountUsd = apptest.StringPtr("6000000000")
	intermediateOverflow[3].AmountUsd = apptest.StringPtr("-6000000000")

	examples := []struct {
		name    string
		records []httpclient.CreateJournalRecordRequest
		yes, no []string
	}{
		{"income", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "19.50", "USD", nil), semanticRecord(f.employer.AccountId, "-19.50", "USD", &f.salary.CategoryId),
		}, []string{"amount=19..20", "amount=19..20USD", "amount_usd=19..20", "amount>19 and amount<20", "amount>=19.5", "amount<=19.5", "amount=19.5..19.5", "not amount=20"}, []string{"amount=18", "amount=100", "amount>19.5", "amount<19.5", "not amount=19..20"}},
		{"income outside low", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "18", "USD", nil), semanticRecord(f.employer.AccountId, "-18", "USD", &f.salary.CategoryId),
		}, []string{"amount=18"}, []string{"amount=19..20"}},
		{"income outside high", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "100", "USD", nil), semanticRecord(f.employer.AccountId, "-100", "USD", &f.salary.CategoryId),
		}, []string{"amount=100"}, []string{"amount=19..20"}},
		{"converted currency", converted, []string{"currency:EUR and amount=19..20", "currency:EUR and amount_usd=25", "amount_usd=25..25"}, []string{"amount_usd=19..20", "currency:USD and amount_usd=25"}},
		{"partial USD", partial, []string{"amount=19..20", "not amount_usd>=0"}, []string{"amount_usd>=0", "amount_usd=9.75"}},

		{"split spend", split, []string{"amount=100", "amount=100USD", "amount_usd=100", `category:"Food:Groceries" and amount=100USD`, "role:balance and amount=100USD"}, []string{"amount=10", "amount=10USD", "amount=19..20", "amount=100EUR"}},
		{"spend and lending", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "-72", "USD", nil), semanticRecord(f.restaurant.AccountId, "54", "USD", &f.expense.CategoryId), semanticRecord(f.jordan.AccountId, "18", "USD", nil),
		}, []string{"amount=54", "amount=18", "amount_usd=18", "shape:spend and amount=18"}, []string{"amount=72"}},
		{"independent bounds", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "-110", "USD", nil), semanticRecord(f.restaurant.AccountId, "100", "USD", &f.expense.CategoryId), semanticRecord(f.jordan.AccountId, "10", "USD", nil),
		}, []string{"amount>19 and amount<20", "(amount>=19 and amount<=20)", "amount_usd>19 and amount_usd<20", "not amount=19..20"}, []string{"amount=19..20", "amount_usd=19..20", "amount=110"}},
		{"spend and refund", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "-80", "USD", nil), semanticRecord(f.restaurant.AccountId, "100", "USD", &f.expense.CategoryId), semanticRecord(f.supermarket.AccountId, "-20", "USD", &f.groceries.CategoryId),
		}, []string{"amount=100", "amount=20", "amount_usd=20"}, []string{"amount=80", "amount=120"}},
		{"exchange", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "-100", "USD", nil), semanticRecordWithoutSettlement(f.exchange.AccountId, "100", "USD", nil), semanticRecord(f.cashEUR.AccountId, "19.5", "EUR", nil), semanticRecordWithoutSettlement(f.exchange.AccountId, "-19.5", "EUR", nil),
		}, []string{"amount=100", "amount=19..20", "amount=100USD", "amount=19..20EUR", "amount=19.5eur", "amount>19EUR and amount<20EUR", "currency:USD and amount=19..20", "currency:EUR and amount_usd=100", "currency:USD and currency:EUR and amount=19..20EUR", "(amount=19..20EUR or amount=100USD)", "not amount=19..20USD", "not currency:GBP and amount=19..20EUR"}, []string{"amount=19..20USD", "amount=100EUR", "amount=19..20GBP", "currency:USD and not amount=19..20", "currency:EUR and not amount=19..20EUR", "not currency:EUR and amount=100USD"}},
		{"party transfer net zero", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.jordan.AccountId, "10", "USD", nil), semanticRecord(f.employerBalance.AccountId, "-10", "USD", nil),
		}, []string{"amount=0", "amount_usd=0", "amount=0..0"}, []string{"amount=10"}},
		{"adjustment", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "19.5", "USD", nil), semanticRecordWithoutSettlement(f.correction.AccountId, "-19.5", "USD", nil),
		}, []string{"amount=19..20", "amount_usd=19..20"}, []string{"amount=18"}},
		{"missing USD", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.cashEUR.AccountId, "-19.5", "EUR", nil), semanticRecord(f.restaurant.AccountId, "19.5", "EUR", &f.expense.CategoryId),
		}, []string{"amount=19..20", "amount=19..20EUR", "not amount_usd=0..100", "not amount_usd>=0"}, []string{"amount_usd>=0", "amount_usd=0..100"}},
		{"crypto suffix", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.jordan.AccountId, "-0.1", "C::BTC", nil), semanticRecord(f.restaurant.AccountId, "0.1", "C::BTC", &f.expense.CategoryId),
		}, []string{`amount="0.1C::BTC"`, `amount="0.09..0.11C::BTC"`, `amount="0.1c::BTC"`, `not amount="0.1C::ETH"`}, []string{"amount=0.1USD", `amount="0.1C::btc"`}},

		{"intermediate USD overflow", intermediateOverflow, []string{"amount=1", "not amount_usd>=0"}, []string{"amount_usd=6000000000"}},

		{"USD overflow", usdOverflow, []string{"amount=2", "not amount_usd>=0", "not amount_usd=0..9999999999"}, []string{"amount_usd>=0", "amount_usd=6000000000"}},
		{"decimal precision", []httpclient.CreateJournalRecordRequest{
			semanticRecord(f.checking.AccountId, "-19.00000001", "USD", nil), semanticRecord(f.restaurant.AccountId, "19.00000001", "USD", &f.expense.CategoryId),
		}, []string{"amount=19.00000001..19.00000002", "amount=19.00000001..19.00000002USD", "amount>19"}, []string{"amount=19", "amount=19..19.00000000"}},
	}
	for i, example := range examples {
		t.Run(example.name, func(t *testing.T) {
			date := fmt.Sprintf("2024-06-%02d", i+1)
			transaction := createTransaction(t, client, httpclient.CreateTransactionRequest{InitiatedDate: apptest.Date(date), Records: example.records}).JSON201
			prefix := "initiated=" + date + " and ("
			for _, expression := range example.yes {
				assertDSLFilterResult(t, client, prefix+expression+")", []int64{transaction.TransactionId}, 1)
			}
			for _, expression := range example.no {
				assertDSLFilterResult(t, client, prefix+expression+")", nil, 0)
			}
		})
	}
	// The standing Income dropdown combines with the interval before counting.
	classes := []httpclient.TransactionClass{httpclient.TransactionClassIncome}
	income, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: apptest.StringPtr("amount=19..20"), TransactionClass: &classes})
	requireNoTransportError(t, "income amount range", err)
	if income.StatusCode() != http.StatusOK || income.JSON200.TotalCount != 1 {
		t.Fatalf("income range: %s", income.Body)
	}
}

func TestTransactionAmountFilterValidation(t *testing.T) {
	client := newSharedClient(t)
	for _, expression := range []string{"amount=-1", "amount=-0", "amount_usd>-1", "amount=..20", "amount=19..", "amount=19...20", "amount=19..20..21", "amount=20..19", "amount=-1..20", "amount=19..-20", "amount=19..abc", "amount>19..20", "amount=10000000000", "amount=0.000000001", "amount_usd=0..10000000000", "initiated=19..20", "amount=50US", "amount=50USDX", "amount=50ZZZ", "amount=19USD..20USD", "amount=19..20USD..21", "amount_usd=50USD", `amount="50 USD"`, `amount="50C::"`, "amount=-1USD", "amount=20..19USD", "amount=10000000000USD", "amount=0.000000001EUR"} {
		t.Run(expression, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &expression})
			requireNoTransportError(t, "invalid amount filter", err)
			if response.StatusCode() != http.StatusBadRequest || response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
				t.Fatalf("invalid amount filter: %d %s", response.StatusCode(), response.Body)
			}
		})
	}
}

func TestTransactionAmountFilterProjectionCurrencySuffix(t *testing.T) {
	clock := apptest.NewFakeClock(apptest.Timestamp("2024-03-12T12:00:00Z"))
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "AmountProjectionCurrency")
	eurAccount := client.Scenario().AccountWithCurrency("AmountProjectionCurrency:EUR", "EUR")
	request := recurringDefinitionRequest("AmountProjectionCurrency:Daily", refs, "-100", "100", intervalRule(1, "DAY"), "2024-03-11")
	records := *request.Records
	eurFunding, eurSpending := records[0], records[1]
	eurFunding.AccountId = &eurAccount.AccountId
	eurFunding.Currency, eurFunding.Amount = apptest.StringPtr("EUR"), apptest.StringPtr("-19.5")
	eurSpending.Currency, eurSpending.Amount = apptest.StringPtr("EUR"), apptest.StringPtr("19.5")
	records = append(records, eurFunding, eurSpending)
	request.Records = &records
	createRecurringDefinition(t, client, request)
	runRecurringCatchUp(t, client)
	through := apptest.Date("2024-03-14")
	for _, example := range []struct {
		expression string
		count      int64
	}{
		{"amount=19..20EUR", 4},
		{"amount=19..20USD", 0},
		{"amount=100USD", 4}, {"currency:USD and amount=19..20", 4}, {"currency:EUR and amount=100USD", 4},
		{"amount=100EUR", 0}, {"not amount=19..20USD", 4}, {"currency:USD and not amount=19..20EUR", 0},
	} {
		t.Run(example.expression, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &example.expression, AnchorDate: &through, Offset: ptrTo(0), Limit: ptrTo(50)})
			requireNoTransportError(t, "currency-filtered projections", err)
			if response.StatusCode() != http.StatusOK || response.JSON200.TotalCount != example.count || len(response.JSON200.Transactions) != int(example.count) {
				t.Fatalf("currency-filtered projections: %s", response.Body)
			}
			// The explicit currency must hold for both future projections and persisted occurrences.
			for i, transaction := range response.JSON200.Transactions {
				wantDate := fmt.Sprintf("2024-03-%02d", 14-i)
				if got := transaction.InitiatedDate.Format("2006-01-02"); got != wantDate {
					t.Fatalf("occurrence %d date = %s, want %s", i, got, wantDate)
				}
			}
		})
	}
}

func TestTransactionAmountFilterProjectionPagination(t *testing.T) {
	clock := apptest.NewFakeClock(apptest.Timestamp("2024-03-12T12:00:00Z"))
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createRecurringDefinitionRefs(t, client, "AmountProjection")
	request := recurringDefinitionRequest("AmountProjection:Daily", refs, "-20.5", "9.75", intervalRule(1, "DAY"), "2024-03-11")
	party := client.Scenario().AccountWithType("AmountProjection:Party", httpclient.WritableAccountTypeParty)
	records := *request.Records
	records = append(records, records[1], httpclient.RecurringDefinitionRecordRequest{AccountId: &party.AccountId, Currency: apptest.StringPtr("USD"), Amount: apptest.StringPtr("1")})
	request.Records = &records
	createRecurringDefinition(t, client, request)
	createRecurringDefinition(t, client, recurringDefinitionRequest("AmountProjection:Outside", refs, "-100", "100", intervalRule(1, "DAY"), "2024-03-11"))
	runRecurringCatchUp(t, client)
	through := apptest.Date("2024-03-14")
	for _, example := range []struct {
		expression string
		count      int64
	}{
		{"amount=19..20", 4}, {"amount=19..20USD", 4}, {"amount=9.75", 0}, {"amount=20.5", 0}, {"amount=1", 4}, {"amount>19 and amount<20", 4},
		{"currency:USD and (amount=19..20) and initiated>=-1d", 4},
		{"amount=19..20 and amount_usd=19..20", 2},
		{"amount=19..20 and not amount_usd=19..20", 2},
		{"amount=19..20 and not amount_usd>=0", 2},
	} {
		t.Run(example.expression, func(t *testing.T) {
			response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: &example.expression, AnchorDate: &through, Offset: ptrTo(0), Limit: ptrTo(1)})
			requireNoTransportError(t, "amount-filtered projection page", err)
			if response.StatusCode() != http.StatusOK || response.JSON200.TotalCount != example.count || len(response.JSON200.Transactions) != min(int(example.count), 1) {
				t.Fatalf("projection page: %s", response.Body)
			}
		})
	}
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: apptest.StringPtr("amount=19..20USD"), AnchorDate: &through, Limit: ptrTo(1)})
	requireNoTransportError(t, "amount anchor", err)
	if response.StatusCode() != http.StatusOK || response.JSON200.TotalCount != 4 || response.JSON200.Transactions[0].InitiatedDate.Format("2006-01-02") != "2024-03-14" {
		t.Fatalf("amount anchor: %s", response.Body)
	}
	// Persisted anchor positioning also sees only matching transactions.
	anchor := apptest.Date("2024-03-11")
	response, err = client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{Filter: apptest.StringPtr("amount=19..20USD"), AnchorDate: &anchor, Limit: ptrTo(1)})
	requireNoTransportError(t, "persisted amount anchor", err)
	if response.StatusCode() != http.StatusOK || response.JSON200.TotalCount != 2 || response.JSON200.Transactions[0].InitiatedDate.Format("2006-01-02") != "2024-03-11" {
		t.Fatalf("persisted amount anchor: %s", response.Body)
	}
}
