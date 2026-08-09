package runtime_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestExchangeRateCreateReadListUpdateDeleteBoundary(t *testing.T) {
	client := newSharedClient(t)

	later, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.08",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("later create request: %v", err)
	}
	if later.StatusCode() != http.StatusCreated {
		t.Fatalf("later create status = %d, want %d; body %s", later.StatusCode(), http.StatusCreated, later.Body)
	}
	if later.JSON201.FromCurrency != "EUR" || later.JSON201.ToCurrency != "USD" {
		t.Fatalf("currency pair = %s/%s, want EUR/USD", later.JSON201.FromCurrency, later.JSON201.ToCurrency)
	}
	if later.JSON201.Rate != "1.08000000" {
		t.Fatalf("later rate = %q, want 1.08000000", later.JSON201.Rate)
	}

	earlier, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.07000000",
		EffectiveDate: apptest.Timestamp("2024-01-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("earlier create request: %v", err)
	}
	if earlier.StatusCode() != http.StatusCreated {
		t.Fatalf("earlier create status = %d, want %d; body %s", earlier.StatusCode(), http.StatusCreated, earlier.Body)
	}

	other, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "GBP",
		ToCurrency:    "USD",
		Rate:          "1.25000000",
		EffectiveDate: apptest.Timestamp("2024-01-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("other create request: %v", err)
	}
	if other.StatusCode() != http.StatusCreated {
		t.Fatalf("other create status = %d, want %d; body %s", other.StatusCode(), http.StatusCreated, other.Body)
	}

	read, err := client.REST().GetExchangeRateWithResponse(context.Background(), later.JSON201.ExchangeRateId, nil)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.ExchangeRateId != later.JSON201.ExchangeRateId {
		t.Fatalf("read id = %d, want %d", read.JSON200.ExchangeRateId, later.JSON201.ExchangeRateId)
	}

	defaultList, err := client.REST().ListExchangeRatesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("default list request: %v", err)
	}
	if defaultList.StatusCode() != http.StatusOK {
		t.Fatalf("default list status = %d, want %d; body %s", defaultList.StatusCode(), http.StatusOK, defaultList.Body)
	}
	assertExchangeRateIDs(t, defaultList.JSON200.ExchangeRates, []int64{earlier.JSON201.ExchangeRateId, later.JSON201.ExchangeRateId, other.JSON201.ExchangeRateId})
	if defaultList.JSON200.TotalCount != 3 {
		t.Fatalf("default exchange rate total_count = %d, want 3", defaultList.JSON200.TotalCount)
	}

	fromCurrency := "EUR"
	toCurrency := "USD"
	filteredPair, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{FromCurrency: &fromCurrency, ToCurrency: &toCurrency})
	if err != nil {
		t.Fatalf("filtered pair request: %v", err)
	}
	if filteredPair.StatusCode() != http.StatusOK {
		t.Fatalf("filtered pair status = %d, want %d; body %s", filteredPair.StatusCode(), http.StatusOK, filteredPair.Body)
	}
	assertExchangeRateIDs(t, filteredPair.JSON200.ExchangeRates, []int64{earlier.JSON201.ExchangeRateId, later.JSON201.ExchangeRateId})
	if filteredPair.JSON200.TotalCount != 2 {
		t.Fatalf("filtered pair exchange rate total_count = %d, want 2", filteredPair.JSON200.TotalCount)
	}

	effectiveDate := apptest.Timestamp("2024-02-01T00:00:00Z")
	filteredDate, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{FromCurrency: &fromCurrency, ToCurrency: &toCurrency, EffectiveDate: &effectiveDate})
	if err != nil {
		t.Fatalf("filtered date request: %v", err)
	}
	if filteredDate.StatusCode() != http.StatusOK {
		t.Fatalf("filtered date status = %d, want %d; body %s", filteredDate.StatusCode(), http.StatusOK, filteredDate.Body)
	}
	assertExchangeRateIDs(t, filteredDate.JSON200.ExchangeRates, []int64{later.JSON201.ExchangeRateId})
	if filteredDate.JSON200.TotalCount != 1 {
		t.Fatalf("filtered date exchange rate total_count = %d, want 1", filteredDate.JSON200.TotalCount)
	}

	updated, err := client.REST().UpdateExchangeRateWithResponse(context.Background(), later.JSON201.ExchangeRateId, httpclient.UpdateExchangeRateRequest{
		Rate: "1.09",
	})
	if err != nil {
		t.Fatalf("update request: %v", err)
	}
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if updated.JSON200.Rate != "1.09000000" {
		t.Fatalf("updated rate = %q, want 1.09000000", updated.JSON200.Rate)
	}

	deleted, err := client.REST().DeleteExchangeRateWithResponse(context.Background(), earlier.JSON201.ExchangeRateId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	missing, err := client.REST().GetExchangeRateWithResponse(context.Background(), earlier.JSON201.ExchangeRateId, nil)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	includeTombstoned := true
	deletedRead, err := client.REST().GetExchangeRateWithResponse(context.Background(), earlier.JSON201.ExchangeRateId, &httpclient.GetExchangeRateParams{IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("get deleted with tombstones request: %v", err)
	}
	if deletedRead.StatusCode() != http.StatusOK {
		t.Fatalf("get deleted with tombstones status = %d, want %d; body %s", deletedRead.StatusCode(), http.StatusOK, deletedRead.Body)
	}
	if deletedRead.JSON200.TombstonedAt == nil {
		t.Fatal("deleted exchange rate tombstoned_at = nil, want timestamp")
	}

	withTombstones, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{FromCurrency: &fromCurrency, ToCurrency: &toCurrency, IncludeTombstoned: &includeTombstoned})
	if err != nil {
		t.Fatalf("include tombstones request: %v", err)
	}
	if withTombstones.StatusCode() != http.StatusOK {
		t.Fatalf("include tombstones status = %d, want %d; body %s", withTombstones.StatusCode(), http.StatusOK, withTombstones.Body)
	}
	assertExchangeRateIDs(t, withTombstones.JSON200.ExchangeRates, []int64{earlier.JSON201.ExchangeRateId, later.JSON201.ExchangeRateId})
	if withTombstones.JSON200.TotalCount != 2 {
		t.Fatalf("include tombstones exchange rate total_count = %d, want 2", withTombstones.JSON200.TotalCount)
	}
}

func TestExchangeRateAcceptsCryptoCurrencyBoundary(t *testing.T) {
	client := newSharedClient(t)

	created, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "C::ETHEREUM-LONG-TOKEN",
		ToCurrency:    "USD",
		Rate:          "2500.00000000",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("crypto exchange rate request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("crypto exchange rate status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	fromCurrency := "C::ETHEREUM-LONG-TOKEN"
	filtered, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{FromCurrency: &fromCurrency})
	if err != nil {
		t.Fatalf("crypto filter request: %v", err)
	}
	if filtered.StatusCode() != http.StatusOK {
		t.Fatalf("crypto filter status = %d, want %d; body %s", filtered.StatusCode(), http.StatusOK, filtered.Body)
	}
	assertExchangeRateIDs(t, filtered.JSON200.ExchangeRates, []int64{created.JSON201.ExchangeRateId})
}

func TestExchangeRateRejectsDuplicateActivePairDate(t *testing.T) {
	client := newSharedClient(t)

	first, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.08000000",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("first create request: %v", err)
	}
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	duplicate, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.09000000",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("duplicate request: %v", err)
	}
	if duplicate.StatusCode() != http.StatusConflict {
		t.Fatalf("duplicate status = %d, want %d; body %s", duplicate.StatusCode(), http.StatusConflict, duplicate.Body)
	}
	if duplicate.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("duplicate code = %q, want %q", duplicate.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}

	deleted, err := client.REST().DeleteExchangeRateWithResponse(context.Background(), first.JSON201.ExchangeRateId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	recreated, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "1.10000000",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("recreate request: %v", err)
	}
	if recreated.StatusCode() != http.StatusCreated {
		t.Fatalf("recreate status = %d, want %d; body %s", recreated.StatusCode(), http.StatusCreated, recreated.Body)
	}
}

func TestExchangeRateEffectiveDateNormalizesOffsetBoundary(t *testing.T) {
	client := newSharedClient(t)

	inputEffectiveDate := parseTimestamp(t, "2024-02-01T00:30:00-05:00")
	wantEffectiveDate := apptest.Timestamp("2024-02-01T05:30:00Z")
	created, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "CAD",
		ToCurrency:    "USD",
		Rate:          "0.74000000",
		EffectiveDate: inputEffectiveDate,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	assertExchangeRateEffectiveDate(t, "created", created.JSON201.EffectiveDate, wantEffectiveDate)

	read, err := client.REST().GetExchangeRateWithResponse(context.Background(), created.JSON201.ExchangeRateId, nil)
	if err != nil {
		t.Fatalf("read request: %v", err)
	}
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	assertExchangeRateEffectiveDate(t, "read", read.JSON200.EffectiveDate, wantEffectiveDate)

	fromCurrency := "CAD"
	toCurrency := "USD"
	list, err := client.REST().ListExchangeRatesWithResponse(context.Background(), &httpclient.ListExchangeRatesParams{
		FromCurrency:  &fromCurrency,
		ToCurrency:    &toCurrency,
		EffectiveDate: &wantEffectiveDate,
	})
	if err != nil {
		t.Fatalf("filtered list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("filtered list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	assertExchangeRateIDs(t, list.JSON200.ExchangeRates, []int64{created.JSON201.ExchangeRateId})
	assertExchangeRateEffectiveDate(t, "list", list.JSON200.ExchangeRates[0].EffectiveDate, wantEffectiveDate)
}

func TestExchangeRateValidationErrors(t *testing.T) {
	client := newSharedClient(t)

	invalidCurrency, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "eur",
		ToCurrency:    "USD",
		Rate:          "1.08000000",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("invalid currency request: %v", err)
	}
	if invalidCurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid currency status = %d, want %d; body %s", invalidCurrency.StatusCode(), http.StatusBadRequest, invalidCurrency.Body)
	}

	unknownCurrency, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "ZZZ",
		ToCurrency:    "USD",
		Rate:          "1.08000000",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("unknown currency request: %v", err)
	}
	if unknownCurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unknown currency status = %d, want %d; body %s", unknownCurrency.StatusCode(), http.StatusBadRequest, unknownCurrency.Body)
	}

	zeroRate, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "0.00000000",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("zero rate request: %v", err)
	}
	if zeroRate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("zero rate status = %d, want %d; body %s", zeroRate.StatusCode(), http.StatusBadRequest, zeroRate.Body)
	}

	negativeRate, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "-1",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("negative rate request: %v", err)
	}
	if negativeRate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("negative rate status = %d, want %d; body %s", negativeRate.StatusCode(), http.StatusBadRequest, negativeRate.Body)
	}

	tooManyIntegerDigits, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "EUR",
		ToCurrency:    "USD",
		Rate:          "12345678901",
		EffectiveDate: apptest.Timestamp("2024-02-01T00:00:00Z"),
	})
	if err != nil {
		t.Fatalf("too many integer digits request: %v", err)
	}
	if tooManyIntegerDigits.StatusCode() != http.StatusBadRequest {
		t.Fatalf("too many integer digits status = %d, want %d; body %s", tooManyIntegerDigits.StatusCode(), http.StatusBadRequest, tooManyIntegerDigits.Body)
	}

	invalidDate, err := client.REST().CreateExchangeRateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"from_currency":  "EUR",
		"to_currency":    "USD",
		"rate":           "1.08000000",
		"effective_date": "2024-02-30T00:00:00Z",
	}))
	if err != nil {
		t.Fatalf("invalid date request: %v", err)
	}
	if invalidDate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid date status = %d, want %d; body %s", invalidDate.StatusCode(), http.StatusBadRequest, invalidDate.Body)
	}

	unsupportedFilter, err := client.REST().ListExchangeRatesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("currency=EUR"))
	if err != nil {
		t.Fatalf("unsupported filter request: %v", err)
	}
	if unsupportedFilter.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unsupported filter status = %d, want %d; body %s", unsupportedFilter.StatusCode(), http.StatusBadRequest, unsupportedFilter.Body)
	}

	invalidFilterCurrency, err := client.REST().ListExchangeRatesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("from_currency=eur"))
	if err != nil {
		t.Fatalf("invalid filter currency request: %v", err)
	}
	if invalidFilterCurrency.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid filter currency status = %d, want %d; body %s", invalidFilterCurrency.StatusCode(), http.StatusBadRequest, invalidFilterCurrency.Body)
	}

	invalidFilterDate, err := client.REST().ListExchangeRatesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("effective_date=2024-02-30T00:00:00Z"))
	if err != nil {
		t.Fatalf("invalid filter date request: %v", err)
	}
	if invalidFilterDate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid filter date status = %d, want %d; body %s", invalidFilterDate.StatusCode(), http.StatusBadRequest, invalidFilterDate.Body)
	}

	badQuery, err := client.REST().ListExchangeRatesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("include_tombstoned="))
	if err != nil {
		t.Fatalf("bad query request: %v", err)
	}
	if badQuery.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad query status = %d, want %d; body %s", badQuery.StatusCode(), http.StatusBadRequest, badQuery.Body)
	}

	missingRate, err := client.REST().UpdateExchangeRateWithBodyWithResponse(context.Background(), 1, "application/json", apptest.JSONReader(map[string]any{}))
	if err != nil {
		t.Fatalf("missing rate request: %v", err)
	}
	if missingRate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing rate status = %d, want %d; body %s", missingRate.StatusCode(), http.StatusBadRequest, missingRate.Body)
	}

	extraField, err := client.REST().CreateExchangeRateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"from_currency":  "EUR",
		"to_currency":    "USD",
		"rate":           "1.08000000",
		"effective_date": "2024-02-01T00:00:00Z",
		"extraField":     true,
	}))
	if err != nil {
		t.Fatalf("extra field request: %v", err)
	}
	if extraField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("extra field status = %d, want %d; body %s", extraField.StatusCode(), http.StatusBadRequest, extraField.Body)
	}
}

func TestDailyExchangeRateSnapshotRebuildsFromPersistedRates(t *testing.T) {
	const schema = "daily_exchange_rate_snapshot_rebuild"
	setup := newSharedClient(t, apptest.WithAccountingSchema(schema))
	createSourceExchangeRate(t, setup, "EUR", "2026-04-01T00:00:00Z", "1.00000000")
	createSourceExchangeRate(t, setup, "EUR", "2026-04-03T00:00:00Z", "1.60000000")
	createSourceExchangeRate(t, setup, "EUR", "2026-04-03T12:00:00Z", "1.10000000")
	createSourceExchangeRate(t, setup, "CHF", "2026-04-02T00:00:00Z", "0.90000000")
	setup.Close()

	client := newSharedClient(t, apptest.WithAccountingSchema(schema))
	response := waitForDailyExchangeRateCount(t, client, 4)
	want := []struct {
		currency     string
		date         string
		rate         string
		interpolated bool
	}{
		{currency: "CHF", date: "2026-04-02", rate: "0.90000000", interpolated: false},
		{currency: "EUR", date: "2026-04-01", rate: "1.00000000", interpolated: false},
		{currency: "EUR", date: "2026-04-02", rate: "1.30000000", interpolated: true},
		{currency: "EUR", date: "2026-04-03", rate: "1.10000000", interpolated: false},
	}
	if response.JSON200.TotalCount != int64(len(want)) || len(response.JSON200.ExchangeRates) != len(want) {
		t.Fatalf("daily exchange rates = %+v, want %d bounded rows", response.JSON200, len(want))
	}
	for index, expected := range want {
		got := response.JSON200.ExchangeRates[index]
		if got.FromCurrency != "USD" || got.ToCurrency != expected.currency ||
			got.EffectiveDate.Format("2006-01-02") != expected.date ||
			got.Rate != expected.rate || got.Interpolated != expected.interpolated {
			t.Fatalf("daily exchange rate %d = %+v, want date=%s rate=%s interpolated=%t", index, got, expected.date, expected.rate, expected.interpolated)
		}
	}

	from := apptest.Date("2026-04-02")
	to := apptest.Date("2026-04-03")
	toCurrency := "EUR"
	limit := 1
	offset := 1
	page, err := client.REST().ListDailyExchangeRatesWithResponse(context.Background(), &httpclient.ListDailyExchangeRatesParams{
		ToCurrency:        &toCurrency,
		EffectiveDateFrom: &from,
		EffectiveDateTo:   &to,
		Limit:             &limit,
		Offset:            &offset,
	})
	if err != nil {
		t.Fatalf("list filtered daily exchange rates: %v", err)
	}
	if page.StatusCode() != http.StatusOK {
		t.Fatalf("list filtered daily exchange rates status = %d, want %d; body %s", page.StatusCode(), http.StatusOK, page.Body)
	}
	if page.JSON200.TotalCount != 2 || len(page.JSON200.ExchangeRates) != 1 ||
		page.JSON200.ExchangeRates[0].EffectiveDate.Format("2006-01-02") != "2026-04-03" {
		t.Fatalf("filtered daily exchange-rate page = %+v, want second of two matching rows", page.JSON200)
	}
}

func TestDailyExchangeRateSnapshotOrdersUnfilteredPagesByCurrencyAndDate(t *testing.T) {
	const schema = "daily_exchange_rate_snapshot_unfiltered_order"
	setup := newSharedClient(t, apptest.WithAccountingSchema(schema))
	createSourceExchangeRate(t, setup, "EUR", "2026-04-01T00:00:00Z", "1.10000000")
	createSourceExchangeRate(t, setup, "CHF", "2026-04-03T00:00:00Z", "0.90000000")
	setup.Close()

	client := newSharedClient(t, apptest.WithAccountingSchema(schema))
	waitForDailyExchangeRateCount(t, client, 2)

	limit := 1
	for offset, expected := range []struct {
		currency string
		date     string
	}{
		{currency: "CHF", date: "2026-04-03"},
		{currency: "EUR", date: "2026-04-01"},
	} {
		page, err := client.REST().ListDailyExchangeRatesWithResponse(context.Background(), &httpclient.ListDailyExchangeRatesParams{
			Limit:  &limit,
			Offset: &offset,
		})
		if err != nil {
			t.Fatalf("list unfiltered daily exchange-rate page %d: %v", offset, err)
		}
		if page.StatusCode() != http.StatusOK {
			t.Fatalf("list unfiltered daily exchange-rate page %d status = %d, want %d; body %s", offset, page.StatusCode(), http.StatusOK, page.Body)
		}
		if page.JSON200.TotalCount != 2 || len(page.JSON200.ExchangeRates) != 1 {
			t.Fatalf("unfiltered daily exchange-rate page %d = %+v, want one of two rows", offset, page.JSON200)
		}
		got := page.JSON200.ExchangeRates[0]
		if got.ToCurrency != expected.currency || got.EffectiveDate.Format("2006-01-02") != expected.date {
			t.Fatalf("unfiltered daily exchange-rate page %d row = %+v, want %s on %s", offset, got, expected.currency, expected.date)
		}
	}
}

func TestDailyExchangeRateSnapshotInterpolatesLargeValidRates(t *testing.T) {
	const schema = "daily_exchange_rate_snapshot_large_rates"
	setup := newSharedClient(t, apptest.WithAccountingSchema(schema))
	createSourceExchangeRate(t, setup, "EUR", "2026-04-01T00:00:00Z", "100000.00000000")
	createSourceExchangeRate(t, setup, "EUR", "2026-04-03T00:00:00Z", "9000000000.00000000")
	setup.Close()

	client := newSharedClient(t, apptest.WithAccountingSchema(schema))
	response := waitForDailyExchangeRateCount(t, client, 3)
	middle := response.JSON200.ExchangeRates[1]
	if middle.EffectiveDate.Format("2006-01-02") != "2026-04-02" ||
		middle.Rate != "4500050000.00000000" || !middle.Interpolated {
		t.Fatalf("middle daily exchange rate = %+v, want interpolated 4500050000.00000000", middle)
	}
}

func TestDailyExchangeRateSnapshotRoundsInterpolationTiesToEven(t *testing.T) {
	const schema = "daily_exchange_rate_snapshot_half_even"
	setup := newSharedClient(t, apptest.WithAccountingSchema(schema))
	createSourceExchangeRate(t, setup, "EUR", "2026-04-01T00:00:00Z", "1.00000000")
	createSourceExchangeRate(t, setup, "EUR", "2026-04-03T00:00:00Z", "1.00000003")
	setup.Close()

	client := newSharedClient(t, apptest.WithAccountingSchema(schema))
	response := waitForDailyExchangeRateCount(t, client, 3)
	middle := response.JSON200.ExchangeRates[1]
	if middle.EffectiveDate.Format("2006-01-02") != "2026-04-02" ||
		middle.Rate != "1.00000002" || !middle.Interpolated {
		t.Fatalf("middle daily exchange rate = %+v, want half-even 1.00000002", middle)
	}
}

func TestDailyExchangeRateSnapshotExcludesTombstonedSourceRates(t *testing.T) {
	const schema = "daily_exchange_rate_snapshot_tombstoned_source"
	setup := newSharedClient(t, apptest.WithAccountingSchema(schema))
	createSourceExchangeRate(t, setup, "EUR", "2026-04-01T00:00:00Z", "1.00000000")
	tombstoned, err := setup.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "USD",
		ToCurrency:    "EUR",
		Rate:          "9.00000000",
		EffectiveDate: apptest.Timestamp("2026-04-02T00:00:00Z"),
	})
	requireClientResponse(t, "create source exchange rate to tombstone", err, tombstoned.StatusCode(), http.StatusCreated, tombstoned.Body)
	createSourceExchangeRate(t, setup, "EUR", "2026-04-03T00:00:00Z", "1.20000000")
	deleted, err := setup.REST().DeleteExchangeRateWithResponse(context.Background(), tombstoned.JSON201.ExchangeRateId)
	requireClientResponse(t, "delete source exchange rate", err, deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	setup.Close()

	client := newSharedClient(t, apptest.WithAccountingSchema(schema))
	response := waitForDailyExchangeRateCount(t, client, 3)
	middle := response.JSON200.ExchangeRates[1]
	if middle.EffectiveDate.Format("2006-01-02") != "2026-04-02" ||
		middle.Rate != "1.10000000" || !middle.Interpolated {
		t.Fatalf("middle daily exchange rate = %+v, want interpolation excluding tombstoned source", middle)
	}
}

func TestDailyExchangeRateSnapshotsAreIsolatedAcrossSimultaneousApps(t *testing.T) {
	const firstSchema = "daily_exchange_rate_isolation_first"
	const secondSchema = "daily_exchange_rate_isolation_second"

	firstSetup := newSharedClient(t, apptest.WithAccountingSchema(firstSchema))
	createSourceExchangeRate(t, firstSetup, "EUR", "2026-04-01T00:00:00Z", "1.10000000")
	firstSetup.Close()
	secondSetup := newSharedClient(t, apptest.WithAccountingSchema(secondSchema))
	createSourceExchangeRate(t, secondSetup, "CHF", "2026-04-01T00:00:00Z", "0.90000000")
	secondSetup.Close()

	first := newSharedClient(t, apptest.WithAccountingSchema(firstSchema))
	second := newSharedClient(t, apptest.WithAccountingSchema(secondSchema))

	firstRates := waitForDailyExchangeRateCount(t, first, 1)
	if firstRates.StatusCode() != http.StatusOK || len(firstRates.JSON200.ExchangeRates) != 1 ||
		firstRates.JSON200.ExchangeRates[0].ToCurrency != "EUR" {
		t.Fatalf("first app daily exchange rates = %+v, want isolated EUR row; body %s", firstRates.JSON200, firstRates.Body)
	}

	secondRates := waitForDailyExchangeRateCount(t, second, 1)
	if secondRates.StatusCode() != http.StatusOK || len(secondRates.JSON200.ExchangeRates) != 1 ||
		secondRates.JSON200.ExchangeRates[0].ToCurrency != "CHF" {
		t.Fatalf("second app daily exchange rates = %+v, want isolated CHF row; body %s", secondRates.JSON200, secondRates.Body)
	}
}

func waitForDailyExchangeRateCount(t *testing.T, client *apptest.Client, count int) *httpclient.ListDailyExchangeRatesResponse {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for {
		response, err := client.REST().ListDailyExchangeRatesWithResponse(context.Background(), nil)
		if err != nil {
			t.Fatalf("list daily exchange rates: %v", err)
		}
		if response.StatusCode() != http.StatusOK {
			t.Fatalf("list daily exchange rates status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
		}
		if len(response.JSON200.ExchangeRates) == count {
			return response
		}
		if time.Now().After(deadline) {
			t.Fatalf("daily exchange rate count = %d, want %d", len(response.JSON200.ExchangeRates), count)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func createSourceExchangeRate(t *testing.T, client *apptest.Client, toCurrency string, effectiveDate string, rate string) {
	t.Helper()

	created, err := client.REST().CreateExchangeRateWithResponse(context.Background(), httpclient.CreateExchangeRateRequest{
		FromCurrency:  "USD",
		ToCurrency:    toCurrency,
		Rate:          rate,
		EffectiveDate: apptest.Timestamp(effectiveDate),
	})
	if err != nil {
		t.Fatalf("create source exchange rate: %v", err)
	}
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create source exchange rate status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
}

func assertExchangeRateEffectiveDate(t *testing.T, label string, got time.Time, want time.Time) {
	t.Helper()

	if got.Format(time.RFC3339) != want.Format(time.RFC3339) {
		t.Fatalf("%s effective_date = %s, want %s", label, got.Format(time.RFC3339), want.Format(time.RFC3339))
	}
}

func assertExchangeRateIDs(t *testing.T, rates []httpclient.ExchangeRate, want []int64) {
	t.Helper()

	if len(rates) != len(want) {
		t.Fatalf("exchange rate count = %d, want %d; rates = %+v", len(rates), len(want), rates)
	}
	for i, rate := range rates {
		if rate.ExchangeRateId != want[i] {
			t.Fatalf("exchange rate id at %d = %d, want %d; rates = %+v", i, rate.ExchangeRateId, want[i], rates)
		}
	}
}
