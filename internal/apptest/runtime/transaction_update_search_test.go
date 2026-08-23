package runtime_test

import (
	"context"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionReplaceBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}
	oldRecordIDs := recordIDs(created.JSON201.Records)

	replacement := replacementTransactionRequest(refs)
	updated, err := client.ReplaceTransactionRetainingRecords(context.Background(), created.JSON201, replacement)
	requireNoTransportError(t, "replace transaction", err)
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("replace status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}
	if updated.JSON200.TransactionId != created.JSON201.TransactionId {
		t.Fatalf("replaced transaction id = %d, want %d", updated.JSON200.TransactionId, created.JSON201.TransactionId)
	}
	if updated.JSON200.InitiatedDate.String() != "2024-03-12" {
		t.Fatalf("replaced initiated_date = %q, want 2024-03-12", updated.JSON200.InitiatedDate)
	}
	if !created.JSON201.UpdatedAt.Before(updated.JSON200.UpdatedAt) {
		t.Fatalf("replaced updated_at = %s, want after %s", updated.JSON200.UpdatedAt, created.JSON201.UpdatedAt)
	}
	if len(updated.JSON200.Records) != 2 {
		t.Fatalf("replaced record count = %d, want 2; body %+v", len(updated.JSON200.Records), updated.JSON200)
	}
	assertRecordIDs(t, updated.JSON200.Records, oldRecordIDs)

	search, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "search records", err)
	if search.StatusCode() != http.StatusOK {
		t.Fatalf("record search status = %d, want %d; body %s", search.StatusCode(), http.StatusOK, search.Body)
	}
	assertRecordIDs(t, search.JSON200.Records, recordIDs(updated.JSON200.Records))

	amountUnbalanced := replacementTransactionRequest(refs)
	amountUnbalanced.Records[1].Amount = "19.00"
	rejected, err := client.ReplaceTransactionRetainingRecords(context.Background(), updated.JSON200, amountUnbalanced)
	requireNoTransportError(t, "replace transaction", err)
	if rejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("amount-unbalanced replace status = %d, want %d; body %s", rejected.StatusCode(), http.StatusBadRequest, rejected.Body)
	}

	readAfterRejected, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "get transaction", err)
	if readAfterRejected.StatusCode() != http.StatusOK {
		t.Fatalf("read after amount-unbalanced replace status = %d, want %d; body %s", readAfterRejected.StatusCode(), http.StatusOK, readAfterRejected.Body)
	}
	assertRecordIDs(t, readAfterRejected.JSON200.Records, recordIDs(updated.JSON200.Records))
	if readAfterRejected.JSON200.Etag != updated.JSON200.Etag || !readAfterRejected.JSON200.UpdatedAt.Equal(updated.JSON200.UpdatedAt) {
		t.Fatalf("transaction changed after rejected replace: etag/updated_at = %q/%s, want %q/%s", readAfterRejected.JSON200.Etag, readAfterRejected.JSON200.UpdatedAt, updated.JSON200.Etag, updated.JSON200.UpdatedAt)
	}
	for index, record := range readAfterRejected.JSON200.Records {
		want := updated.JSON200.Records[index]
		if record.Amount != want.Amount || record.CreatedAt != want.CreatedAt || record.UpdatedAt != want.UpdatedAt {
			t.Fatalf("record %d changed after rejected replace: amount/created_at/updated_at = %s/%s/%s, want %s/%s/%s", record.RecordId, record.Amount, record.CreatedAt, record.UpdatedAt, want.Amount, want.CreatedAt, want.UpdatedAt)
		}
	}

	usdUnbalanced := replacementTransactionRequest(refs)
	usdUnbalanced.Records[0].AmountUsd = nil
	usdUnbalanced.Records[1].AmountUsd = apptest.StringPtr("19.00")
	usdUpdated, err := client.ReplaceTransactionRetainingRecords(context.Background(), updated.JSON200, usdUnbalanced)
	requireNoTransportError(t, "replace transaction", err)
	if usdUpdated.StatusCode() != http.StatusOK {
		t.Fatalf("usd-unbalanced replace status = %d, want %d; body %s", usdUpdated.StatusCode(), http.StatusOK, usdUpdated.Body)
	}

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "get transaction", err)
	if read.StatusCode() != http.StatusOK {
		t.Fatalf("read after usd-unbalanced replace status = %d, want %d; body %s", read.StatusCode(), http.StatusOK, read.Body)
	}
	if read.JSON200.Records[0].AmountUsd == nil || *read.JSON200.Records[0].AmountUsd != "-20.00000000" {
		t.Fatalf("first amount_usd after replace = %v, want -20.00000000", read.JSON200.Records[0].AmountUsd)
	}
	if read.JSON200.Records[1].AmountUsd == nil || *read.JSON200.Records[1].AmountUsd != "19.00000000" {
		t.Fatalf("second amount_usd after replace = %v, want 19.00000000", read.JSON200.Records[1].AmountUsd)
	}
}

func TestTransactionReplaceDateOnlyAdvancesTransactionTimestampBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	request := balancedTransactionRequest(refs)
	created := createTransaction(t, client, request).JSON201

	replacement := request
	replacement.InitiatedDate = apptest.Date("2024-03-09")
	response, err := client.ReplaceTransactionRetainingRecords(
		context.Background(),
		created,
		replacement,
	)
	requireNoTransportError(t, "replace transaction date only", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("date-only replacement status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if response.JSON200.Etag == created.Etag || !created.UpdatedAt.Before(response.JSON200.UpdatedAt) {
		t.Fatalf("date-only replacement etag/updated_at = %q/%s, want after %q/%s", response.JSON200.Etag, response.JSON200.UpdatedAt, created.Etag, created.UpdatedAt)
	}
	for index, record := range response.JSON200.Records {
		before := created.Records[index]
		if record.RecordId != before.RecordId || !record.CreatedAt.Equal(before.CreatedAt) || !record.UpdatedAt.Equal(before.UpdatedAt) {
			t.Fatalf("date-only replacement record %d identity/timestamps = %d/%s/%s, want %d/%s/%s", index, record.RecordId, record.CreatedAt, record.UpdatedAt, before.RecordId, before.CreatedAt, before.UpdatedAt)
		}
	}
}

func TestTransactionReplaceMatchesRetainedRecordsByIDNotPositionBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	request := balancedTransactionRequest(refs)
	created := createTransaction(t, client, request)

	firstMemo := "fields retained with first record identity"
	first := request.Records[0]
	first.Amount = "-17.00"
	first.Memo = &firstMemo
	secondMemo := "fields retained with second record identity"
	second := request.Records[1]
	second.Amount = "17.00"
	second.Memo = &secondMemo
	reordered := httpclient.UpdateTransactionRequest{
		InitiatedDate: request.InitiatedDate,
		Records: []httpclient.UpdateTransactionRequest_Records_Item{
			apptest.ExistingTransactionRecord(created.JSON201.Records[1].RecordId, second),
			apptest.ExistingTransactionRecord(created.JSON201.Records[0].RecordId, first),
		},
	}

	replaced, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		created.JSON201.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: created.JSON201.Etag},
		reordered,
	)
	requireNoTransportError(t, "replace transaction with reordered retained identities", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("reordered retained replace status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}

	byID := make(map[int64]httpclient.JournalRecord, len(replaced.JSON200.Records))
	for _, record := range replaced.JSON200.Records {
		byID[record.RecordId] = record
	}
	wants := []struct {
		id      int64
		account int64
		amount  string
		memo    string
	}{
		{id: created.JSON201.Records[0].RecordId, account: first.AccountId, amount: "-17.00000000", memo: firstMemo},
		{id: created.JSON201.Records[1].RecordId, account: second.AccountId, amount: "17.00000000", memo: secondMemo},
	}
	for _, want := range wants {
		got, ok := byID[want.id]
		if !ok || got.AccountId != want.account || got.Amount != want.amount || got.Memo == nil || *got.Memo != want.memo {
			t.Fatalf("record %d after reordered retention = %+v, want account/amount/memo %d/%s/%q", want.id, got, want.account, want.amount, want.memo)
		}
	}
}

func TestTransactionReplaceIdentityPreconditionsAndProvenanceBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	created := createTransaction(t, client, balancedTransactionRequest(refs))
	current := created.JSON201
	if len(current.Etag) < 3 || current.Etag[0] != '"' || current.Etag[len(current.Etag)-1] != '"' {
		t.Fatalf("transaction etag = %q, want strong quoted value", current.Etag)
	}
	wantETag := strconv.Quote(current.UpdatedAt.UTC().Format(time.RFC3339Nano))
	if current.Etag != wantETag {
		t.Fatalf("transaction etag = %q, want quoted canonical updated_at %q", current.Etag, wantETag)
	}

	base := balancedTransactionRequest(refs)
	noOp := httpclient.UpdateTransactionRequest{
		InitiatedDate: base.InitiatedDate,
		Records: []httpclient.UpdateTransactionRequest_Records_Item{
			apptest.ExistingTransactionRecord(current.Records[0].RecordId, base.Records[0]),
			apptest.ExistingTransactionRecord(current.Records[1].RecordId, base.Records[1]),
		},
	}

	missing, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		current.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: current.Etag},
		noOp,
		func(_ context.Context, request *http.Request) error {
			request.Header.Del("If-Match")
			return nil
		},
	)
	requireNoTransportError(t, "replace transaction without precondition", err)
	if missing.StatusCode() != http.StatusPreconditionRequired || missing.JSON428 == nil || missing.JSON428.Error.Code != httpclient.APIErrorCodePreconditionRequired {
		t.Fatalf("missing-precondition response = %d/%+v, want 428/%q; body %s", missing.StatusCode(), missing.JSON428, httpclient.APIErrorCodePreconditionRequired, missing.Body)
	}

	for _, etag := range []string{`W/"opaque"`, `opaque`} {
		malformed, err := client.REST().ReplaceTransactionWithResponse(
			context.Background(),
			current.TransactionId,
			&httpclient.ReplaceTransactionParams{IfMatch: etag},
			noOp,
		)
		requireNoTransportError(t, "replace transaction with malformed ETag", err)
		if malformed.StatusCode() != http.StatusBadRequest || malformed.JSON400 == nil || malformed.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
			t.Fatalf("malformed precondition %q response = %d/%+v, want 400/%q; body %s", etag, malformed.StatusCode(), malformed.JSON400, httpclient.APIErrorCodeInvalidRequest, malformed.Body)
		}
	}

	for _, etag := range []string{`"opaque"`, `""`, `"opaque\q"`} {
		opaque, err := client.REST().ReplaceTransactionWithResponse(
			context.Background(),
			current.TransactionId,
			&httpclient.ReplaceTransactionParams{IfMatch: etag},
			noOp,
		)
		requireNoTransportError(t, "replace transaction with nonmatching opaque ETag", err)
		if opaque.StatusCode() != http.StatusPreconditionFailed || opaque.JSON412 == nil || opaque.JSON412.Error.Code != httpclient.APIErrorCodePreconditionFailed {
			t.Fatalf("opaque precondition %q response = %d/%+v, want 412/%q; body %s", etag, opaque.StatusCode(), opaque.JSON412, httpclient.APIErrorCodePreconditionFailed, opaque.Body)
		}
	}

	zeroTime, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		current.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: `"0001-01-01T00:00:00Z"`},
		noOp,
	)
	requireNoTransportError(t, "replace transaction with zero-time ETag", err)
	if zeroTime.StatusCode() != http.StatusPreconditionFailed || zeroTime.JSON412 == nil || zeroTime.JSON412.Error.Code != httpclient.APIErrorCodePreconditionFailed {
		t.Fatalf("zero-time precondition response = %d/%+v, want 412/%q; body %s", zeroTime.StatusCode(), zeroTime.JSON412, httpclient.APIErrorCodePreconditionFailed, zeroTime.Body)
	}

	unchanged, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		current.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: current.Etag},
		noOp,
	)
	requireNoTransportError(t, "replace transaction exact no-op", err)
	if unchanged.StatusCode() != http.StatusOK {
		t.Fatalf("exact no-op status = %d, want %d; body %s", unchanged.StatusCode(), http.StatusOK, unchanged.Body)
	}
	if unchanged.JSON200.Etag != current.Etag || !unchanged.JSON200.UpdatedAt.Equal(current.UpdatedAt) {
		t.Fatalf("exact no-op etag/updated_at = %q/%s, want %q/%s", unchanged.JSON200.Etag, unchanged.JSON200.UpdatedAt, current.Etag, current.UpdatedAt)
	}
	for index := range current.Records {
		if unchanged.JSON200.Records[index].CreatedAt != current.Records[index].CreatedAt || unchanged.JSON200.Records[index].UpdatedAt != current.Records[index].UpdatedAt {
			t.Fatalf("exact no-op record %d timestamps changed from %s/%s to %s/%s", current.Records[index].RecordId, current.Records[index].CreatedAt, current.Records[index].UpdatedAt, unchanged.JSON200.Records[index].CreatedAt, unchanged.JSON200.Records[index].UpdatedAt)
		}
	}

	provenanceBody := map[string]any{
		"initiated_date": base.InitiatedDate.String(),
		"records": []any{
			map[string]any{
				"record_id": current.Records[0].RecordId, "account_id": base.Records[0].AccountId, "currency": "USD", "amount": "-10.00",
				"settlement": base.Records[0].Settlement, "reconciliation_status": base.Records[0].ReconciliationStatus, "source": "manual",
			},
			map[string]any{
				"record_id": current.Records[1].RecordId, "account_id": base.Records[1].AccountId, "currency": "USD", "amount": "10.00",
				"category_id": base.Records[1].CategoryId, "settlement": nil, "reconciliation_status": base.Records[1].ReconciliationStatus,
			},
		},
	}
	provenanceRejected, err := client.REST().ReplaceTransactionWithBodyWithResponse(
		context.Background(),
		current.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: current.Etag},
		"application/json",
		apptest.JSONReader(provenanceBody),
	)
	requireNoTransportError(t, "replace existing transaction record with provenance", err)
	if provenanceRejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("existing provenance status = %d, want %d; body %s", provenanceRejected.StatusCode(), http.StatusBadRequest, provenanceRejected.Body)
	}

	externalID := "provider-record-42"
	externalSystem := "test-provider"
	retained := base.Records[0]
	retained.Amount = "-25.00"
	retained.AmountUsd = nil
	newImported := base.Records[1]
	newImported.Amount = "25.00"
	newImported.AmountUsd = apptest.StringPtr("23.50")
	newImported.Source = httpclient.WritableSourceImported
	newImported.ExternalId = &externalID
	newImported.ExternalSystem = &externalSystem
	material := httpclient.UpdateTransactionRequest{
		InitiatedDate: base.InitiatedDate,
		Records: []httpclient.UpdateTransactionRequest_Records_Item{
			apptest.ExistingTransactionRecord(current.Records[0].RecordId, retained),
			apptest.NewTransactionRecord(newImported),
		},
	}
	replaced, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		current.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: current.Etag},
		material,
	)
	requireNoTransportError(t, "replace transaction with retained and imported records", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("identity replacement status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	winner := replaced.JSON200
	if winner.Etag == current.Etag || !current.UpdatedAt.Before(winner.UpdatedAt) {
		t.Fatalf("material replacement etag/updated_at = %q/%s, want changed after %q/%s", winner.Etag, winner.UpdatedAt, current.Etag, current.UpdatedAt)
	}
	if winner.Records[0].RecordId != current.Records[0].RecordId || winner.Records[0].CreatedAt != current.Records[0].CreatedAt {
		t.Fatalf("retained record identity/created_at = %d/%s, want %d/%s", winner.Records[0].RecordId, winner.Records[0].CreatedAt, current.Records[0].RecordId, current.Records[0].CreatedAt)
	}
	if !current.Records[0].UpdatedAt.Before(winner.Records[0].UpdatedAt) {
		t.Fatalf("retained record updated_at = %s, want after %s", winner.Records[0].UpdatedAt, current.Records[0].UpdatedAt)
	}
	if winner.Records[1].RecordId == current.Records[1].RecordId ||
		winner.Records[1].Source != httpclient.Imported ||
		winner.Records[1].ExternalId == nil || *winner.Records[1].ExternalId != externalID ||
		winner.Records[1].ExternalSystem == nil || *winner.Records[1].ExternalSystem != externalSystem ||
		winner.Records[1].AmountUsd == nil || *winner.Records[1].AmountUsd != "23.50000000" {
		t.Fatalf("new imported record = %+v, want new identity with preserved importer provenance", winner.Records[1])
	}
	if winner.Records[0].AmountUsd == nil || *winner.Records[0].AmountUsd != "-25.00000000" {
		t.Fatalf("changed retained amount_usd = %v, want inferred -25.00000000", winner.Records[0].AmountUsd)
	}

	stale, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		current.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: current.Etag},
		noOp,
	)
	requireNoTransportError(t, "replace transaction with stale precondition", err)
	if stale.StatusCode() != http.StatusPreconditionFailed || stale.JSON412 == nil || stale.JSON412.Error.Code != httpclient.APIErrorCodePreconditionFailed {
		t.Fatalf("stale-precondition response = %d/%+v, want 412/%q; body %s", stale.StatusCode(), stale.JSON412, httpclient.APIErrorCodePreconditionFailed, stale.Body)
	}
	readWinner := getTransaction(t, client, current.TransactionId)
	if readWinner.JSON200.Etag != winner.Etag || recordIDs(readWinner.JSON200.Records)[1] != winner.Records[1].RecordId {
		t.Fatalf("transaction changed after stale write: got %+v, want winner %+v", readWinner.JSON200, winner)
	}

	manualReplacement := newImported
	manualReplacement.Source = httpclient.WritableSourceManual
	manualReplacement.ExternalId = nil
	manualReplacement.ExternalSystem = nil
	omitImported := httpclient.UpdateTransactionRequest{
		InitiatedDate: base.InitiatedDate,
		Records: []httpclient.UpdateTransactionRequest_Records_Item{
			apptest.ExistingTransactionRecord(winner.Records[0].RecordId, retained),
			apptest.NewTransactionRecord(manualReplacement),
		},
	}
	importedRejected, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		winner.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: winner.Etag},
		omitImported,
	)
	requireNoTransportError(t, "replace transaction omitting imported record", err)
	if importedRejected.StatusCode() != http.StatusConflict || importedRejected.JSON409 == nil {
		t.Fatalf("omit imported record response = %d/%+v, want 409; body %s", importedRejected.StatusCode(), importedRejected.JSON409, importedRejected.Body)
	}

	duplicate := httpclient.UpdateTransactionRequest{
		InitiatedDate: base.InitiatedDate,
		Records: []httpclient.UpdateTransactionRequest_Records_Item{
			apptest.ExistingTransactionRecord(winner.Records[0].RecordId, retained),
			apptest.ExistingTransactionRecord(winner.Records[0].RecordId, newImported),
		},
	}
	duplicateRejected, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		winner.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: winner.Etag},
		duplicate,
	)
	requireNoTransportError(t, "replace transaction with duplicate record ID", err)
	if duplicateRejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("duplicate record ID status = %d, want %d; body %s", duplicateRejected.StatusCode(), http.StatusBadRequest, duplicateRejected.Body)
	}

	other := createTransaction(t, client, balancedTransactionRequest(refs))
	foreign := httpclient.UpdateTransactionRequest{
		InitiatedDate: base.InitiatedDate,
		Records: []httpclient.UpdateTransactionRequest_Records_Item{
			apptest.ExistingTransactionRecord(other.JSON201.Records[0].RecordId, retained),
			apptest.ExistingTransactionRecord(winner.Records[1].RecordId, newImported),
		},
	}
	foreignRejected, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		winner.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: winner.Etag},
		foreign,
	)
	requireNoTransportError(t, "replace transaction with foreign record ID", err)
	if foreignRejected.StatusCode() != http.StatusBadRequest {
		t.Fatalf("foreign record ID status = %d, want %d; body %s", foreignRejected.StatusCode(), http.StatusBadRequest, foreignRejected.Body)
	}
}

func TestTransactionReplaceSubMicrosecondSettlementIsExactNoOpBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	request := balancedTransactionRequest(refs)
	pendingDate := apptest.Timestamp("2024-03-10T12:34:56.123456789Z")
	postedDate := apptest.Timestamp("2024-03-11T12:34:56.987654321Z")
	request.Records[0].Settlement = &httpclient.SettlementIntent{
		Status:      httpclient.SettlementStatusPosted,
		PendingDate: &pendingDate,
		PostedDate:  &postedDate,
	}
	created := createTransaction(t, client, request).JSON201

	current := created
	for attempt := 1; attempt <= 2; attempt++ {
		replaced, err := client.ReplaceTransactionRetainingRecords(context.Background(), current, request)
		requireNoTransportError(t, "replace transaction with sub-microsecond settlement", err)
		if replaced.StatusCode() != http.StatusOK {
			t.Fatalf("replacement %d status = %d, want %d; body %s", attempt, replaced.StatusCode(), http.StatusOK, replaced.Body)
		}
		if replaced.JSON200.Etag != created.Etag || !replaced.JSON200.UpdatedAt.Equal(created.UpdatedAt) {
			t.Fatalf("replacement %d etag/updated_at = %q/%s, want %q/%s", attempt, replaced.JSON200.Etag, replaced.JSON200.UpdatedAt, created.Etag, created.UpdatedAt)
		}
		current = replaced.JSON200
	}
}

func TestTransactionReplaceDateOnlyPreservesStoredAmountUSDWhenValuationOmittedBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	checking := client.Scenario().AccountWithCurrency("checking:PreservedValuation", "CHF")
	request := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            checking.AccountId,
				Amount:               "-12.34",
				AmountUsd:            apptest.StringPtr("-7.89"),
				Currency:             "CHF",
				ReconciliationStatus: httpclient.Unreconciled,
				Settlement:           apptest.PostedSettlement(),
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Amount:               "12.34",
				AmountUsd:            apptest.StringPtr("7.89"),
				CategoryId:           &refs.CategoryId,
				Currency:             "CHF",
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	}
	created := createTransaction(t, client, request)

	records := make([]httpclient.UpdateTransactionRequest_Records_Item, len(request.Records))
	for index, record := range request.Records {
		record.AmountUsd = nil
		records[index] = apptest.ExistingTransactionRecord(created.JSON201.Records[index].RecordId, record)
	}
	replaced, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		created.JSON201.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: created.JSON201.Etag},
		httpclient.UpdateTransactionRequest{
			InitiatedDate: apptest.Date("2024-03-11"),
			Records:       records,
		},
	)
	requireNoTransportError(t, "replace transaction without repeated valuation", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace transaction status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	want := []string{"-7.89000000", "7.89000000"}
	for index, record := range replaced.JSON200.Records {
		if record.AmountUsd == nil || *record.AmountUsd != want[index] {
			t.Fatalf("record %d amount_usd = %v, want %s", record.RecordId, record.AmountUsd, want[index])
		}
	}
}

func TestTransactionReplacePreservesStoredNullAmountUSDOnExactNoOpBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	checking := client.Scenario().AccountWithCurrency("checking:PreservedNullValuation", "CHF")
	request := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-10"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            checking.AccountId,
				Amount:               "-12.34",
				Currency:             "CHF",
				ReconciliationStatus: httpclient.Unreconciled,
				Settlement: &httpclient.SettlementIntent{
					Status:     httpclient.SettlementStatusPosted,
					PostedDate: apptest.TimestampPtr("2024-03-10T23:59:59Z"),
				},
				Source: httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Amount:               "12.34",
				CategoryId:           &refs.CategoryId,
				Currency:             "CHF",
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	}
	created := createTransaction(t, client, request)
	for _, record := range created.JSON201.Records {
		if record.AmountUsd != nil {
			t.Fatalf("created record %d amount_usd = %v, want nil", record.RecordId, record.AmountUsd)
		}
	}

	createExchangeRate(t, client, "USD", "CHF", "0.90000000", "2024-03-10T00:00:00Z")
	replaced, err := client.ReplaceTransactionRetainingRecords(context.Background(), created.JSON201, request)
	requireNoTransportError(t, "replace transaction exact no-op after rate becomes available", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("exact no-op status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	if replaced.JSON200.Etag != created.JSON201.Etag || !replaced.JSON200.UpdatedAt.Equal(created.JSON201.UpdatedAt) {
		t.Fatalf("exact no-op etag/updated_at = %q/%s, want %q/%s", replaced.JSON200.Etag, replaced.JSON200.UpdatedAt, created.JSON201.Etag, created.JSON201.UpdatedAt)
	}
	for _, record := range replaced.JSON200.Records {
		if record.AmountUsd != nil {
			t.Fatalf("replaced record %d amount_usd = %v, want nil", record.RecordId, record.AmountUsd)
		}
	}
}

func TestTransactionReplaceEquivalentTagOrderIsExactNoOpBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	secondTag := client.Scenario().Tag("Purpose:Reordered")
	request := balancedTransactionRequest(refs)
	request.Records[0].TagIds = apptest.Int64SlicePtr(refs.TagId, secondTag.TagId)
	created := createTransaction(t, client, request)

	request.Records[0].TagIds = apptest.Int64SlicePtr(secondTag.TagId, refs.TagId)
	replaced, err := client.ReplaceTransactionRetainingRecords(
		context.Background(),
		created.JSON201,
		request,
	)
	requireNoTransportError(t, "replace transaction with reordered tags", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("reordered-tag replace status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	if replaced.JSON200.Etag != created.JSON201.Etag || !replaced.JSON200.UpdatedAt.Equal(created.JSON201.UpdatedAt) {
		t.Fatalf("reordered-tag etag/updated_at = %q/%s, want %q/%s", replaced.JSON200.Etag, replaced.JSON200.UpdatedAt, created.JSON201.Etag, created.JSON201.UpdatedAt)
	}
	for index := range created.JSON201.Records {
		if replaced.JSON200.Records[index].UpdatedAt != created.JSON201.Records[index].UpdatedAt {
			t.Fatalf("reordered-tag record %d updated_at = %s, want %s", replaced.JSON200.Records[index].RecordId, replaced.JSON200.Records[index].UpdatedAt, created.JSON201.Records[index].UpdatedAt)
		}
	}
}

func TestTransactionReplaceInfersMissingNonUSDAmountUSD(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	createExchangeRate(t, client, "USD", "EUR", "1.10000000", "2024-03-12T00:00:00Z")
	eurCash := client.Scenario().AccountWithCurrency("cash:Replace:EUR", "EUR")
	eurMerchant := client.Scenario().Account("merchant:Replace:EuroCoffee")
	replacement := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-12"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            eurCash.AccountId,
				Currency:             "EUR",
				Amount:               "-11.00",
				Settlement:           apptest.PostedSettlement(),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            eurMerchant.AccountId,
				Currency:             "EUR",
				Amount:               "11.00",
				CategoryId:           apptest.Int64Ptr(refs.CategoryId),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	}

	replaced, err := client.ReplaceTransactionRetainingRecords(context.Background(), created.JSON201, replacement)
	requireNoTransportError(t, "replace transaction", err)
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	assertRecordAmountUSD(t, *replaced.JSON200, eurCash.AccountId, "-10.00000000")
	assertRecordAmountUSD(t, *replaced.JSON200, eurMerchant.AccountId, "10.00000000")
}

func TestTransactionDeleteTombstonesRecordsBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	created, err := client.REST().CreateTransactionWithResponse(context.Background(), balancedTransactionRequest(refs))
	requireNoTransportError(t, "create transaction", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "delete transaction", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}

	read, err := client.REST().GetTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "get transaction", err)
	if read.StatusCode() != http.StatusNotFound {
		t.Fatalf("read tombstoned transaction status = %d, want %d; body %s", read.StatusCode(), http.StatusNotFound, read.Body)
	}

	list, err := client.REST().ListTransactionsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "list transactions", err)
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	if len(list.JSON200.Transactions) != 0 {
		t.Fatalf("transaction count after delete = %d, want 0; body %+v", len(list.JSON200.Transactions), list.JSON200)
	}

	records, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "search records", err)
	if records.StatusCode() != http.StatusOK {
		t.Fatalf("record search status = %d, want %d; body %s", records.StatusCode(), http.StatusOK, records.Body)
	}
	if len(records.JSON200.Records) != 0 {
		t.Fatalf("record count after delete = %d, want 0; body %+v", len(records.JSON200.Records), records.JSON200)
	}

	secondDelete, err := client.REST().DeleteTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "delete transaction", err)
	if secondDelete.StatusCode() != http.StatusNotFound {
		t.Fatalf("second delete status = %d, want %d; body %s", secondDelete.StatusCode(), http.StatusNotFound, secondDelete.Body)
	}
}

func TestTransactionCancelBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)

	request := balancedTransactionRequest(refs)
	request.Records[0].Settlement = apptest.PendingSettlement()
	request.Records[0].ReconciliationStatus = httpclient.Unreconciled
	created, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	requireNoTransportError(t, "create transaction to cancel", err)
	if created.StatusCode() != http.StatusCreated {
		t.Fatalf("create transaction to cancel status = %d, want %d; body %s", created.StatusCode(), http.StatusCreated, created.Body)
	}

	cancelled, err := client.REST().CancelTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "cancel transaction", err)
	if cancelled.StatusCode() != http.StatusOK {
		t.Fatalf("cancel transaction status = %d, want %d; body %s", cancelled.StatusCode(), http.StatusOK, cancelled.Body)
	}
	apptest.AssertTransactionLifecycle(t, cancelled.JSON200, httpclient.TransactionLifecycleStatusCancelled)
	assertTransactionCancelPreservedFields(t, created.JSON201.Records, cancelled.JSON200.Records)

	replaced, err := client.ReplaceTransactionRetainingRecords(context.Background(), cancelled.JSON200, replacementTransactionRequest(refs))
	requireNoTransportError(t, "replace cancelled transaction", err)
	if replaced.StatusCode() != http.StatusBadRequest {
		t.Fatalf("replace cancelled status = %d, want %d; body %s", replaced.StatusCode(), http.StatusBadRequest, replaced.Body)
	}

	settled, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
		RecordIds:  []int64{created.JSON201.Records[0].RecordId},
		Settlement: httpclient.SettlementStatusPosted,
	})
	requireNoTransportError(t, "settle cancelled transaction record", err)
	if settled.StatusCode() != http.StatusBadRequest {
		t.Fatalf("settle cancelled status = %d, want %d; body %s", settled.StatusCode(), http.StatusBadRequest, settled.Body)
	}

	reconciled, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{
		RecordIds:            []int64{created.JSON201.Records[1].RecordId},
		ReconciliationStatus: httpclient.Reconciled,
	})
	requireNoTransportError(t, "reconcile cancelled transaction record", err)
	if reconciled.StatusCode() != http.StatusBadRequest {
		t.Fatalf("reconcile cancelled status = %d, want %d; body %s", reconciled.StatusCode(), http.StatusBadRequest, reconciled.Body)
	}

	reassigned, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{
		RecordIds: []int64{created.JSON201.Records[1].RecordId},
		AccountId: refs.MerchantAccountId,
	})
	requireNoTransportError(t, "reassign cancelled transaction record", err)
	if reassigned.StatusCode() != http.StatusBadRequest {
		t.Fatalf("reassign cancelled status = %d, want %d; body %s", reassigned.StatusCode(), http.StatusBadRequest, reassigned.Body)
	}

	repeated, err := client.REST().CancelTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "repeat cancel transaction", err)
	if repeated.StatusCode() != http.StatusOK {
		t.Fatalf("repeat cancel transaction status = %d, want %d; body %s", repeated.StatusCode(), http.StatusOK, repeated.Body)
	}
	apptest.AssertTransactionLifecycle(t, repeated.JSON200, httpclient.TransactionLifecycleStatusCancelled)
	if repeated.JSON200.Etag != cancelled.JSON200.Etag || !repeated.JSON200.UpdatedAt.Equal(cancelled.JSON200.UpdatedAt) {
		t.Fatalf("repeat cancel etag/updated_at = %q/%s, want %q/%s", repeated.JSON200.Etag, repeated.JSON200.UpdatedAt, cancelled.JSON200.Etag, cancelled.JSON200.UpdatedAt)
	}

	accountIDs := []int64{refs.CheckingAccountId}
	balances, err := client.REST().ListAccountBalancesWithResponse(context.Background(), &httpclient.ListAccountBalancesParams{AccountIds: &accountIDs})
	requireNoTransportError(t, "list account balances after cancel", err)
	if balances.StatusCode() != http.StatusOK {
		t.Fatalf("list account balances after cancel status = %d, want %d; body %s", balances.StatusCode(), http.StatusOK, balances.Body)
	}
	assertAccountBalances(t, balances.JSON200.Balances, []wantAccountBalance{
		{accountID: refs.CheckingAccountId, currency: "USD", current: "0.00000000", currentUSD: "0.00000000", posted: "0.00000000", unconvertedCount: 0},
	})

	totals, err := client.REST().GetTransactionMonthTotalsWithResponse(context.Background(), &httpclient.GetTransactionMonthTotalsParams{Month: "2024-03"})
	requireNoTransportError(t, "month totals after cancel", err)
	if totals.StatusCode() != http.StatusOK {
		t.Fatalf("month totals after cancel status = %d, want %d; body %s", totals.StatusCode(), http.StatusOK, totals.Body)
	}
	assertMonthTotal(t, "cancelled transaction spend", totals.JSON200.Spend, "0.00000000", 0)

	restored, err := client.REST().RestoreTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "restore transaction", err)
	if restored.StatusCode() != http.StatusOK {
		t.Fatalf("restore transaction status = %d, want %d; body %s", restored.StatusCode(), http.StatusOK, restored.Body)
	}
	apptest.AssertTransactionLifecycle(t, restored.JSON200, httpclient.TransactionLifecycleStatusActive)
	assertTransactionCancelPreservedFields(t, created.JSON201.Records, restored.JSON200.Records)

	restoredAgain, err := client.REST().RestoreTransactionWithResponse(context.Background(), created.JSON201.TransactionId)
	requireNoTransportError(t, "repeat restore transaction", err)
	if restoredAgain.StatusCode() != http.StatusOK {
		t.Fatalf("repeat restore transaction status = %d, want %d; body %s", restoredAgain.StatusCode(), http.StatusOK, restoredAgain.Body)
	}
	if restoredAgain.JSON200.Etag != restored.JSON200.Etag || !restoredAgain.JSON200.UpdatedAt.Equal(restored.JSON200.UpdatedAt) {
		t.Fatalf("repeat restore etag/updated_at = %q/%s, want %q/%s", restoredAgain.JSON200.Etag, restoredAgain.JSON200.UpdatedAt, restored.JSON200.Etag, restored.JSON200.UpdatedAt)
	}

	missing, err := client.REST().CancelTransactionWithResponse(context.Background(), created.JSON201.TransactionId+9999)
	requireNoTransportError(t, "cancel missing transaction", err)
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("cancel missing transaction status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	tombstoned := createTransaction(t, client, balancedTransactionRequest(refs))
	deleted, err := client.REST().DeleteTransactionWithResponse(context.Background(), tombstoned.JSON201.TransactionId)
	requireNoTransportError(t, "delete transaction before cancel", err)
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete transaction before cancel status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	cancelTombstoned, err := client.REST().CancelTransactionWithResponse(context.Background(), tombstoned.JSON201.TransactionId)
	requireNoTransportError(t, "cancel tombstoned transaction", err)
	if cancelTombstoned.StatusCode() != http.StatusNotFound {
		t.Fatalf("cancel tombstoned transaction status = %d, want %d; body %s", cancelTombstoned.StatusCode(), http.StatusNotFound, cancelTombstoned.Body)
	}
}

func TestTransactionCancelRestoreUpdatedAtOrderingBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	targetRequest := balancedTransactionRequest(refs)
	targetRequest.Records[0].Settlement = apptest.PendingSettlement()
	targetRequest.Records[0].ReconciliationStatus = httpclient.Unreconciled
	target := createTransaction(t, client, targetRequest)
	cancelPeer := createTransaction(t, client, balancedTransactionRequest(refs))

	cancelled, err := client.REST().CancelTransactionWithResponse(context.Background(), target.JSON201.TransactionId)
	requireNoTransportError(t, "cancel transaction for updated_at ordering", err)
	if cancelled.StatusCode() != http.StatusOK {
		t.Fatalf("cancel transaction for updated_at ordering status = %d, want %d; body %s", cancelled.StatusCode(), http.StatusOK, cancelled.Body)
	}
	if !cancelPeer.JSON201.UpdatedAt.Before(cancelled.JSON200.UpdatedAt) {
		t.Fatalf("cancelled updated_at = %s, want after peer %s", cancelled.JSON200.UpdatedAt, cancelPeer.JSON201.UpdatedAt)
	}

	sortUpdated := httpclient.ListTransactionsParamsSortUpdatedAt
	sortDescending := httpclient.ListTransactionsParamsSortDirDesc
	allLifecycleStatuses := "(lifecycle:active or lifecycle:cancelled)"
	afterCancel, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Filter:  &allLifecycleStatuses,
		Sort:    &sortUpdated,
		SortDir: &sortDescending,
	})
	requireNoTransportError(t, "list transactions after cancel by updated_at", err)
	assertTransactionListResponse(t, "transactions after cancel by updated_at", afterCancel, []int64{
		target.JSON201.TransactionId,
		cancelPeer.JSON201.TransactionId,
	}, 2)

	restorePeer := createTransaction(t, client, balancedTransactionRequest(refs))
	restored, err := client.REST().RestoreTransactionWithResponse(context.Background(), target.JSON201.TransactionId)
	requireNoTransportError(t, "restore transaction for updated_at ordering", err)
	if restored.StatusCode() != http.StatusOK {
		t.Fatalf("restore transaction for updated_at ordering status = %d, want %d; body %s", restored.StatusCode(), http.StatusOK, restored.Body)
	}
	if !restorePeer.JSON201.UpdatedAt.Before(restored.JSON200.UpdatedAt) {
		t.Fatalf("restored updated_at = %s, want after peer %s", restored.JSON200.UpdatedAt, restorePeer.JSON201.UpdatedAt)
	}

	activeLifecycleStatus := "lifecycle:active"
	afterRestore, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Filter:  &activeLifecycleStatus,
		Sort:    &sortUpdated,
		SortDir: &sortDescending,
	})
	requireNoTransportError(t, "list transactions after restore by updated_at", err)
	assertTransactionListResponse(t, "transactions after restore by updated_at", afterRestore, []int64{
		target.JSON201.TransactionId,
		restorePeer.JSON201.TransactionId,
		cancelPeer.JSON201.TransactionId,
	}, 3)
}

func TestRecordSearchFiltersBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)

	firstReq := balancedTransactionRequest(refs.transactionRefs)
	first, err := client.REST().CreateTransactionWithResponse(context.Background(), firstReq)
	requireNoTransportError(t, "create transaction", err)
	if first.StatusCode() != http.StatusCreated {
		t.Fatalf("first create status = %d, want %d; body %s", first.StatusCode(), http.StatusCreated, first.Body)
	}

	memo := "Rent"
	pendingDate := apptest.Timestamp("2024-04-01T00:00:00Z")
	secondReq := httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-04-01"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.SavingsAccountId,
				MemberId:             &refs.SecondMemberId,
				Currency:             "USD",
				Amount:               "-50.00",
				AmountUsd:            apptest.StringPtr("-50.00"),
				TagIds:               apptest.Int64SlicePtr(refs.SecondTagId),
				Memo:                 &memo,
				Settlement:           &httpclient.SettlementIntent{Status: httpclient.SettlementStatusPending, PendingDate: &pendingDate},
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "50.00",
				AmountUsd:            apptest.StringPtr("50.00"),
				CategoryId:           apptest.Int64Ptr(refs.SecondCategoryId),
				ReconciliationStatus: httpclient.Unreconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	}
	second, err := client.REST().CreateTransactionWithResponse(context.Background(), secondReq)
	requireNoTransportError(t, "create transaction", err)
	if second.StatusCode() != http.StatusCreated {
		t.Fatalf("second create status = %d, want %d; body %s", second.StatusCode(), http.StatusCreated, second.Body)
	}

	firstDebit := first.JSON201.Records[0]
	firstCredit := first.JSON201.Records[1]
	secondDebit := second.JSON201.Records[0]
	secondCredit := second.JSON201.Records[1]

	cases := []struct {
		name   string
		params *httpclient.SearchJournalRecordsParams
		want   []int64
	}{
		{name: "account", params: &httpclient.SearchJournalRecordsParams{AccountId: &refs.CheckingAccountId}, want: []int64{firstDebit.RecordId}},
		{name: "category", params: &httpclient.SearchJournalRecordsParams{CategoryId: &refs.CategoryId}, want: []int64{firstCredit.RecordId}},
		{name: "tag", params: &httpclient.SearchJournalRecordsParams{TagId: &refs.TagId}, want: []int64{firstDebit.RecordId}},
		{name: "member", params: &httpclient.SearchJournalRecordsParams{MemberId: &refs.MemberId}, want: []int64{firstDebit.RecordId}},
		{name: "settlement", params: &httpclient.SearchJournalRecordsParams{Settlement: ptrTo(httpclient.SettlementStatusPending)}, want: []int64{secondDebit.RecordId}},
		{name: "reconciliation status", params: &httpclient.SearchJournalRecordsParams{ReconciliationStatus: ptrTo(httpclient.Unreconciled)}, want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "amount min", params: &httpclient.SearchJournalRecordsParams{AmountMin: new("40.00")}, want: []int64{secondCredit.RecordId}},
		{name: "amount max", params: &httpclient.SearchJournalRecordsParams{AmountMax: new("-40.00")}, want: []int64{secondDebit.RecordId}},
		{name: "amount usd min", params: &httpclient.SearchJournalRecordsParams{AmountUsdMin: apptest.StringPtr("40.00")}, want: []int64{secondCredit.RecordId}},
		{name: "amount usd max", params: &httpclient.SearchJournalRecordsParams{AmountUsdMax: apptest.StringPtr("-40.00")}, want: []int64{secondDebit.RecordId}},
		{name: "initiated from", params: &httpclient.SearchJournalRecordsParams{InitiatedDateFrom: apptest.DatePtr("2024-04-01")}, want: []int64{secondDebit.RecordId, secondCredit.RecordId}},
		{name: "initiated to", params: &httpclient.SearchJournalRecordsParams{InitiatedDateTo: apptest.DatePtr("2024-03-31")}, want: []int64{firstDebit.RecordId, firstCredit.RecordId}},
		{name: "pending from", params: &httpclient.SearchJournalRecordsParams{PendingDateFrom: apptest.TimestampPtr("2024-04-01T00:00:00Z")}, want: []int64{secondDebit.RecordId}},
		{name: "pending to", params: &httpclient.SearchJournalRecordsParams{PendingDateTo: apptest.TimestampPtr("2024-03-31T00:00:00Z")}, want: []int64{firstDebit.RecordId}},
		{name: "posted from", params: &httpclient.SearchJournalRecordsParams{PostedDateFrom: apptest.TimestampPtr("2024-03-11T00:00:00Z")}, want: []int64{firstDebit.RecordId}},
		{name: "posted to", params: &httpclient.SearchJournalRecordsParams{PostedDateTo: apptest.TimestampPtr("2024-03-11T00:00:00Z")}, want: []int64{firstDebit.RecordId}},
		{name: "memo", params: &httpclient.SearchJournalRecordsParams{MemoContains: new("unc")}, want: []int64{firstDebit.RecordId}},
		{name: "combined", params: &httpclient.SearchJournalRecordsParams{CategoryId: &refs.CategoryId, TagId: &refs.TagId, MemoContains: new("Lunch")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), tc.params)
			requireNoTransportError(t, "search records", err)
			if got.StatusCode() != http.StatusOK {
				t.Fatalf("search status = %d, want %d; body %s", got.StatusCode(), http.StatusOK, got.Body)
			}
			assertRecordIDs(t, got.JSON200.Records, tc.want)
		})
	}

	accountRecords, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil)
	requireNoTransportError(t, "search account records", err)
	if accountRecords.StatusCode() != http.StatusOK {
		t.Fatalf("account records status = %d, want %d; body %s", accountRecords.StatusCode(), http.StatusOK, accountRecords.Body)
	}
	assertRecordIDs(t, accountRecords.JSON200.Records, []int64{firstDebit.RecordId})
	if settlement := accountRecords.JSON200.Records[0].Settlement; settlement == nil || *settlement != httpclient.SettlementStatusPosted {
		t.Fatalf("account record settlement = %v, want posted", settlement)
	}
	if accountRecords.JSON200.Records[0].TransactionId != first.JSON201.TransactionId {
		t.Fatalf("account record transaction_id = %d, want %d", accountRecords.JSON200.Records[0].TransactionId, first.JSON201.TransactionId)
	}
	if got := accountRecords.JSON200.Records[0].InitiatedDate.String(); got != "2024-03-10" {
		t.Fatalf("account record initiated_date = %q, want 2024-03-10", got)
	}

	accountDateFiltered, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.SavingsAccountId, &httpclient.SearchAccountJournalRecordsParams{
		InitiatedDateFrom: apptest.DatePtr("2024-04-01"),
	})
	requireNoTransportError(t, "search account records", err)
	if accountDateFiltered.StatusCode() != http.StatusOK {
		t.Fatalf("account date filter status = %d, want %d; body %s", accountDateFiltered.StatusCode(), http.StatusOK, accountDateFiltered.Body)
	}
	assertRecordIDs(t, accountDateFiltered.JSON200.Records, []int64{secondDebit.RecordId})

	accountPendingFiltered, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.SavingsAccountId, &httpclient.SearchAccountJournalRecordsParams{
		PendingDateFrom: apptest.TimestampPtr("2024-04-01T00:00:00Z"),
	})
	requireNoTransportError(t, "search account records", err)
	if accountPendingFiltered.StatusCode() != http.StatusOK {
		t.Fatalf("account pending date filter status = %d, want %d; body %s", accountPendingFiltered.StatusCode(), http.StatusOK, accountPendingFiltered.Body)
	}
	assertRecordIDs(t, accountPendingFiltered.JSON200.Records, []int64{secondDebit.RecordId})
	if settlement := accountPendingFiltered.JSON200.Records[0].Settlement; settlement == nil || *settlement != httpclient.SettlementStatusPending {
		t.Fatalf("pending account record settlement = %v, want pending", settlement)
	}

	accountAmountFiltered, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		AmountMax: new("-10.00"),
	})
	requireNoTransportError(t, "search account records", err)
	if accountAmountFiltered.StatusCode() != http.StatusOK {
		t.Fatalf("account amount filter status = %d, want %d; body %s", accountAmountFiltered.StatusCode(), http.StatusOK, accountAmountFiltered.Body)
	}
	assertRecordIDs(t, accountAmountFiltered.JSON200.Records, []int64{firstDebit.RecordId})

	unsupported, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("bad=1"))
	requireNoTransportError(t, "search records", err)
	if unsupported.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unsupported filter status = %d, want %d; body %s", unsupported.StatusCode(), http.StatusBadRequest, unsupported.Body)
	}
	invalidDecimal, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("amount_min=not-a-decimal"))
	requireNoTransportError(t, "search records", err)
	if invalidDecimal.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid decimal filter status = %d, want %d; body %s", invalidDecimal.StatusCode(), http.StatusBadRequest, invalidDecimal.Body)
	}
	invalidDate, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("initiated_date_from=2024-02-30"))
	requireNoTransportError(t, "search records", err)
	if invalidDate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid date filter status = %d, want %d; body %s", invalidDate.StatusCode(), http.StatusBadRequest, invalidDate.Body)
	}
	invalidSettlement, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("settlement=unknown"))
	requireNoTransportError(t, "search records", err)
	if invalidSettlement.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid settlement filter status = %d, want %d; body %s", invalidSettlement.StatusCode(), http.StatusBadRequest, invalidSettlement.Body)
	}
	invalidReconciliationStatus, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery("reconciliation_status=unknown"))
	requireNoTransportError(t, "search records", err)
	if invalidReconciliationStatus.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid reconciliation status filter status = %d, want %d; body %s", invalidReconciliationStatus.StatusCode(), http.StatusBadRequest, invalidReconciliationStatus.Body)
	}
	accountIDOnAccountView, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil, apptest.ReplaceRawQuery("account_id="+apptest.FormatID(refs.SavingsAccountId)))
	requireNoTransportError(t, "search account records", err)
	if accountIDOnAccountView.StatusCode() != http.StatusBadRequest {
		t.Fatalf("account_id on account view status = %d, want %d; body %s", accountIDOnAccountView.StatusCode(), http.StatusBadRequest, accountIDOnAccountView.Body)
	}
	invalidAccountDecimal, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil, apptest.ReplaceRawQuery("amount_min=not-a-decimal"))
	requireNoTransportError(t, "search account records", err)
	if invalidAccountDecimal.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid account decimal filter status = %d, want %d; body %s", invalidAccountDecimal.StatusCode(), http.StatusBadRequest, invalidAccountDecimal.Body)
	}
	invalidAccountDate, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil, apptest.ReplaceRawQuery("initiated_date_from=2024-02-30"))
	requireNoTransportError(t, "search account records", err)
	if invalidAccountDate.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid account date filter status = %d, want %d; body %s", invalidAccountDate.StatusCode(), http.StatusBadRequest, invalidAccountDate.Body)
	}
}

func TestRecordSearchDictionaryFilterReferencesBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()

	for _, rawQuery := range []string{
		"account_id=999999",
		"category_id=999999",
		"tag_id=999999",
		"member_id=999999",
	} {
		t.Run("global missing "+rawQuery, func(t *testing.T) {
			assertInvalidRecordSearchQuery(t, client, rawQuery)
		})
	}

	tombstonedAccount := scenario.AccountWithCurrency("checking:RecordSearch:TombstonedFilter", "USD")
	deleteAccount(t, client, tombstonedAccount.AccountId)
	tombstonedCategory := scenario.Category("RecordSearch:TombstonedFilter")
	deleteCategory(t, client, tombstonedCategory.CategoryId)
	tombstonedTag := scenario.Tag("RecordSearch:TombstonedFilter")
	deleteTag(t, client, tombstonedTag.TagId)
	tombstonedMember := scenario.Member("Record Search Tombstoned Filter")
	deleteMember(t, client, tombstonedMember.MemberId)

	for _, rawQuery := range []string{
		"account_id=" + apptest.FormatID(tombstonedAccount.AccountId),
		"category_id=" + apptest.FormatID(tombstonedCategory.CategoryId),
		"tag_id=" + apptest.FormatID(tombstonedTag.TagId),
		"member_id=" + apptest.FormatID(tombstonedMember.MemberId),
	} {
		t.Run("global tombstoned "+rawQuery, func(t *testing.T) {
			assertInvalidRecordSearchQuery(t, client, rawQuery)
		})
	}

	assertAccountRecordSearchNotFound(t, client, 999999)
	assertAccountRecordSearchNotFound(t, client, tombstonedAccount.AccountId)
	assertInvalidAccountRecordSearchQuery(t, client, 999999, "category_id=0")

	hidden := true
	hiddenAccount, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "checking:RecordSearch:HiddenFilter",
		AccountType: httpclient.WritableAccountTypeOwned,
		IsHidden:    &hidden,
		Currency:    ptrTo("USD"),
	})
	if err != nil {
		t.Fatalf("hidden record search filter account request: %v", err)
	}
	if hiddenAccount.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden record search filter account status = %d, want %d; body %s", hiddenAccount.StatusCode(), http.StatusCreated, hiddenAccount.Body)
	}
	hiddenCategory := scenario.CategoryWithHidden("RecordSearch:HiddenFilter", hidden)
	hiddenTag, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      "RecordSearch:HiddenFilter",
		IsHidden: &hidden,
	})
	if err != nil {
		t.Fatalf("hidden record search filter tag request: %v", err)
	}
	if hiddenTag.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden record search filter tag status = %d, want %d; body %s", hiddenTag.StatusCode(), http.StatusCreated, hiddenTag.Body)
	}

	for _, rawQuery := range []string{
		"account_id=" + apptest.FormatID(hiddenAccount.JSON201.AccountId),
		"category_id=" + apptest.FormatID(hiddenCategory.CategoryId),
		"tag_id=" + apptest.FormatID(hiddenTag.JSON201.TagId),
	} {
		t.Run("global hidden active "+rawQuery, func(t *testing.T) {
			assertEmptyRecordSearchQuery(t, client, rawQuery)
		})
	}
	assertEmptyAccountRecordSearch(t, client, hiddenAccount.JSON201.AccountId)
	for _, rawQuery := range []string{
		"category_id=" + apptest.FormatID(hiddenCategory.CategoryId),
		"tag_id=" + apptest.FormatID(hiddenTag.JSON201.TagId),
	} {
		t.Run("account scoped hidden active "+rawQuery, func(t *testing.T) {
			assertEmptyAccountRecordSearchQuery(t, client, hiddenAccount.JSON201.AccountId, rawQuery)
		})
	}

	activeAccount := scenario.AccountWithCurrency("checking:RecordSearch:ActiveFilter", "USD")
	for _, rawQuery := range []string{
		"category_id=999999",
		"tag_id=999999",
		"member_id=999999",
		"category_id=" + apptest.FormatID(tombstonedCategory.CategoryId),
		"tag_id=" + apptest.FormatID(tombstonedTag.TagId),
		"member_id=" + apptest.FormatID(tombstonedMember.MemberId),
	} {
		t.Run("account scoped invalid "+rawQuery, func(t *testing.T) {
			assertInvalidAccountRecordSearchQuery(t, client, activeAccount.AccountId, rawQuery)
		})
	}
}

func TestRecordSearchAccountFQNPrefixBoundary(t *testing.T) {
	client := newSharedClient(t)
	scenario := client.Scenario()
	category := scenario.Category("Banking:Fees")
	funding := scenario.AccountWithCurrency("cash:Prefix:Funding", "USD")
	merchant := scenario.Account("merchant:Prefix:Coffee")
	chaseChecking := scenario.AccountWithCurrency("banks:Chase:checking:Joint", "USD")
	chaseFees := scenario.AccountWithType("banks:Chase:fees", httpclient.WritableAccountTypeFlow)
	chaserChecking := scenario.AccountWithCurrency("banks:Chaser:checking", "USD")
	allyChecking := scenario.AccountWithCurrency("banks:Ally:checking", "USD")

	descendant := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-02", category.CategoryId, chaseChecking.AccountId, merchant.AccountId, httpclient.SettlementStatusPosted))
	flow := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-03", category.CategoryId, funding.AccountId, chaseFees.AccountId, httpclient.SettlementStatusPending))
	sibling := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-04", category.CategoryId, chaserChecking.AccountId, merchant.AccountId, httpclient.SettlementStatusPosted))
	other := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-05", category.CategoryId, allyChecking.AccountId, merchant.AccountId, httpclient.SettlementStatusPosted))

	prefix := "banks:Chase"
	sort := httpclient.SearchJournalRecordsParamsSortInitiatedDate
	sortDesc := httpclient.SearchJournalRecordsParamsSortDirDesc
	prefixRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountFqnPrefix: &prefix,
		Sort:             &sort,
		SortDir:          &sortDesc,
	})
	requireNoTransportError(t, "search records by account fqn prefix", err)
	if prefixRecords.StatusCode() != http.StatusOK {
		t.Fatalf("prefix records status = %d, want %d; body %s", prefixRecords.StatusCode(), http.StatusOK, prefixRecords.Body)
	}
	assertRecordIDs(t, prefixRecords.JSON200.Records, []int64{
		flow.JSON201.Records[1].RecordId,
		descendant.JSON201.Records[0].RecordId,
	})
	if prefixRecords.JSON200.TotalCount != 2 {
		t.Fatalf("prefix total_count = %d, want 2", prefixRecords.JSON200.TotalCount)
	}

	exactPrefix := "banks:Chase:checking:Joint"
	exactRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountFqnPrefix: &exactPrefix,
	})
	requireNoTransportError(t, "search records by exact account fqn prefix", err)
	if exactRecords.StatusCode() != http.StatusOK {
		t.Fatalf("exact prefix records status = %d, want %d; body %s", exactRecords.StatusCode(), http.StatusOK, exactRecords.Body)
	}
	assertRecordIDs(t, exactRecords.JSON200.Records, []int64{descendant.JSON201.Records[0].RecordId})

	limitOne := 1
	filteredPage, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountFqnPrefix: &prefix,
		Settlement:       ptrTo(httpclient.SettlementStatusPosted),
		Limit:            &limitOne,
	})
	requireNoTransportError(t, "search records by account fqn prefix with filters", err)
	if filteredPage.StatusCode() != http.StatusOK {
		t.Fatalf("filtered prefix page status = %d, want %d; body %s", filteredPage.StatusCode(), http.StatusOK, filteredPage.Body)
	}
	assertRecordIDs(t, filteredPage.JSON200.Records, []int64{descendant.JSON201.Records[0].RecordId})
	if filteredPage.JSON200.TotalCount != 1 {
		t.Fatalf("filtered prefix page total_count = %d, want 1", filteredPage.JSON200.TotalCount)
	}

	allRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "search records without account fqn prefix", err)
	if allRecords.StatusCode() != http.StatusOK {
		t.Fatalf("all records status = %d, want %d; body %s", allRecords.StatusCode(), http.StatusOK, allRecords.Body)
	}
	if allRecords.JSON200.TotalCount != 8 {
		t.Fatalf("all records total_count = %d, want 8; sibling=%d other=%d", allRecords.JSON200.TotalCount, sibling.JSON201.TransactionId, other.JSON201.TransactionId)
	}

	wildcardPrefix := "banks:Save_1%\\Vault"
	wildcardDescendantAccount := scenario.AccountWithCurrency(wildcardPrefix+":Joint", "USD")
	wildcardFeeAccount := scenario.AccountWithType(wildcardPrefix+":Fees", httpclient.WritableAccountTypeFlow)
	wildcardLookalikeAccount := scenario.AccountWithCurrency("banks:Savex1ExtraVault:Joint", "USD")
	wildcardDescendant := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-07", category.CategoryId, wildcardDescendantAccount.AccountId, merchant.AccountId, httpclient.SettlementStatusPosted))
	wildcardFee := createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-08", category.CategoryId, funding.AccountId, wildcardFeeAccount.AccountId, httpclient.SettlementStatusPosted))
	createTransaction(t, client, recordSearchPrefixTransactionRequest("2024-01-08", category.CategoryId, wildcardLookalikeAccount.AccountId, merchant.AccountId, httpclient.SettlementStatusPosted))

	wildcardPrefixRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountFqnPrefix: &wildcardPrefix,
	})
	requireNoTransportError(t, "search records by wildcard account fqn prefix", err)
	if wildcardPrefixRecords.StatusCode() != http.StatusOK {
		t.Fatalf("wildcard prefix records status = %d, want %d; body %s", wildcardPrefixRecords.StatusCode(), http.StatusOK, wildcardPrefixRecords.Body)
	}
	assertRecordIDs(t, wildcardPrefixRecords.JSON200.Records, []int64{
		wildcardDescendant.JSON201.Records[0].RecordId,
		wildcardFee.JSON201.Records[1].RecordId,
	})
	if wildcardPrefixRecords.JSON200.TotalCount != 2 {
		t.Fatalf("wildcard prefix total_count = %d, want 2", wildcardPrefixRecords.JSON200.TotalCount)
	}

	assertInvalidRecordSearchQuery(t, client, "account_fqn_prefix=banks:Chase&account_id="+apptest.FormatID(chaseChecking.AccountId))
	assertInvalidRecordSearchQuery(t, client, "account_fqn_prefix=banks:Chase&include_running_balance=true")
	assertInvalidRecordSearchQuery(t, client, "account_fqn_prefix=:bad")
}

func TestRecordSearchPaginationBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	third := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-03", "Third")
	first := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-01", "First")
	second := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-02", "Second")

	limitThree := 3
	offsetOne := 1
	allRecordsPage, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		Limit:  &limitThree,
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "search records page", err)
	if allRecordsPage.StatusCode() != http.StatusOK {
		t.Fatalf("search records page status = %d, want %d; body %s", allRecordsPage.StatusCode(), http.StatusOK, allRecordsPage.Body)
	}
	assertRecordIDs(t, allRecordsPage.JSON200.Records, []int64{
		first.JSON201.Records[1].RecordId,
		second.JSON201.Records[0].RecordId,
		second.JSON201.Records[1].RecordId,
	})
	if allRecordsPage.JSON200.TotalCount != 6 {
		t.Fatalf("search records page total_count = %d, want 6", allRecordsPage.JSON200.TotalCount)
	}

	offsetOnlyAllRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "search records offset-only page", err)
	if offsetOnlyAllRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search records offset-only page status = %d, want %d; body %s", offsetOnlyAllRecords.StatusCode(), http.StatusOK, offsetOnlyAllRecords.Body)
	}
	assertRecordIDs(t, offsetOnlyAllRecords.JSON200.Records, []int64{
		first.JSON201.Records[1].RecordId,
		second.JSON201.Records[0].RecordId,
		second.JSON201.Records[1].RecordId,
		third.JSON201.Records[0].RecordId,
		third.JSON201.Records[1].RecordId,
	})
	if offsetOnlyAllRecords.JSON200.TotalCount != 6 {
		t.Fatalf("search records offset-only total_count = %d, want 6", offsetOnlyAllRecords.JSON200.TotalCount)
	}

	limitTwo := 2
	accountRecordsPage, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		Limit:  &limitTwo,
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "search account records page", err)
	if accountRecordsPage.StatusCode() != http.StatusOK {
		t.Fatalf("search account records page status = %d, want %d; body %s", accountRecordsPage.StatusCode(), http.StatusOK, accountRecordsPage.Body)
	}
	assertRecordIDs(t, accountRecordsPage.JSON200.Records, []int64{
		second.JSON201.Records[0].RecordId,
		third.JSON201.Records[0].RecordId,
	})
	if accountRecordsPage.JSON200.TotalCount != 3 {
		t.Fatalf("search account records page total_count = %d, want 3", accountRecordsPage.JSON200.TotalCount)
	}

	offsetOnlyAccountRecords, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		Offset: &offsetOne,
	})
	requireNoTransportError(t, "search account records offset-only page", err)
	if offsetOnlyAccountRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search account records offset-only page status = %d, want %d; body %s", offsetOnlyAccountRecords.StatusCode(), http.StatusOK, offsetOnlyAccountRecords.Body)
	}
	assertRecordIDs(t, offsetOnlyAccountRecords.JSON200.Records, []int64{
		second.JSON201.Records[0].RecordId,
		third.JSON201.Records[0].RecordId,
	})
	if offsetOnlyAccountRecords.JSON200.TotalCount != 3 {
		t.Fatalf("search account records offset-only total_count = %d, want 3", offsetOnlyAccountRecords.JSON200.TotalCount)
	}

	limitOne := 1
	filteredPage, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountId: &refs.CheckingAccountId,
		Limit:     &limitOne,
		Offset:    &offsetOne,
	})
	requireNoTransportError(t, "search filtered records page", err)
	if filteredPage.StatusCode() != http.StatusOK {
		t.Fatalf("search filtered records page status = %d, want %d; body %s", filteredPage.StatusCode(), http.StatusOK, filteredPage.Body)
	}
	assertRecordIDs(t, filteredPage.JSON200.Records, []int64{second.JSON201.Records[0].RecordId})
	if filteredPage.JSON200.TotalCount != 3 {
		t.Fatalf("search filtered records page total_count = %d, want 3", filteredPage.JSON200.TotalCount)
	}

	noMatchMemo := "No matching memo"
	emptyFiltered, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		MemoContains: &noMatchMemo,
	})
	requireNoTransportError(t, "search empty filtered records", err)
	if emptyFiltered.StatusCode() != http.StatusOK {
		t.Fatalf("search empty filtered records status = %d, want %d; body %s", emptyFiltered.StatusCode(), http.StatusOK, emptyFiltered.Body)
	}
	assertRecordIDs(t, emptyFiltered.JSON200.Records, nil)
	if emptyFiltered.JSON200.TotalCount != 0 {
		t.Fatalf("search empty filtered records total_count = %d, want 0", emptyFiltered.JSON200.TotalCount)
	}

	assertInvalidRecordSearchQuery(t, client, "limit=0")
	assertInvalidRecordSearchQuery(t, client, "limit=501")
	assertInvalidRecordSearchQuery(t, client, "offset=-1")
	assertInvalidRecordSearchQuery(t, client, "sort=created_at")
	assertInvalidRecordSearchQuery(t, client, "sort_dir=sideways")
	assertInvalidAccountRecordSearchQuery(t, client, refs.CheckingAccountId, "limit=0")
	assertInvalidAccountRecordSearchQuery(t, client, refs.CheckingAccountId, "limit=501")
	assertInvalidAccountRecordSearchQuery(t, client, refs.CheckingAccountId, "offset=-1")
	assertInvalidAccountRecordSearchQuery(t, client, refs.CheckingAccountId, "sort=created_at")
	assertInvalidAccountRecordSearchQuery(t, client, refs.CheckingAccountId, "sort_dir=sideways")
}

func TestRecordSearchUpdatedAtOrderingBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	// Keep initiated dates opposite record-ID order so updated_at cannot alias the default sort.
	first := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-02", "First")
	second := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-01", "Second")
	older := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-03", "Older")
	firstReplacement := balancedTransactionRequest(refs.transactionRefs)
	firstReplacement.InitiatedDate = apptest.Date("2024-01-02")
	firstMemo := "First"
	firstReplacement.Records[0].Memo = &firstMemo
	replacedFirst, err := client.REST().ReplaceTransactionWithResponse(
		context.Background(),
		first.JSON201.TransactionId,
		&httpclient.ReplaceTransactionParams{IfMatch: first.JSON201.Etag},
		httpclient.UpdateTransactionRequest{
			InitiatedDate: firstReplacement.InitiatedDate,
			Records: []httpclient.UpdateTransactionRequest_Records_Item{
				apptest.NewTransactionRecord(firstReplacement.Records[0]),
				apptest.ExistingTransactionRecord(first.JSON201.Records[1].RecordId, firstReplacement.Records[1]),
			},
		},
	)
	requireNoTransportError(t, "replace first transaction checking record", err)
	if replacedFirst.StatusCode() != http.StatusOK {
		t.Fatalf("replace first transaction checking record status = %d, want %d; body %s", replacedFirst.StatusCode(), http.StatusOK, replacedFirst.Body)
	}
	var firstRecordID int64
	for _, record := range replacedFirst.JSON200.Records {
		if record.AccountId == refs.CheckingAccountId {
			firstRecordID = record.RecordId
			break
		}
	}
	if firstRecordID == 0 {
		t.Fatal("replacement checking record is missing")
	}
	secondRecordID := second.JSON201.Records[0].RecordId
	olderRecordID := older.JSON201.Records[0].RecordId
	if first.JSON201.TransactionId >= second.JSON201.TransactionId || firstRecordID <= secondRecordID {
		t.Fatalf("record-ID tiebreak fixture has transaction IDs %d, %d and record IDs %d, %d; want opposite ordering", first.JSON201.TransactionId, second.JSON201.TransactionId, firstRecordID, secondRecordID)
	}

	updated, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{
		RecordIds:            []int64{firstRecordID, secondRecordID},
		ReconciliationStatus: httpclient.Unreconciled,
	})
	requireNoTransportError(t, "update tied records", err)
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("update tied records status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}

	sortUpdated := httpclient.SearchJournalRecordsParamsSortUpdatedAt
	sortAsc := httpclient.SearchJournalRecordsParamsSortDirAsc
	globalAsc, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountId: &refs.CheckingAccountId,
		Sort:      &sortUpdated,
		SortDir:   &sortAsc,
	})
	requireNoTransportError(t, "search records by updated_at ascending", err)
	if globalAsc.StatusCode() != http.StatusOK {
		t.Fatalf("search records by updated_at ascending status = %d, want %d; body %s", globalAsc.StatusCode(), http.StatusOK, globalAsc.Body)
	}
	assertRecordIDs(t, globalAsc.JSON200.Records, []int64{olderRecordID, secondRecordID, firstRecordID})
	if !globalAsc.JSON200.Records[0].UpdatedAt.Before(globalAsc.JSON200.Records[1].UpdatedAt) {
		t.Fatalf("updated_at values = %s and %s, want older timestamp first", globalAsc.JSON200.Records[0].UpdatedAt, globalAsc.JSON200.Records[1].UpdatedAt)
	}
	if !globalAsc.JSON200.Records[1].UpdatedAt.Equal(globalAsc.JSON200.Records[2].UpdatedAt) {
		t.Fatalf("updated_at values = %s and %s, want tied timestamps", globalAsc.JSON200.Records[1].UpdatedAt, globalAsc.JSON200.Records[2].UpdatedAt)
	}

	sortDesc := httpclient.SearchJournalRecordsParamsSortDirDesc
	globalDesc, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountId: &refs.CheckingAccountId,
		Sort:      &sortUpdated,
		SortDir:   &sortDesc,
	})
	requireNoTransportError(t, "search records by updated_at descending", err)
	if globalDesc.StatusCode() != http.StatusOK {
		t.Fatalf("search records by updated_at descending status = %d, want %d; body %s", globalDesc.StatusCode(), http.StatusOK, globalDesc.Body)
	}
	assertRecordIDs(t, globalDesc.JSON200.Records, []int64{firstRecordID, secondRecordID, olderRecordID})

	limitOne := 1
	offsetTwo := 2
	globalPage, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), &httpclient.SearchJournalRecordsParams{
		AccountId: &refs.CheckingAccountId,
		Sort:      &sortUpdated,
		SortDir:   &sortAsc,
		Limit:     &limitOne,
		Offset:    &offsetTwo,
	})
	requireNoTransportError(t, "page tied updated_at records", err)
	if globalPage.StatusCode() != http.StatusOK {
		t.Fatalf("page tied updated_at records status = %d, want %d; body %s", globalPage.StatusCode(), http.StatusOK, globalPage.Body)
	}
	assertRecordIDs(t, globalPage.JSON200.Records, []int64{firstRecordID})

	accountSortUpdated := httpclient.SearchAccountJournalRecordsParamsSortUpdatedAt
	accountSortDesc := httpclient.SearchAccountJournalRecordsParamsSortDirDesc
	accountDesc, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		Sort:    &accountSortUpdated,
		SortDir: &accountSortDesc,
	})
	requireNoTransportError(t, "search account records by updated_at descending", err)
	if accountDesc.StatusCode() != http.StatusOK {
		t.Fatalf("search account records by updated_at descending status = %d, want %d; body %s", accountDesc.StatusCode(), http.StatusOK, accountDesc.Body)
	}
	assertRecordIDs(t, accountDesc.JSON200.Records, []int64{firstRecordID, secondRecordID, olderRecordID})
}

func TestTransactionListUpdatedAtOrderingBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	// Keep initiated dates opposite transaction-ID order so updated_at cannot alias the default sort.
	first := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-03", "First")
	second := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-02", "Second")
	older := createTransactionForDate(t, client, refs.transactionRefs, "2024-01-01", "Older")

	updated, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{
		RecordIds: []int64{
			first.JSON201.Records[0].RecordId,
			second.JSON201.Records[0].RecordId,
		},
		ReconciliationStatus: httpclient.Unreconciled,
	})
	requireNoTransportError(t, "update records in tied transactions", err)
	if updated.StatusCode() != http.StatusOK {
		t.Fatalf("update records in tied transactions status = %d, want %d; body %s", updated.StatusCode(), http.StatusOK, updated.Body)
	}

	sortUpdated := httpclient.ListTransactionsParamsSortUpdatedAt
	sortAsc := httpclient.ListTransactionsParamsSortDirAsc
	ascending, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Sort:    &sortUpdated,
		SortDir: &sortAsc,
	})
	requireNoTransportError(t, "list transactions by updated_at ascending", err)
	if ascending.StatusCode() != http.StatusOK {
		t.Fatalf("list transactions by updated_at ascending status = %d, want %d; body %s", ascending.StatusCode(), http.StatusOK, ascending.Body)
	}
	assertTransactionIDs(t, ascending.JSON200.Transactions, []int64{
		older.JSON201.TransactionId,
		first.JSON201.TransactionId,
		second.JSON201.TransactionId,
	})
	if !ascending.JSON200.Transactions[0].UpdatedAt.Before(ascending.JSON200.Transactions[1].UpdatedAt) {
		t.Fatalf("transaction updated_at values = %s and %s, want older timestamp first", ascending.JSON200.Transactions[0].UpdatedAt, ascending.JSON200.Transactions[1].UpdatedAt)
	}
	if !ascending.JSON200.Transactions[1].UpdatedAt.Equal(ascending.JSON200.Transactions[2].UpdatedAt) {
		t.Fatalf("transaction updated_at values = %s and %s, want tied timestamps", ascending.JSON200.Transactions[1].UpdatedAt, ascending.JSON200.Transactions[2].UpdatedAt)
	}

	sortDesc := httpclient.ListTransactionsParamsSortDirDesc
	descending, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Sort:    &sortUpdated,
		SortDir: &sortDesc,
	})
	requireNoTransportError(t, "list transactions by updated_at descending", err)
	if descending.StatusCode() != http.StatusOK {
		t.Fatalf("list transactions by updated_at descending status = %d, want %d; body %s", descending.StatusCode(), http.StatusOK, descending.Body)
	}
	assertTransactionIDs(t, descending.JSON200.Transactions, []int64{
		second.JSON201.TransactionId,
		first.JSON201.TransactionId,
		older.JSON201.TransactionId,
	})

	limitOne := 1
	offsetOne := 1
	page, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{
		Sort:    &sortUpdated,
		SortDir: &sortDesc,
		Limit:   &limitOne,
		Offset:  &offsetOne,
	})
	requireNoTransportError(t, "page tied updated_at transactions", err)
	if page.StatusCode() != http.StatusOK {
		t.Fatalf("page tied updated_at transactions status = %d, want %d; body %s", page.StatusCode(), http.StatusOK, page.Body)
	}
	assertTransactionIDs(t, page.JSON200.Transactions, []int64{first.JSON201.TransactionId})
}

func TestAccountRecordRunningBalanceBoundary(t *testing.T) {
	localZone := time.FixedZone("local-test", -7*60*60)
	clock := apptest.NewFakeClock(time.Date(2026, 7, 4, 23, 30, 0, 0, localZone))
	client := newSharedClient(t, apptest.WithClock(clock))
	refs := createSearchRefs(t, client)
	createCreditLimitHistory(t, client, refs.CheckingAccountId, "30.00", "2026-01-01")
	createCreditLimitHistory(t, client, refs.CheckingAccountId, "50.00", "2026-07-05")

	const sharedInitiatedDate = "2024-01-01"

	first := createTransactionForDate(t, client, refs.transactionRefs, sharedInitiatedDate, "First")
	cancelledRequest := balancedTransactionRequest(refs.transactionRefs)
	cancelledRequest.InitiatedDate = apptest.Date(sharedInitiatedDate)
	cancelledRequest.Records[0].Settlement = apptest.PendingSettlement()
	cancelled := createTransaction(t, client, cancelledRequest)
	cancelledResponse, err := client.REST().CancelTransactionWithResponse(context.Background(), cancelled.JSON201.TransactionId)
	requireNoTransportError(t, "cancel running-balance transaction", err)
	if cancelledResponse.StatusCode() != http.StatusOK {
		t.Fatalf("cancel running-balance transaction status = %d, want %d; body %s", cancelledResponse.StatusCode(), http.StatusOK, cancelledResponse.Body)
	}
	pendingRequest := balancedTransactionRequest(refs.transactionRefs)
	pendingRequest.InitiatedDate = apptest.Date(sharedInitiatedDate)
	pendingRequest.Records[0].Settlement = apptest.PendingSettlement()
	pending := createTransaction(t, client, pendingRequest)
	second := createTransactionForDate(t, client, refs.transactionRefs, sharedInitiatedDate, "Second")

	includeRunningBalance := true
	limitThree := 3
	offsetOne := 1
	sort := httpclient.SearchAccountJournalRecordsParamsSortInitiatedDate
	sortAsc := httpclient.SearchAccountJournalRecordsParamsSortDirAsc
	page, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
		Sort:                  &sort,
		SortDir:               &sortAsc,
		Limit:                 &limitThree,
		Offset:                &offsetOne,
	})
	requireNoTransportError(t, "search account records with running balance", err)
	if page.StatusCode() != http.StatusOK {
		t.Fatalf("search account records with running balance status = %d, want %d; body %s", page.StatusCode(), http.StatusOK, page.Body)
	}
	assertRecordIDs(t, page.JSON200.Records, []int64{
		cancelled.JSON201.Records[0].RecordId,
		pending.JSON201.Records[0].RecordId,
		second.JSON201.Records[0].RecordId,
	})
	assertRecordRunningBalances(t, page.JSON200.Records, []string{"-12.34000000", "-24.68000000", "-37.02000000"})
	assertRecordRemainingCredits(t, page.JSON200.Records, []string{"17.66000000", "5.32000000", "-7.02000000"})

	sortDesc := httpclient.SearchAccountJournalRecordsParamsSortDirDesc
	newestFirstPage, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
		Sort:                  &sort,
		SortDir:               &sortDesc,
		Limit:                 &limitThree,
	})
	requireNoTransportError(t, "search newest-first account records with running balance", err)
	if newestFirstPage.StatusCode() != http.StatusOK {
		t.Fatalf("search newest-first account records with running balance status = %d, want %d; body %s", newestFirstPage.StatusCode(), http.StatusOK, newestFirstPage.Body)
	}
	assertRecordIDs(t, newestFirstPage.JSON200.Records, []int64{
		second.JSON201.Records[0].RecordId,
		pending.JSON201.Records[0].RecordId,
		cancelled.JSON201.Records[0].RecordId,
	})
	assertRecordRunningBalances(t, newestFirstPage.JSON200.Records, []string{"-37.02000000", "-24.68000000", "-12.34000000"})
	assertRecordRemainingCredits(t, newestFirstPage.JSON200.Records, []string{"-7.02000000", "5.32000000", "17.66000000"})

	filteredMemo := "Second"
	filtered, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
		MemoContains:          &filteredMemo,
	})
	requireNoTransportError(t, "search filtered account records with running balance", err)
	if filtered.StatusCode() != http.StatusOK {
		t.Fatalf("search filtered account records with running balance status = %d, want %d; body %s", filtered.StatusCode(), http.StatusOK, filtered.Body)
	}
	assertRecordIDs(t, filtered.JSON200.Records, []int64{second.JSON201.Records[0].RecordId})
	assertRecordRunningBalances(t, filtered.JSON200.Records, []string{"-37.02000000"})
	assertRecordRemainingCredits(t, filtered.JSON200.Records, []string{"-7.02000000"})

	withoutRunningBalance, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, nil)
	requireNoTransportError(t, "search account records without running balance", err)
	if withoutRunningBalance.StatusCode() != http.StatusOK {
		t.Fatalf("search account records without running balance status = %d, want %d; body %s", withoutRunningBalance.StatusCode(), http.StatusOK, withoutRunningBalance.Body)
	}
	if withoutRunningBalance.JSON200.Records[0].RunningBalance != nil {
		t.Fatalf("running_balance without opt-in = %v, want nil", withoutRunningBalance.JSON200.Records[0].RunningBalance)
	}
	if withoutRunningBalance.JSON200.Records[0].RemainingCredit != nil {
		t.Fatalf("remaining_credit without running-balance opt-in = %v, want nil", withoutRunningBalance.JSON200.Records[0].RemainingCredit)
	}

	if first.JSON201.Records[0].RunningBalance != nil {
		t.Fatalf("create response running_balance = %v, want nil", first.JSON201.Records[0].RunningBalance)
	}
	if first.JSON201.Records[0].RemainingCredit != nil {
		t.Fatalf("create response remaining_credit = %v, want nil", first.JSON201.Records[0].RemainingCredit)
	}
	transactionRead, err := client.REST().GetTransactionWithResponse(context.Background(), first.JSON201.TransactionId)
	requireNoTransportError(t, "read transaction without remaining credit", err)
	if transactionRead.StatusCode() != http.StatusOK {
		t.Fatalf("read transaction status = %d, want %d; body %s", transactionRead.StatusCode(), http.StatusOK, transactionRead.Body)
	}
	for _, record := range transactionRead.JSON200.Records {
		if record.RemainingCredit != nil {
			t.Fatalf("transaction read remaining_credit = %v, want nil; record = %+v", record.RemainingCredit, record)
		}
	}

	genericRecords, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil)
	requireNoTransportError(t, "search generic records without remaining credit", err)
	if genericRecords.StatusCode() != http.StatusOK {
		t.Fatalf("search generic records status = %d, want %d; body %s", genericRecords.StatusCode(), http.StatusOK, genericRecords.Body)
	}
	for _, record := range genericRecords.JSON200.Records {
		if record.RemainingCredit != nil {
			t.Fatalf("generic record remaining_credit = %v, want nil; record = %+v", record.RemainingCredit, record)
		}
	}
}

func TestAccountRecordRunningBalanceByCurrency(t *testing.T) {
	client := newSharedClient(t)
	refs := createSearchRefs(t, client)
	client.SetAccountCurrency(refs.CheckingAccountId, nil)

	firstUSD := balancedTransactionRequest(refs.transactionRefs)
	firstUSD.InitiatedDate = apptest.Date("2024-01-01")
	firstUSD.Records[0].Amount = "-12.34"
	firstUSD.Records[0].AmountUsd = apptest.StringPtr("-12.34")
	firstUSD.Records[1].Amount = "12.34"
	firstUSD.Records[1].AmountUsd = apptest.StringPtr("12.34")
	firstUSDResponse := createTransaction(t, client, firstUSD)

	firstEUR := balancedTransactionRequest(refs.transactionRefs)
	firstEUR.InitiatedDate = apptest.Date("2024-01-02")
	firstEUR.Records[0].Currency = "EUR"
	firstEUR.Records[0].Amount = "-10.00"
	firstEUR.Records[0].AmountUsd = apptest.StringPtr("-11.00")
	firstEUR.Records[1].Currency = "EUR"
	firstEUR.Records[1].Amount = "10.00"
	firstEUR.Records[1].AmountUsd = apptest.StringPtr("11.00")
	firstEURResponse := createTransaction(t, client, firstEUR)

	secondUSD := balancedTransactionRequest(refs.transactionRefs)
	secondUSD.InitiatedDate = apptest.Date("2024-01-03")
	secondUSD.Records[0].Amount = "-1.00"
	secondUSD.Records[0].AmountUsd = apptest.StringPtr("-1.00")
	secondUSD.Records[1].Amount = "1.00"
	secondUSD.Records[1].AmountUsd = apptest.StringPtr("1.00")
	secondUSDResponse := createTransaction(t, client, secondUSD)

	includeRunningBalance := true
	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), refs.CheckingAccountId, &httpclient.SearchAccountJournalRecordsParams{
		IncludeRunningBalance: &includeRunningBalance,
	})
	requireNoTransportError(t, "search account records with multi-currency running balance", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("search account records with multi-currency running balance status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	assertRecordIDs(t, response.JSON200.Records, []int64{
		firstUSDResponse.JSON201.Records[0].RecordId,
		firstEURResponse.JSON201.Records[0].RecordId,
		secondUSDResponse.JSON201.Records[0].RecordId,
	})
	assertRecordRunningBalances(t, response.JSON200.Records, []string{"-12.34000000", "-10.00000000", "-13.34000000"})
	for _, record := range response.JSON200.Records {
		if record.RemainingCredit != nil {
			t.Fatalf("remaining_credit without current limit = %v, want nil; record = %+v", record.RemainingCredit, record)
		}
	}
}

func ptrTo[T any](value T) *T {
	return new(value)
}

type searchRefs struct {
	transactionRefs
	SavingsAccountId int64
	SecondCategoryId int64
	SecondTagId      int64
	SecondMemberId   int64
}

func createSearchRefs(t *testing.T, client *apptest.Client) searchRefs {
	t.Helper()

	base := createTransactionRefs(t, client)
	scenario := client.Scenario()
	savings := scenario.AccountWithCurrency("savings:Emergency", "USD")
	category := scenario.Category("Housing:Rent")
	tag := scenario.Tag("Recurring:Monthly")
	member := scenario.Member("Blake")

	return searchRefs{
		transactionRefs:  base,
		SavingsAccountId: savings.AccountId,
		SecondCategoryId: category.CategoryId,
		SecondTagId:      tag.TagId,
		SecondMemberId:   member.MemberId,
	}
}

func replacementTransactionRequest(refs transactionRefs) httpclient.CreateTransactionRequest {
	memo := "Replacement"
	pendingDate := apptest.Timestamp("2024-03-12T00:00:00Z")
	postedDate := apptest.Timestamp("2024-03-13T00:00:00Z")
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date("2024-03-12"),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            refs.CheckingAccountId,
				MemberId:             &refs.MemberId,
				Currency:             "USD",
				Amount:               "-20.00",
				AmountUsd:            apptest.StringPtr("-20.00"),
				TagIds:               apptest.Int64SlicePtr(refs.TagId),
				Memo:                 &memo,
				Settlement:           &httpclient.SettlementIntent{Status: httpclient.SettlementStatusPosted, PendingDate: &pendingDate, PostedDate: &postedDate},
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            refs.MerchantAccountId,
				Currency:             "USD",
				Amount:               "20.00",
				AmountUsd:            apptest.StringPtr("20.00"),
				CategoryId:           apptest.Int64Ptr(refs.CategoryId),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	}
}

func recordIDs(records []httpclient.JournalRecord) []int64 {
	ids := make([]int64, 0, len(records))
	for _, record := range records {
		ids = append(ids, record.RecordId)
	}

	return ids
}

func assertRecordIDs(t *testing.T, records []httpclient.JournalRecord, want []int64) {
	t.Helper()

	assertInt64s(t, recordIDs(records), want)
}

func createTransaction(t *testing.T, client *apptest.Client, request httpclient.CreateTransactionRequest) *httpclient.CreateTransactionResponse {
	t.Helper()

	response, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	requireNoTransportError(t, "create transaction", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return response
}

func recordSearchPrefixTransactionRequest(
	date string,
	categoryID int64,
	firstAccountID int64,
	secondAccountID int64,
	settlement httpclient.SettlementStatus,
) httpclient.CreateTransactionRequest {
	return httpclient.CreateTransactionRequest{
		InitiatedDate: apptest.Date(date),
		Records: []httpclient.CreateJournalRecordRequest{
			{
				AccountId:            firstAccountID,
				Currency:             "USD",
				Amount:               "-10.00",
				AmountUsd:            apptest.StringPtr("-10.00"),
				Settlement:           &httpclient.SettlementIntent{Status: settlement},
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
			{
				AccountId:            secondAccountID,
				Currency:             "USD",
				Amount:               "10.00",
				AmountUsd:            apptest.StringPtr("10.00"),
				CategoryId:           apptest.Int64Ptr(categoryID),
				ReconciliationStatus: httpclient.Reconciled,
				Source:               httpclient.WritableSourceManual,
			},
		},
	}
}

func assertRecordRunningBalances(t *testing.T, records []httpclient.JournalRecord, want []string) {
	t.Helper()

	if len(records) != len(want) {
		t.Fatalf("record count = %d, want %d; records = %+v", len(records), len(want), records)
	}
	for index, record := range records {
		if record.RunningBalance == nil || *record.RunningBalance != want[index] {
			t.Fatalf("running_balance at %d = %v, want %q; records = %+v", index, record.RunningBalance, want[index], records)
		}
	}
}

func assertRecordRemainingCredits(t *testing.T, records []httpclient.JournalRecord, want []string) {
	t.Helper()

	if len(records) != len(want) {
		t.Fatalf("record count = %d, want %d; records = %+v", len(records), len(want), records)
	}
	for index, record := range records {
		if record.RemainingCredit == nil || *record.RemainingCredit != want[index] {
			t.Fatalf("remaining_credit at %d = %v, want %q; records = %+v", index, record.RemainingCredit, want[index], records)
		}
	}
}

func assertTransactionCancelPreservedFields(t *testing.T, before []httpclient.JournalRecord, after []httpclient.JournalRecord) {
	t.Helper()

	if len(after) != len(before) {
		t.Fatalf("cancelled record count = %d, want %d; before %+v after %+v", len(after), len(before), before, after)
	}
	for index := range before {
		if !equalOptionalTime(after[index].PendingDate, before[index].PendingDate) ||
			!equalOptionalTime(after[index].PostedDate, before[index].PostedDate) ||
			after[index].ReconciliationStatus != before[index].ReconciliationStatus {
			t.Fatalf("cancelled record %d preserved fields = pending:%v posted:%v reconciliation:%q, want pending:%v posted:%v reconciliation:%q",
				index,
				after[index].PendingDate,
				after[index].PostedDate,
				after[index].ReconciliationStatus,
				before[index].PendingDate,
				before[index].PostedDate,
				before[index].ReconciliationStatus,
			)
		}
	}
}

func equalOptionalTime(left *time.Time, right *time.Time) bool {
	if left == nil || right == nil {
		return left == right
	}

	return left.Equal(*right)
}

func assertEmptyRecordSearchQuery(t *testing.T, client *apptest.Client, rawQuery string) {
	t.Helper()

	response, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "search records", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("search records query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusOK, response.Body)
	}
	assertRecordIDs(t, response.JSON200.Records, nil)
	if response.JSON200.TotalCount != 0 {
		t.Fatalf("search records query %q total_count = %d, want 0; body %+v", rawQuery, response.JSON200.TotalCount, response.JSON200)
	}
}

func assertInvalidRecordSearchQuery(t *testing.T, client *apptest.Client, rawQuery string) {
	t.Helper()

	response, err := client.REST().SearchJournalRecordsWithResponse(context.Background(), nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "invalid search records", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid search records query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusBadRequest, response.Body)
	}
	if response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid search records query %q code = %+v, want %q", rawQuery, response.JSON400, httpclient.APIErrorCodeInvalidRequest)
	}
}

func assertEmptyAccountRecordSearch(t *testing.T, client *apptest.Client, accountID int64) {
	t.Helper()

	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), accountID, nil)
	requireNoTransportError(t, "search account records", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("search account records status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	assertRecordIDs(t, response.JSON200.Records, nil)
	if response.JSON200.TotalCount != 0 {
		t.Fatalf("search account records total_count = %d, want 0; body %+v", response.JSON200.TotalCount, response.JSON200)
	}
}

func assertEmptyAccountRecordSearchQuery(t *testing.T, client *apptest.Client, accountID int64, rawQuery string) {
	t.Helper()

	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), accountID, nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "search account records", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("search account records query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusOK, response.Body)
	}
	assertRecordIDs(t, response.JSON200.Records, nil)
	if response.JSON200.TotalCount != 0 {
		t.Fatalf("search account records query %q total_count = %d, want 0; body %+v", rawQuery, response.JSON200.TotalCount, response.JSON200)
	}
}

func assertInvalidAccountRecordSearchQuery(t *testing.T, client *apptest.Client, accountID int64, rawQuery string) {
	t.Helper()

	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), accountID, nil, apptest.ReplaceRawQuery(rawQuery))
	requireNoTransportError(t, "invalid search account records", err)
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("invalid search account records query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusBadRequest, response.Body)
	}
	if response.JSON400 == nil || response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("invalid search account records query %q code = %+v, want %q", rawQuery, response.JSON400, httpclient.APIErrorCodeInvalidRequest)
	}
}

func assertAccountRecordSearchNotFound(t *testing.T, client *apptest.Client, accountID int64) {
	t.Helper()

	response, err := client.REST().SearchAccountJournalRecordsWithResponse(context.Background(), accountID, nil)
	requireNoTransportError(t, "search missing account records", err)
	if response.StatusCode() != http.StatusNotFound {
		t.Fatalf("missing account records status = %d, want %d; body %s", response.StatusCode(), http.StatusNotFound, response.Body)
	}
	if response.JSON404 == nil || response.JSON404.Error.Code != httpclient.APIErrorCodeNotFound {
		t.Fatalf("missing account records error = %+v, want %q; body %s", response.JSON404, httpclient.APIErrorCodeNotFound, response.Body)
	}
}
