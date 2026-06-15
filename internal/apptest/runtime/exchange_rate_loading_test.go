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
}

func createForeignCurrencyTransaction(t *testing.T, client *apptest.Client, fixture foreignCurrencyTransaction) {
	t.Helper()

	fqnSuffix := strings.NewReplacer(":", "-").Replace(fixture.Currency)
	checking := client.Scenario().AccountWithCurrency("checking:"+fqnSuffix, fixture.Currency)
	counterparty := client.Scenario().Account("counterparty:" + fqnSuffix)
	category := client.Scenario().Category("Transfers:" + fqnSuffix)
	pendingAt := apptest.Timestamp(fixture.InitiatedDate + "T12:00:00Z")
	response, err := client.REST().CreateTransactionWithResponse(context.Background(), httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date(fixture.InitiatedDate),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            checking.AccountId,
				Amount:               "-10.00000000",
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
}

func triggerAndWaitForExchangeRateLoad(t *testing.T, client *apptest.Client) {
	t.Helper()

	started, err := client.REST().StartExchangeRateLoadingRunWithResponse(context.Background())
	requireClientResponse(t, "start exchange-rate loading run", err, started.StatusCode(), http.StatusAccepted, started.Body)
	status := client.PollExchangeRateLoadingStatusRevision(1)
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
