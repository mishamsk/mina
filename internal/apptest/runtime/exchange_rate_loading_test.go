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

func TestExchangeRateLoadingExpectedBehavior(t *testing.T) {
	t.Run("updates existing active rates", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-03-31", "1.12000000")
		provider.Set("EUR", "2026-04-01", "1.13000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-03-31T12:00:00Z"),
		})
		existing := client.Scenario().ExchangeRate("USD", "EUR", "2026-03-31T00:00:00Z")

		triggerAndWaitForExchangeRateLoad(t, client)

		rate := getExchangeRate(t, client, existing.ExchangeRateId)
		if rate.Rate != "1.12000000" {
			t.Fatalf("updated rate = %q, want 1.12000000", rate.Rate)
		}
	})

	t.Run("keeps existing intraday active rates when loading daily rates", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-03-31", "1.12000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-03-31T12:00:00Z"),
		})
		created, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
			FromCurrency:  "USD",
			ToCurrency:    "EUR",
			Rate:          "1.10000000",
			EffectiveDate: apptest.Timestamp("2026-03-31T12:00:00Z"),
		})
		requireClientResponse(t, "create non-midnight exchange rate", err, created.StatusCode(), http.StatusCreated, created.Body)

		triggerAndWaitForExchangeRateLoad(t, client)

		rate := getExchangeRate(t, client, created.JSON201.ExchangeRateId)
		if rate.Rate != "1.10000000" {
			t.Fatalf("intraday rate = %q, want unchanged 1.10000000", rate.Rate)
		}
		if effectiveDate := rate.EffectiveDate.Format(time.RFC3339); effectiveDate != "2026-03-31T12:00:00Z" {
			t.Fatalf("intraday effective date = %q, want unchanged 2026-03-31T12:00:00Z", effectiveDate)
		}
		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-03-31")
		rates := listExchangeRatesForPair(t, client, "USD", "EUR")
		if len(rates) != 2 {
			t.Fatalf("rate count = %d, want intraday and daily active rates; rates = %+v", len(rates), rates)
		}
	})

	t.Run("creates missing active rates", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-03-31", "1.12000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-03-31T12:00:00Z"),
		})

		triggerAndWaitForExchangeRateLoad(t, client)

		rates := listExchangeRatesForPair(t, client, "USD", "EUR")
		if len(rates) != 1 || rates[0].Rate != "1.12000000" {
			t.Fatalf("rates = %+v, want one created USD/EUR rate at 1.12000000", rates)
		}
	})

	t.Run("loads forward rates for tracked currency whose records are already resolved", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-04-02", "1.14000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-04-01",
			PostedAt:      apptest.TimestampPtr("2026-04-01T12:00:00Z"),
			AmountUSD:     "10.00000000",
		})
		client.Scenario().ExchangeRate("USD", "EUR", "2026-04-01T00:00:00Z")

		triggerAndWaitForExchangeRateLoad(t, client)

		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-01")
		assertExchangeRateRateOnDate(t, client, "USD", "EUR", "2026-04-02", "1.14000000")
	})

	t.Run("new resolved tracked currency starts at provider settled date only", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("CHF", "2026-01-15", "0.91000000")
		provider.Set("CHF", "2026-04-10", "0.94000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "CHF",
			InitiatedDate: "2026-01-15",
			PostedAt:      apptest.TimestampPtr("2026-01-15T12:00:00Z"),
			AmountUSD:     "10.00000000",
		})

		triggerAndWaitForExchangeRateLoad(t, client)

		assertExchangeRateDateMissing(t, client, "USD", "CHF", "2026-01-15")
		assertExchangeRateRateOnDate(t, client, "USD", "CHF", "2026-04-10", "0.94000000")
	})

	t.Run("backfills null amount_usd after load runs", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-04-01", "1.00000000")
		provider.Set("EUR", "2026-04-11", "1.20000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		cash := client.Scenario().AccountWithCurrency("cash:Backfill:EUR", "EUR")
		counterparty := client.Scenario().Account("counterparty:Backfill:EUR")
		category := client.Scenario().Category("Backfill:EUR")

		createBackfillTransaction := func(date string, amount string) httpclient.Transaction {
			t.Helper()

			response, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
				InitiatedDate: apptest.Date(date),
				Records: []httpclient.CreateJournalRecordRequest{
					{
						AccountId:            cash.AccountId,
						Amount:               "-" + amount,
						CategoryId:           category.CategoryId,
						Currency:             "EUR",
						PostingStatus:        httpclient.Posted,
						ReconciliationStatus: httpclient.Reconciled,
						Source:               httpclient.Manual,
					},
					{
						AccountId:            counterparty.AccountId,
						Amount:               amount,
						CategoryId:           category.CategoryId,
						Currency:             "EUR",
						PostingStatus:        httpclient.Posted,
						ReconciliationStatus: httpclient.Reconciled,
						Source:               httpclient.Manual,
					},
				},
			})
			requireClientResponse(t, "create backfill transaction", err, response.StatusCode(), http.StatusCreated, response.Body)
			assertRecordAmountUSDNil(t, *response.JSON201, cash.AccountId)
			assertRecordAmountUSDNil(t, *response.JSON201, counterparty.AccountId)

			return *response.JSON201
		}
		readTransaction := func(id int64) httpclient.Transaction {
			t.Helper()

			response, err := client.REST().GetTransactionWithResponse(context.Background(), id)
			requireClientResponse(t, "get backfill transaction", err, response.StatusCode(), http.StatusOK, response.Body)

			return *response.JSON200
		}

		exact := createBackfillTransaction("2026-04-01", "10.00")
		interior := createBackfillTransaction("2026-04-06", "11.00")
		outside := createBackfillTransaction("2026-04-12", "12.00")

		triggerAndWaitForExchangeRateLoad(t, client)

		assertRecordAmountUSD(t, readTransaction(exact.TransactionId), cash.AccountId, "-10.00000000")
		assertRecordAmountUSD(t, readTransaction(exact.TransactionId), counterparty.AccountId, "10.00000000")
		assertRecordAmountUSD(t, readTransaction(interior.TransactionId), cash.AccountId, "-10.00000000")
		assertRecordAmountUSD(t, readTransaction(interior.TransactionId), counterparty.AccountId, "10.00000000")
		assertRecordAmountUSDNil(t, readTransaction(outside.TransactionId), cash.AccountId)
		assertRecordAmountUSDNil(t, readTransaction(outside.TransactionId), counterparty.AccountId)

		provider.Set("EUR", "2026-04-12", "1.20000000")
		triggerAndWaitForExchangeRateLoad(t, client)

		assertRecordAmountUSD(t, readTransaction(outside.TransactionId), cash.AccountId, "-10.00000000")
		assertRecordAmountUSD(t, readTransaction(outside.TransactionId), counterparty.AccountId, "10.00000000")
	})

	t.Run("loads prior bracket for first unresolved provider-gap date", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-04-03", "1.10000000")
		provider.Set("EUR", "2026-04-06", "1.10000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		cash := client.Scenario().AccountWithCurrency("cash:Backfill:WeekendEUR", "EUR")
		counterparty := client.Scenario().Account("counterparty:Backfill:WeekendEUR")
		category := client.Scenario().Category("Backfill:WeekendEUR")

		response, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
			InitiatedDate: apptest.Date("2026-04-05"),
			Records: []httpclient.CreateJournalRecordRequest{
				{
					AccountId:            cash.AccountId,
					Amount:               "-11.00",
					CategoryId:           category.CategoryId,
					Currency:             "EUR",
					PostingStatus:        httpclient.Posted,
					ReconciliationStatus: httpclient.Reconciled,
					Source:               httpclient.Manual,
				},
				{
					AccountId:            counterparty.AccountId,
					Amount:               "11.00",
					CategoryId:           category.CategoryId,
					Currency:             "EUR",
					PostingStatus:        httpclient.Posted,
					ReconciliationStatus: httpclient.Reconciled,
					Source:               httpclient.Manual,
				},
			},
		})
		requireClientResponse(t, "create weekend backfill transaction", err, response.StatusCode(), http.StatusCreated, response.Body)
		assertRecordAmountUSDNil(t, *response.JSON201, cash.AccountId)
		assertRecordAmountUSDNil(t, *response.JSON201, counterparty.AccountId)

		triggerAndWaitForExchangeRateLoad(t, client)

		read, err := client.REST().GetTransactionWithResponse(context.Background(), response.JSON201.TransactionId)
		requireClientResponse(t, "get weekend backfill transaction", err, read.StatusCode(), http.StatusOK, read.Body)
		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-03")
		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-06")
		assertRecordAmountUSD(t, *read.JSON200, cash.AccountId, "-10.00000000")
		assertRecordAmountUSD(t, *read.JSON200, counterparty.AccountId, "10.00000000")
	})

	t.Run("backdated unresolved record pulls window back and resolves", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("NOK", "2026-03-14", "10.00000000")
		provider.Set("NOK", "2026-03-16", "10.00000000")
		provider.Set("NOK", "2026-04-10", "11.00000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		created := createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "NOK",
			InitiatedDate: "2026-03-15",
			PostedAt:      apptest.TimestampPtr("2026-03-15T12:00:00Z"),
		})
		client.Scenario().ExchangeRate("USD", "NOK", "2026-04-10T00:00:00Z")
		assertRecordAmountUSDNil(t, created, created.Records[0].AccountId)
		assertRecordAmountUSDNil(t, created, created.Records[1].AccountId)

		triggerAndWaitForExchangeRateLoad(t, client)

		read, err := client.REST().GetTransactionWithResponse(context.Background(), created.TransactionId)
		requireClientResponse(t, "get backdated unresolved transaction", err, read.StatusCode(), http.StatusOK, read.Body)
		assertExchangeRateDateExists(t, client, "USD", "NOK", "2026-03-14")
		assertExchangeRateDateExists(t, client, "USD", "NOK", "2026-03-16")
		assertRecordAmountUSD(t, *read.JSON200, created.Records[0].AccountId, "-1.00000000")
		assertRecordAmountUSD(t, *read.JSON200, created.Records[1].AccountId, "1.00000000")
	})

	t.Run("posted date wins over initiated date", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-04-02", "1.12000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-04-02T12:00:00Z"),
		})

		triggerAndWaitForExchangeRateLoad(t, client)

		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-02")
		assertExchangeRateDateMissing(t, client, "USD", "EUR", "2026-03-31")
	})

	t.Run("null posted date uses initiated date", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-03-31", "1.12000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
		})

		triggerAndWaitForExchangeRateLoad(t, client)

		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-03-31")
	})

	t.Run("loads later rates without removing existing active rates", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-04-02", "1.12000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-04-02",
			PostedAt:      apptest.TimestampPtr("2026-04-02T12:00:00Z"),
		})
		client.Scenario().ExchangeRate("USD", "EUR", "2026-04-01T00:00:00Z")

		triggerAndWaitForExchangeRateLoad(t, client)

		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-01")
		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-02")
	})

	t.Run("backfills missing historical rates before latest active rate", func(t *testing.T) {
		provider := apptest.NewFakeExchangeRateProvider()
		provider.Set("EUR", "2026-03-31", "1.11000000")
		provider.Set("EUR", "2026-04-02", "1.12000000")
		client := newSharedClient(t, apptest.WithExchangeRateLoading(false), apptest.WithExchangeRateProviderFactory(provider))
		createForeignCurrencyTransaction(t, client, foreignCurrencyTransaction{
			Currency:      "EUR",
			InitiatedDate: "2026-03-31",
			PostedAt:      apptest.TimestampPtr("2026-03-31T12:00:00Z"),
		})
		client.Scenario().ExchangeRate("USD", "EUR", "2026-04-01T00:00:00Z")

		triggerAndWaitForExchangeRateLoad(t, client)

		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-03-31")
		assertExchangeRateDateExists(t, client, "USD", "EUR", "2026-04-02")
	})

}

type foreignCurrencyTransaction struct {
	Currency      string
	InitiatedDate string
	PostedAt      *time.Time
	AmountUSD     string
}

func createForeignCurrencyTransaction(t *testing.T, client *apptest.Client, fixture foreignCurrencyTransaction) httpclient.Transaction {
	t.Helper()

	fqnSuffix := strings.NewReplacer(":", "-").Replace(fixture.Currency)
	checking := client.Scenario().AccountWithCurrency("checking:"+fqnSuffix, fixture.Currency)
	counterparty := client.Scenario().Account("counterparty:" + fqnSuffix)
	category := client.Scenario().Category("Transfers:" + fqnSuffix)
	pendingAt := apptest.Timestamp(fixture.InitiatedDate + "T12:00:00Z")
	var sourceAmountUSD *string
	var counterpartyAmountUSD *string
	if fixture.AmountUSD != "" {
		sourceAmountUSD = apptest.StringPtr("-" + fixture.AmountUSD)
		counterpartyAmountUSD = apptest.StringPtr(fixture.AmountUSD)
	}
	response, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date(fixture.InitiatedDate),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            checking.AccountId,
				Amount:               "-10.00000000",
				AmountUsd:            sourceAmountUSD,
				CategoryId:           category.CategoryId,
				Currency:             fixture.Currency,
				PendingDate:          &pendingAt,
				PostedDate:           fixture.PostedAt,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
			{
				AccountId:            counterparty.AccountId,
				Amount:               "10.00000000",
				AmountUsd:            counterpartyAmountUSD,
				CategoryId:           category.CategoryId,
				Currency:             fixture.Currency,
				PendingDate:          &pendingAt,
				PostedDate:           fixture.PostedAt,
				PostingStatus:        httpclient.Posted,
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.Manual,
			},
		},
	})
	requireClientResponse(t, "create foreign-currency transaction", err, response.StatusCode(), http.StatusCreated, response.Body)

	return *response.JSON201
}

func triggerAndWaitForExchangeRateLoad(t *testing.T, client *apptest.Client) {
	t.Helper()

	before := client.ExchangeRateLoadingStatus().CompletedRunRevision
	started, err := client.REST().StartExchangeRateLoadingRunWithResponse(context.Background())
	requireClientResponse(t, "start exchange-rate loading run", err, started.StatusCode(), http.StatusAccepted, started.Body)
	status := client.PollExchangeRateLoadingStatusRevision(before + 1)
	if status.LastSuccess == nil || !*status.LastSuccess {
		t.Fatalf("exchange-rate loading status = %+v, want successful run", status)
	}
}

func getExchangeRate(t *testing.T, client *apptest.Client, id int64) *httpclient.ExchangeRate {
	t.Helper()

	response, err := client.REST().GetExchangeRateWithResponse(context.Background(), id, nil)
	requireClientResponse(t, "get exchange rate", err, response.StatusCode(), http.StatusOK, response.Body)

	return response.JSON200
}

func listExchangeRatesForPair(t *testing.T, client *apptest.Client, fromCurrency string, toCurrency string) []httpclient.ExchangeRate {
	t.Helper()

	response, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{
		FromCurrency: &fromCurrency,
		ToCurrency:   &toCurrency,
	})
	requireClientResponse(t, "list exchange rates", err, response.StatusCode(), http.StatusOK, response.Body)

	return response.JSON200.ExchangeRates
}

func assertExchangeRateDateExists(t *testing.T, client *apptest.Client, fromCurrency string, toCurrency string, date string) {
	t.Helper()

	effectiveDate := apptest.Timestamp(date + "T00:00:00Z")
	response, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{
		FromCurrency:  &fromCurrency,
		ToCurrency:    &toCurrency,
		EffectiveDate: &effectiveDate,
	})
	requireClientResponse(t, "list exchange rates by date", err, response.StatusCode(), http.StatusOK, response.Body)
	if len(response.JSON200.ExchangeRates) == 0 {
		t.Fatalf("missing %s/%s exchange rate for %s", fromCurrency, toCurrency, date)
	}
}

func assertExchangeRateRateOnDate(t *testing.T, client *apptest.Client, fromCurrency string, toCurrency string, date string, rate string) {
	t.Helper()

	effectiveDate := apptest.Timestamp(date + "T00:00:00Z")
	response, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{
		FromCurrency:  &fromCurrency,
		ToCurrency:    &toCurrency,
		EffectiveDate: &effectiveDate,
	})
	requireClientResponse(t, "list exchange rates by date", err, response.StatusCode(), http.StatusOK, response.Body)
	if len(response.JSON200.ExchangeRates) != 1 {
		t.Fatalf("rate count for %s/%s on %s = %d, want 1; rates = %+v",
			fromCurrency,
			toCurrency,
			date,
			len(response.JSON200.ExchangeRates),
			response.JSON200.ExchangeRates,
		)
	}
	if response.JSON200.ExchangeRates[0].Rate != rate {
		t.Fatalf("rate for %s/%s on %s = %q, want %q", fromCurrency, toCurrency, date, response.JSON200.ExchangeRates[0].Rate, rate)
	}
}

func assertExchangeRateDateMissing(t *testing.T, client *apptest.Client, fromCurrency string, toCurrency string, date string) {
	t.Helper()

	effectiveDate := apptest.Timestamp(date + "T00:00:00Z")
	response, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{
		FromCurrency:  &fromCurrency,
		ToCurrency:    &toCurrency,
		EffectiveDate: &effectiveDate,
	})
	requireClientResponse(t, "list exchange rates by date", err, response.StatusCode(), http.StatusOK, response.Body)
	if len(response.JSON200.ExchangeRates) != 0 {
		t.Fatalf("found %s/%s exchange rate for %s: %+v", fromCurrency, toCurrency, date, response.JSON200.ExchangeRates)
	}
}
