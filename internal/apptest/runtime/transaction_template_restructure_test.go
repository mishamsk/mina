package runtime_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestTransactionTemplateRestructureRenamesSubtreeAndPreservesRecords(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	amount := "4.25"
	memo := "Default memo"
	tagIDs := []int64{refs.TagID}
	first := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:Template:Old:First",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				CategoryId: refs.CategoryID,
				AccountId:  &refs.MerchantAccountID,
				Amount:     &amount,
				Memo:       &memo,
				TagIds:     &tagIDs,
			},
		},
	})
	second := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:Template:Old:Second",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	firstRecordIDs := transactionTemplateRecordIDs(first.JSON201.Records)
	secondRecordIDs := transactionTemplateRecordIDs(second.JSON201.Records)

	response := restructureTransactionTemplates(t, client, "restructure:Template:Old", "restructure:Template:New")
	if response.JSON200.MovedCount != 2 {
		t.Fatalf("template restructure moved_count = %d, want 2", response.JSON200.MovedCount)
	}

	assertTransactionTemplateFQNAndRecordIDs(t, client, first.JSON201.TransactionTemplateId, "restructure:Template:New:First", firstRecordIDs)
	assertTransactionTemplateFQNAndRecordIDs(t, client, second.JSON201.TransactionTemplateId, "restructure:Template:New:Second", secondRecordIDs)
	readFirst := getTransactionTemplate(t, client, first.JSON201.TransactionTemplateId)
	assertPartialTemplateRecord(t, readFirst.JSON200.Records[0], refs, amount, memo)

	leaf := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplateLeafGroup",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	leafToGroup := restructureTransactionTemplates(t, client, "restructure:TemplateLeafGroup", "restructure:TemplateLeafGroup:Other")
	if leafToGroup.JSON200.MovedCount != 1 {
		t.Fatalf("template leaf-to-group moved_count = %d, want 1", leafToGroup.JSON200.MovedCount)
	}
	assertTransactionTemplateFQNAndRecordIDs(t, client, leaf.JSON201.TransactionTemplateId, "restructure:TemplateLeafGroup:Other", transactionTemplateRecordIDs(leaf.JSON201.Records))
}

func TestTransactionTemplateRestructureRejectsMissingConflictAndSamePath(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	assertRestructureTransactionTemplateStatus(t, client, "restructure:TemplateMissing", "restructure:TemplateMissing:New", http.StatusNotFound, httpclient.APIErrorCodeNotFound)

	ownSubtree := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplateOwnSubtree:One",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplateOwnSubtree:Two",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	assertRestructureTransactionTemplateStatus(t, client, "restructure:TemplateOwnSubtree", "restructure:TemplateOwnSubtree:Moved", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertTransactionTemplateFQNAndRecordIDs(t, client, ownSubtree.JSON201.TransactionTemplateId, "restructure:TemplateOwnSubtree:One", transactionTemplateRecordIDs(ownSubtree.JSON201.Records))

	source := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplateConflict:Source",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	occupied := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplateConflict:Target:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	assertRestructureTransactionTemplateStatus(t, client, "restructure:TemplateConflict:Source", "restructure:TemplateConflict:Target", http.StatusConflict, httpclient.APIErrorCodeConflict)
	assertTransactionTemplateFQNAndRecordIDs(t, client, source.JSON201.TransactionTemplateId, "restructure:TemplateConflict:Source", transactionTemplateRecordIDs(source.JSON201.Records))
	assertTransactionTemplateFQNAndRecordIDs(t, client, occupied.JSON201.TransactionTemplateId, "restructure:TemplateConflict:Target:Child", transactionTemplateRecordIDs(occupied.JSON201.Records))

	prefixSource := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplatePrefixConflict:Source",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	prefixOccupied := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplatePrefixConflict:Target",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	assertRestructureTransactionTemplateStatus(t, client, "restructure:TemplatePrefixConflict:Source", "restructure:TemplatePrefixConflict:Target:Child", http.StatusConflict, httpclient.APIErrorCodeConflict)
	assertTransactionTemplateFQNAndRecordIDs(t, client, prefixSource.JSON201.TransactionTemplateId, "restructure:TemplatePrefixConflict:Source", transactionTemplateRecordIDs(prefixSource.JSON201.Records))
	assertTransactionTemplateFQNAndRecordIDs(t, client, prefixOccupied.JSON201.TransactionTemplateId, "restructure:TemplatePrefixConflict:Target", transactionTemplateRecordIDs(prefixOccupied.JSON201.Records))

	assertRestructureTransactionTemplateStatus(t, client, "restructure:TemplateConflict:Source", "restructure:TemplateConflict:Source", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureTransactionTemplateStatus(t, client, ":invalid", "restructure:TemplateInvalid:To", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
	assertRestructureTransactionTemplateStatus(t, client, "restructure:TemplateConflict:Source", "restructure::TemplateInvalid", http.StatusBadRequest, httpclient.APIErrorCodeInvalidRequest)
}

func TestTransactionTemplateRestructureExcludesTombstonedTemplates(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	tombstoned := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplateTombstone:Old:Deleted",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	deleteTransactionTemplateForRestructure(t, client, tombstoned.JSON201.TransactionTemplateId)
	active := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "restructure:TemplateTombstone:Old:Active",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})

	response := restructureTransactionTemplates(t, client, "restructure:TemplateTombstone:Old", "restructure:TemplateTombstone:New")
	if response.JSON200.MovedCount != 1 {
		t.Fatalf("template restructure moved_count = %d, want 1", response.JSON200.MovedCount)
	}
	assertTransactionTemplateFQNAndRecordIDs(t, client, active.JSON201.TransactionTemplateId, "restructure:TemplateTombstone:New:Active", transactionTemplateRecordIDs(active.JSON201.Records))
}

func restructureTransactionTemplates(t *testing.T, client *apptest.Client, from string, to string) *httpclient.RestructureTransactionTemplatesResponse {
	t.Helper()

	response, err := client.REST().RestructureTransactionTemplatesWithResponse(context.Background(), httpclient.RestructureRequest{
		FromFqn: from,
		ToFqn:   to,
	})
	requireNoTransportError(t, "restructure transaction templates", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("restructure transaction templates status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertRestructureTransactionTemplateStatus(t *testing.T, client *apptest.Client, from string, to string, status int, code httpclient.APIErrorCode) {
	t.Helper()

	response, err := client.REST().RestructureTransactionTemplatesWithResponse(context.Background(), httpclient.RestructureRequest{
		FromFqn: from,
		ToFqn:   to,
	})
	requireNoTransportError(t, "restructure transaction templates rejected", err)
	if response.StatusCode() != status {
		t.Fatalf("restructure transaction templates status = %d, want %d; body %s", response.StatusCode(), status, response.Body)
	}
	switch status {
	case http.StatusBadRequest:
		if response.JSON400 == nil || response.JSON400.Error.Code != code {
			t.Fatalf("400 error = %+v, want code %q; body %s", response.JSON400, code, response.Body)
		}
	case http.StatusNotFound:
		if response.JSON404 == nil || response.JSON404.Error.Code != code {
			t.Fatalf("404 error = %+v, want code %q; body %s", response.JSON404, code, response.Body)
		}
	case http.StatusConflict:
		if response.JSON409 == nil || response.JSON409.Error.Code != code {
			t.Fatalf("409 error = %+v, want code %q; body %s", response.JSON409, code, response.Body)
		}
	default:
		t.Fatalf("unsupported transaction template restructure status %d", status)
	}
}

func assertTransactionTemplateFQNAndRecordIDs(t *testing.T, client *apptest.Client, templateID int64, fqn string, recordIDs []int64) {
	t.Helper()

	response := getTransactionTemplate(t, client, templateID)
	if response.JSON200.Fqn != fqn {
		t.Fatalf("transaction template %d fqn = %q, want %q", templateID, response.JSON200.Fqn, fqn)
	}
	assertInt64s(t, transactionTemplateRecordIDs(response.JSON200.Records), recordIDs)
}

func deleteTransactionTemplateForRestructure(t *testing.T, client *apptest.Client, templateID int64) {
	t.Helper()

	response, err := client.REST().DeleteTransactionTemplateWithResponse(context.Background(), templateID)
	requireNoTransportError(t, "delete transaction template for restructure", err)
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete transaction template for restructure status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}
