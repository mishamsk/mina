package runtime_test

import (
	"context"
	"net/http"
	"slices"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

type transactionTemplateRefs struct {
	CheckingAccountID int64
	MerchantAccountID int64
	CategoryID        int64
	TagID             int64
	MemberID          int64
}

func TestTransactionTemplateCreateReadListScenarios(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	minimal := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Utilities:Electric",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	assertTransactionTemplateHierarchy(t, *minimal.JSON201, "Utilities", "Electric", 1)
	assertRequiredOnlyTemplateRecord(t, minimal.JSON201.Records[0], refs.CategoryID)

	readMinimal := getTransactionTemplate(t, client, minimal.JSON201.TransactionTemplateId)
	assertRequiredOnlyTemplateRecord(t, readMinimal.JSON200.Records[0], refs.CategoryID)

	coffeeMemo := "Coffee default"
	coffeeAmount := "4.25"
	coffeeTags := []int64{refs.TagID}
	partial := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Food:Coffee",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				CategoryId: refs.CategoryID,
				AccountId:  &refs.MerchantAccountID,
				Amount:     &coffeeAmount,
				Memo:       &coffeeMemo,
				TagIds:     &coffeeTags,
			},
		},
	})
	partialRead := getTransactionTemplate(t, client, partial.JSON201.TransactionTemplateId)
	assertPartialTemplateRecord(t, partialRead.JSON200.Records[0], refs, coffeeAmount, coffeeMemo)

	fullMemo := "Unbalanced planning debit"
	creditMemo := "Credit placeholder"
	fullCurrency := "USD"
	debitAmount := "-30"
	creditAmount := "20"
	postingStatus := httpclient.NonExpectedPostingStatusPosted
	reconciliationStatus := httpclient.Unreconciled
	full := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Transfers:Planning",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				CategoryId:           refs.CategoryID,
				AccountId:            &refs.CheckingAccountID,
				MemberId:             &refs.MemberID,
				Currency:             &fullCurrency,
				Amount:               &debitAmount,
				TagIds:               &coffeeTags,
				Memo:                 &fullMemo,
				PostingStatus:        &postingStatus,
				ReconciliationStatus: &reconciliationStatus,
			},
			{
				CategoryId: refs.CategoryID,
				AccountId:  &refs.MerchantAccountID,
				Currency:   &fullCurrency,
				Amount:     &creditAmount,
				Memo:       &creditMemo,
			},
		},
	})
	fullRead := getTransactionTemplate(t, client, full.JSON201.TransactionTemplateId)
	if len(fullRead.JSON200.Records) != 2 {
		t.Fatalf("full template record count = %d, want 2; body %+v", len(fullRead.JSON200.Records), fullRead.JSON200)
	}
	assertRichTemplateRecord(t, fullRead.JSON200.Records[0], refs, debitAmount, fullMemo, httpclient.PostingStatusPosted, reconciliationStatus)
	if fullRead.JSON200.Records[1].Amount == nil || *fullRead.JSON200.Records[1].Amount != "20.00000000" {
		t.Fatalf("second amount = %v, want 20.00000000", fullRead.JSON200.Records[1].Amount)
	}
	if fullRead.JSON200.Records[1].PostingStatus != nil || fullRead.JSON200.Records[1].ReconciliationStatus != nil {
		t.Fatalf("second statuses = %v/%v, want nil/nil", fullRead.JSON200.Records[1].PostingStatus, fullRead.JSON200.Records[1].ReconciliationStatus)
	}

	list, err := client.REST().ListTransactionTemplatesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list request: %v", err)
	}
	if list.StatusCode() != http.StatusOK {
		t.Fatalf("list status = %d, want %d; body %s", list.StatusCode(), http.StatusOK, list.Body)
	}
	assertTransactionTemplateIDs(t, list.JSON200.TransactionTemplates, []int64{
		partial.JSON201.TransactionTemplateId,
		full.JSON201.TransactionTemplateId,
		minimal.JSON201.TransactionTemplateId,
	})
	if list.JSON200.TotalCount != 3 {
		t.Fatalf("transaction template list total_count = %d, want 3", list.JSON200.TotalCount)
	}
	minimalListIndex := slices.IndexFunc(list.JSON200.TransactionTemplates, func(template httpclient.TransactionTemplate) bool {
		return template.TransactionTemplateId == minimal.JSON201.TransactionTemplateId
	})
	if minimalListIndex < 0 {
		t.Fatalf("minimal template id %d missing from list", minimal.JSON201.TransactionTemplateId)
	}
	if len(list.JSON200.TransactionTemplates[minimalListIndex].Records) != 1 {
		t.Fatalf("minimal list record count = %d, want 1; body %+v", len(list.JSON200.TransactionTemplates[minimalListIndex].Records), list.JSON200.TransactionTemplates[minimalListIndex])
	}
	assertRequiredOnlyTemplateRecord(t, list.JSON200.TransactionTemplates[minimalListIndex].Records[0], refs.CategoryID)

	descPage, err := client.REST().ListTransactionTemplatesWithResponse(
		context.Background(),
		nil,
		apptest.ReplaceRawQuery("sort=fqn&sort_dir=desc&limit=2&offset=1"),
	)
	if err != nil {
		t.Fatalf("desc page request: %v", err)
	}
	if descPage.StatusCode() != http.StatusOK {
		t.Fatalf("desc page status = %d, want %d; body %s", descPage.StatusCode(), http.StatusOK, descPage.Body)
	}
	assertTransactionTemplateIDs(t, descPage.JSON200.TransactionTemplates, []int64{
		full.JSON201.TransactionTemplateId,
		partial.JSON201.TransactionTemplateId,
	})
	if descPage.JSON200.TotalCount != 3 {
		t.Fatalf("transaction template page total_count = %d, want 3", descPage.JSON200.TotalCount)
	}

	deleted, err := client.REST().DeleteTransactionTemplateWithResponse(context.Background(), minimal.JSON201.TransactionTemplateId)
	if err != nil {
		t.Fatalf("delete listed template request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete listed template status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	afterDeleteList, err := client.REST().ListTransactionTemplatesWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list after delete request: %v", err)
	}
	if afterDeleteList.StatusCode() != http.StatusOK {
		t.Fatalf("list after delete status = %d, want %d; body %s", afterDeleteList.StatusCode(), http.StatusOK, afterDeleteList.Body)
	}
	assertTransactionTemplateIDs(t, afterDeleteList.JSON200.TransactionTemplates, []int64{
		partial.JSON201.TransactionTemplateId,
		full.JSON201.TransactionTemplateId,
	})
}

func TestTransactionTemplateReplaceDeleteAndDuplicateFQN(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	original := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
			{CategoryId: refs.CategoryID, AccountId: &refs.MerchantAccountID},
		},
	})
	originalRecordIDs := transactionTemplateRecordIDs(original.JSON201.Records)

	duplicate, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
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

	changedFQNReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Existing",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if err != nil {
		t.Fatalf("changed fqn replace request: %v", err)
	}
	if changedFQNReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("changed fqn replace status = %d, want %d; body %s", changedFQNReplace.StatusCode(), http.StatusBadRequest, changedFQNReplace.Body)
	}
	if changedFQNReplace.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("changed fqn replace code = %q, want %q", changedFQNReplace.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "Bills:Power", originalRecordIDs)

	emptyRecordsReplace, err := client.REST().ReplaceTransactionTemplateWithBodyWithResponse(
		context.Background(),
		original.JSON201.TransactionTemplateId,
		"application/json",
		apptest.JSONReader(map[string]any{
			"fqn":     "Bills:Power:EmptyRecords",
			"records": []map[string]any{},
		}),
	)
	if err != nil {
		t.Fatalf("empty records replace request: %v", err)
	}
	if emptyRecordsReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("empty records replace status = %d, want %d; body %s", emptyRecordsReplace.StatusCode(), http.StatusBadRequest, emptyRecordsReplace.Body)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "Bills:Power", originalRecordIDs)

	missingCategoryReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID + 9999},
		},
	})
	if err != nil {
		t.Fatalf("missing category replace request: %v", err)
	}
	if missingCategoryReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing category replace status = %d, want %d; body %s", missingCategoryReplace.StatusCode(), http.StatusBadRequest, missingCategoryReplace.Body)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "Bills:Power", originalRecordIDs)

	missingTemplateReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId+9999, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID + 9999},
		},
	})
	if err != nil {
		t.Fatalf("missing template replace request: %v", err)
	}
	if missingTemplateReplace.StatusCode() != http.StatusNotFound {
		t.Fatalf("missing template replace status = %d, want %d; body %s", missingTemplateReplace.StatusCode(), http.StatusNotFound, missingTemplateReplace.Body)
	}

	amount := "42"
	replaced, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				CategoryId: refs.CategoryID,
				AccountId:  &refs.CheckingAccountID,
				Amount:     &amount,
			},
		},
	})
	if err != nil {
		t.Fatalf("replace request: %v", err)
	}
	if replaced.StatusCode() != http.StatusOK {
		t.Fatalf("replace status = %d, want %d; body %s", replaced.StatusCode(), http.StatusOK, replaced.Body)
	}
	if len(replaced.JSON200.Records) != 1 {
		t.Fatalf("replace record count = %d, want 1; body %+v", len(replaced.JSON200.Records), replaced.JSON200)
	}
	replacementRecordID := replaced.JSON200.Records[0].TransactionTemplateRecordId
	if slices.Contains(originalRecordIDs, replacementRecordID) {
		t.Fatalf("replacement record id %d was present in old active records %v", replacementRecordID, originalRecordIDs)
	}
	assertTransactionTemplateHierarchy(t, *replaced.JSON200, "Bills", "Power", 1)

	read := getTransactionTemplate(t, client, original.JSON201.TransactionTemplateId)
	if read.JSON200.Fqn != "Bills:Power" || len(read.JSON200.Records) != 1 {
		t.Fatalf("read replaced template = %+v, want same fqn with one active record", read.JSON200)
	}
	if slices.Contains(originalRecordIDs, read.JSON200.Records[0].TransactionTemplateRecordId) {
		t.Fatalf("read returned tombstoned record id %d", read.JSON200.Records[0].TransactionTemplateRecordId)
	}

	deleted, err := client.REST().DeleteTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId)
	if err != nil {
		t.Fatalf("delete request: %v", err)
	}
	if deleted.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d; body %s", deleted.StatusCode(), http.StatusNoContent, deleted.Body)
	}
	missing, err := client.REST().GetTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId)
	if err != nil {
		t.Fatalf("get deleted request: %v", err)
	}
	if missing.StatusCode() != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want %d; body %s", missing.StatusCode(), http.StatusNotFound, missing.Body)
	}

	recreated := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "Bills:Power",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if recreated.JSON201.TransactionTemplateId == original.JSON201.TransactionTemplateId {
		t.Fatalf("recreated id = %d, want a new template id", recreated.JSON201.TransactionTemplateId)
	}
}

func TestTransactionTemplateRejectsHierarchyFQNConflict(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Leaf",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	extendsLeaf, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Leaf:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if err != nil {
		t.Fatalf("extends leaf request: %v", err)
	}
	if extendsLeaf.StatusCode() != http.StatusConflict {
		t.Fatalf("extends leaf status = %d, want %d; body %s", extendsLeaf.StatusCode(), http.StatusConflict, extendsLeaf.Body)
	}
	if extendsLeaf.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("extends leaf code = %q, want %q", extendsLeaf.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}

	createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Group:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	prefixesChild, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Group",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if err != nil {
		t.Fatalf("prefixes child request: %v", err)
	}
	if prefixesChild.StatusCode() != http.StatusConflict {
		t.Fatalf("prefixes child status = %d, want %d; body %s", prefixesChild.StatusCode(), http.StatusConflict, prefixesChild.Body)
	}
	if prefixesChild.JSON409.Error.Code != httpclient.APIErrorCodeConflict {
		t.Fatalf("prefixes child code = %q, want %q", prefixesChild.JSON409.Error.Code, httpclient.APIErrorCodeConflict)
	}

	original := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Replace",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	originalRecordIDs := transactionTemplateRecordIDs(original.JSON201.Records)
	changedToGroupPathReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Group",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if err != nil {
		t.Fatalf("changed to group path replace request: %v", err)
	}
	if changedToGroupPathReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("changed to group path replace status = %d, want %d; body %s", changedToGroupPathReplace.StatusCode(), http.StatusBadRequest, changedToGroupPathReplace.Body)
	}
	if changedToGroupPathReplace.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("changed to group path replace code = %q, want %q", changedToGroupPathReplace.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "TemplateHierarchy:Replace", originalRecordIDs)

	changedToLeafChildReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Leaf:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if err != nil {
		t.Fatalf("changed to leaf child replace request: %v", err)
	}
	if changedToLeafChildReplace.StatusCode() != http.StatusBadRequest {
		t.Fatalf("changed to leaf child replace status = %d, want %d; body %s", changedToLeafChildReplace.StatusCode(), http.StatusBadRequest, changedToLeafChildReplace.Body)
	}
	if changedToLeafChildReplace.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("changed to leaf child replace code = %q, want %q", changedToLeafChildReplace.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
	assertTransactionTemplateUnchanged(t, client, original.JSON201.TransactionTemplateId, "TemplateHierarchy:Replace", originalRecordIDs)

	amount := "7.50"
	unchangedFQNReplace, err := client.REST().ReplaceTransactionTemplateWithResponse(context.Background(), original.JSON201.TransactionTemplateId, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchy:Replace",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, Amount: &amount},
			{CategoryId: refs.CategoryID, AccountId: &refs.MerchantAccountID},
		},
	})
	if err != nil {
		t.Fatalf("unchanged fqn replace request: %v", err)
	}
	if unchangedFQNReplace.StatusCode() != http.StatusOK {
		t.Fatalf("unchanged fqn replace status = %d, want %d; body %s", unchangedFQNReplace.StatusCode(), http.StatusOK, unchangedFQNReplace.Body)
	}
	if unchangedFQNReplace.JSON200.Fqn != "TemplateHierarchy:Replace" {
		t.Fatalf("unchanged fqn replace fqn = %q, want TemplateHierarchy:Replace", unchangedFQNReplace.JSON200.Fqn)
	}
	if len(unchangedFQNReplace.JSON200.Records) != 2 {
		t.Fatalf("unchanged fqn replace record count = %d, want 2; body %+v", len(unchangedFQNReplace.JSON200.Records), unchangedFQNReplace.JSON200)
	}
	if slices.Equal(transactionTemplateRecordIDs(unchangedFQNReplace.JSON200.Records), originalRecordIDs) {
		t.Fatalf("unchanged fqn replace kept original records %v", originalRecordIDs)
	}
}

func TestTransactionTemplateAllowsHierarchyLookalikeBoundary(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchyLookalike:Leaf",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})

	lookalike, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TemplateHierarchyLookalike:Leafish:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if err != nil {
		t.Fatalf("lookalike create request: %v", err)
	}
	if lookalike.StatusCode() != http.StatusCreated {
		t.Fatalf("lookalike create status = %d, want %d; body %s", lookalike.StatusCode(), http.StatusCreated, lookalike.Body)
	}
}

func TestTransactionTemplateAllowsHierarchyPrefixReuseAfterTombstone(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	leaf := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TombstonedTemplateHierarchy:Leaf",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	deleteTransactionTemplateForRestructure(t, client, leaf.JSON201.TransactionTemplateId)

	childAfterDeletedLeaf, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TombstonedTemplateHierarchy:Leaf:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if err != nil {
		t.Fatalf("child after deleted leaf request: %v", err)
	}
	if childAfterDeletedLeaf.StatusCode() != http.StatusCreated {
		t.Fatalf("child after deleted leaf status = %d, want %d; body %s", childAfterDeletedLeaf.StatusCode(), http.StatusCreated, childAfterDeletedLeaf.Body)
	}

	child := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "TombstonedTemplateHierarchy:Group:Child",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	deleteTransactionTemplateForRestructure(t, client, child.JSON201.TransactionTemplateId)

	parentAfterDeletedChild, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), httpclient.TransactionTemplateWriteRequest{
		Fqn: "TombstonedTemplateHierarchy:Group",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	if err != nil {
		t.Fatalf("parent after deleted child request: %v", err)
	}
	if parentAfterDeletedChild.StatusCode() != http.StatusCreated {
		t.Fatalf("parent after deleted child status = %d, want %d; body %s", parentAfterDeletedChild.StatusCode(), http.StatusCreated, parentAfterDeletedChild.Body)
	}
}

func TestTransactionTemplateValidationErrors(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	invalidAccountID := int64(0)
	invalidMemberID := int64(-1)
	invalidTagIDs := []int64{refs.TagID, refs.TagID}
	assertInvalidTransactionTemplateCreate(t, client, "zero category id", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:CategoryID",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: 0},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "zero account id", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:AccountID",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, AccountId: &invalidAccountID},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "negative member id", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:MemberID",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, MemberId: &invalidMemberID},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "duplicate tag ids", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:DuplicateTags",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, TagIds: &invalidTagIDs},
		},
	})

	invalidCurrency := "ZZZ"
	assertInvalidTransactionTemplateCreate(t, client, "invalid currency", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:Currency",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, Currency: &invalidCurrency},
		},
	})

	memoWithWhitespace := " trailing "
	assertInvalidTransactionTemplateCreate(t, client, "whitespace fqn", httpclient.TransactionTemplateWriteRequest{
		Fqn: " Invalid:FQN",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "whitespace memo", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:Memo",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, Memo: &memoWithWhitespace},
		},
	})

	zeroAmount := "0"
	assertInvalidTransactionTemplateCreate(t, client, "zero amount", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:ZeroAmount",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, Amount: &zeroAmount},
		},
	})

	unsupportedStatus := httpclient.NonExpectedPostingStatus("unknown")
	assertInvalidTransactionTemplateCreate(t, client, "unsupported posting status", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:PostingStatus",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, PostingStatus: &unsupportedStatus},
		},
	})
	unsupportedReconciliationStatus := httpclient.ReconciliationStatus("unknown")
	assertInvalidTransactionTemplateCreate(t, client, "unsupported reconciliation status", httpclient.TransactionTemplateWriteRequest{
		Fqn: "Invalid:ReconciliationStatus",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, ReconciliationStatus: &unsupportedReconciliationStatus},
		},
	})

	missingRecords, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn": "Invalid:MissingRecords",
	}))
	if err != nil {
		t.Fatalf("missing records request: %v", err)
	}
	if missingRecords.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing records status = %d, want %d; body %s", missingRecords.StatusCode(), http.StatusBadRequest, missingRecords.Body)
	}

	emptyRecords, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":     "Invalid:EmptyRecords",
		"records": []map[string]any{},
	}))
	if err != nil {
		t.Fatalf("empty records request: %v", err)
	}
	if emptyRecords.StatusCode() != http.StatusBadRequest {
		t.Fatalf("empty records status = %d, want %d; body %s", emptyRecords.StatusCode(), http.StatusBadRequest, emptyRecords.Body)
	}

	missingCategory, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn": "Invalid:MissingCategory",
		"records": []map[string]any{
			{"memo": "missing category"},
		},
	}))
	if err != nil {
		t.Fatalf("missing category request: %v", err)
	}
	if missingCategory.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing category status = %d, want %d; body %s", missingCategory.StatusCode(), http.StatusBadRequest, missingCategory.Body)
	}
}

func TestTransactionTemplateReferenceChecks(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	assertInvalidTransactionTemplateCreate(t, client, "missing category reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:MissingCategory",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID + 9999},
		},
	})
	missingAccountID := refs.CheckingAccountID + 9999
	assertInvalidTransactionTemplateCreate(t, client, "missing account reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:MissingAccount",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, AccountId: &missingAccountID},
		},
	})
	missingMemberID := refs.MemberID + 9999
	assertInvalidTransactionTemplateCreate(t, client, "missing member reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:MissingMember",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, MemberId: &missingMemberID},
		},
	})
	missingTagIDs := []int64{refs.TagID + 9999}
	assertInvalidTransactionTemplateCreate(t, client, "missing tag reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:MissingTag",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, TagIds: &missingTagIDs},
		},
	})

	deletedAccount := client.Scenario().Account("expense:TombstonedMerchant")
	deletedCategory := client.Scenario().Category("Templates:TombstonedCategory")
	deletedMember := client.Scenario().Member("Tombstoned Template Member")
	deletedTag := client.Scenario().Tag("Templates:TombstonedTag")
	deleteAccount(t, client, deletedAccount.AccountId)
	deleteCategory(t, client, deletedCategory.CategoryId)
	deleteMember(t, client, deletedMember.MemberId)
	deleteTag(t, client, deletedTag.TagId)

	assertInvalidTransactionTemplateCreate(t, client, "tombstoned category reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:TombstonedCategory",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: deletedCategory.CategoryId},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "tombstoned account reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:TombstonedAccount",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, AccountId: &deletedAccount.AccountId},
		},
	})
	assertInvalidTransactionTemplateCreate(t, client, "tombstoned member reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:TombstonedMember",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, MemberId: &deletedMember.MemberId},
		},
	})
	deletedTagIDs := []int64{deletedTag.TagId}
	assertInvalidTransactionTemplateCreate(t, client, "tombstoned tag reference", httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:TombstonedTag",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{CategoryId: refs.CategoryID, TagIds: &deletedTagIDs},
		},
	})

	hidden := true
	hiddenCategory := client.Scenario().CategoryWithHidden("Templates:HiddenCategory", hidden)
	hiddenAccountResponse, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{
		Fqn:         "expense:HiddenMerchant",
		AccountType: httpclient.Flow,
		IsHidden:    &hidden,
	})
	if err != nil {
		t.Fatalf("hidden account request: %v", err)
	}
	if hiddenAccountResponse.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden account status = %d, want %d; body %s", hiddenAccountResponse.StatusCode(), http.StatusCreated, hiddenAccountResponse.Body)
	}
	hiddenTagResponse, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{
		Fqn:      "Templates:HiddenTag",
		IsHidden: &hidden,
	})
	if err != nil {
		t.Fatalf("hidden tag request: %v", err)
	}
	if hiddenTagResponse.StatusCode() != http.StatusCreated {
		t.Fatalf("hidden tag status = %d, want %d; body %s", hiddenTagResponse.StatusCode(), http.StatusCreated, hiddenTagResponse.Body)
	}
	hiddenTagIDs := []int64{hiddenTagResponse.JSON201.TagId}
	created := createTransactionTemplate(t, client, httpclient.TransactionTemplateWriteRequest{
		Fqn: "References:HiddenActive",
		Records: []httpclient.TransactionTemplateRecordRequest{
			{
				CategoryId: hiddenCategory.CategoryId,
				AccountId:  &hiddenAccountResponse.JSON201.AccountId,
				TagIds:     &hiddenTagIDs,
			},
		},
	})
	if created.JSON201.Records[0].CategoryId != hiddenCategory.CategoryId ||
		created.JSON201.Records[0].AccountId == nil ||
		*created.JSON201.Records[0].AccountId != hiddenAccountResponse.JSON201.AccountId {
		t.Fatalf("hidden active references not returned as selected: %+v", created.JSON201.Records[0])
	}
	assertInt64s(t, created.JSON201.Records[0].TagIds, hiddenTagIDs)
}

func TestTransactionTemplateTransportValidation(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionTemplateRefs(t, client)

	missingRequired, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"records": []map[string]any{{"category_id": refs.CategoryID}},
	}))
	if err != nil {
		t.Fatalf("missing required request: %v", err)
	}
	if missingRequired.StatusCode() != http.StatusBadRequest {
		t.Fatalf("missing required status = %d, want %d; body %s", missingRequired.StatusCode(), http.StatusBadRequest, missingRequired.Body)
	}

	unknownField, err := client.REST().CreateTransactionTemplateWithBodyWithResponse(context.Background(), "application/json", apptest.JSONReader(map[string]any{
		"fqn":     "Transport:UnknownField",
		"records": []map[string]any{{"category_id": refs.CategoryID}},
		"extra":   true,
	}))
	if err != nil {
		t.Fatalf("unknown field request: %v", err)
	}
	if unknownField.StatusCode() != http.StatusBadRequest {
		t.Fatalf("unknown field status = %d, want %d; body %s", unknownField.StatusCode(), http.StatusBadRequest, unknownField.Body)
	}

	badPath, err := client.REST().GetTransactionTemplateWithResponse(context.Background(), 0)
	if err != nil {
		t.Fatalf("bad path request: %v", err)
	}
	if badPath.StatusCode() != http.StatusBadRequest {
		t.Fatalf("bad path status = %d, want %d; body %s", badPath.StatusCode(), http.StatusBadRequest, badPath.Body)
	}

	for _, rawQuery := range []string{
		"sort=name",
		"sort_dir=sideways",
		"limit=0",
		"limit=501",
		"offset=-1",
	} {
		response, err := client.REST().ListTransactionTemplatesWithResponse(context.Background(), nil, apptest.ReplaceRawQuery(rawQuery))
		if err != nil {
			t.Fatalf("invalid list query %q request: %v", rawQuery, err)
		}
		if response.StatusCode() != http.StatusBadRequest {
			t.Fatalf("invalid list query %q status = %d, want %d; body %s", rawQuery, response.StatusCode(), http.StatusBadRequest, response.Body)
		}
	}
}

func createTransactionTemplateRefs(t *testing.T, client *apptest.Client) transactionTemplateRefs {
	t.Helper()

	checking := client.Scenario().AccountWithCurrency("checking:Template:Primary", "USD")
	merchant := client.Scenario().Account("expense:TemplateMerchant")
	category := client.Scenario().Category("Templates:Default")
	tag := client.Scenario().Tag("Templates:Reusable")
	member := client.Scenario().Member("Template Member")

	return transactionTemplateRefs{
		CheckingAccountID: checking.AccountId,
		MerchantAccountID: merchant.AccountId,
		CategoryID:        category.CategoryId,
		TagID:             tag.TagId,
		MemberID:          member.MemberId,
	}
}

func createTransactionTemplate(
	t *testing.T,
	client *apptest.Client,
	request httpclient.TransactionTemplateWriteRequest,
) *httpclient.CreateTransactionTemplateResponse {
	t.Helper()

	response, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("create template request: %v", err)
	}
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create template status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}

	return response
}

func getTransactionTemplate(t *testing.T, client *apptest.Client, id int64) *httpclient.GetTransactionTemplateResponse {
	t.Helper()

	response, err := client.REST().GetTransactionTemplateWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("get template request: %v", err)
	}
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("get template status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}

	return response
}

func assertInvalidTransactionTemplateCreate(
	t *testing.T,
	client *apptest.Client,
	label string,
	request httpclient.TransactionTemplateWriteRequest,
) {
	t.Helper()

	response, err := client.REST().CreateTransactionTemplateWithResponse(context.Background(), request)
	if err != nil {
		t.Fatalf("%s request: %v", label, err)
	}
	if response.StatusCode() != http.StatusBadRequest {
		t.Fatalf("%s status = %d, want %d; body %s", label, response.StatusCode(), http.StatusBadRequest, response.Body)
	}
	if response.JSON400.Error.Code != httpclient.APIErrorCodeInvalidRequest {
		t.Fatalf("%s code = %q, want %q", label, response.JSON400.Error.Code, httpclient.APIErrorCodeInvalidRequest)
	}
}

func assertRequiredOnlyTemplateRecord(t *testing.T, record httpclient.TransactionTemplateRecord, categoryID int64) {
	t.Helper()

	if record.CategoryId != categoryID {
		t.Fatalf("category_id = %d, want %d", record.CategoryId, categoryID)
	}
	if record.AccountId != nil || record.MemberId != nil || record.Currency != nil || record.Amount != nil || record.Memo != nil ||
		record.PostingStatus != nil || record.ReconciliationStatus != nil {
		t.Fatalf("optional defaults = account:%v member:%v currency:%v amount:%v memo:%v posting:%v reconciliation:%v, want all nil",
			record.AccountId,
			record.MemberId,
			record.Currency,
			record.Amount,
			record.Memo,
			record.PostingStatus,
			record.ReconciliationStatus,
		)
	}
	if len(record.TagIds) != 0 {
		t.Fatalf("tag_ids = %v, want empty", record.TagIds)
	}
	if record.TransactionTemplateRecordId <= 0 || record.TransactionTemplateId <= 0 || record.CreatedAt.IsZero() || record.UpdatedAt.IsZero() {
		t.Fatalf("record ids/timestamps not populated: %+v", record)
	}
}

func assertPartialTemplateRecord(
	t *testing.T,
	record httpclient.TransactionTemplateRecord,
	refs transactionTemplateRefs,
	amount string,
	memo string,
) {
	t.Helper()

	if record.CategoryId != refs.CategoryID {
		t.Fatalf("category_id = %d, want %d", record.CategoryId, refs.CategoryID)
	}
	if record.AccountId == nil || *record.AccountId != refs.MerchantAccountID {
		t.Fatalf("account_id = %v, want %d", record.AccountId, refs.MerchantAccountID)
	}
	if record.Amount == nil || *record.Amount != "4.25000000" {
		t.Fatalf("amount = %v, want %s fixed scale", record.Amount, amount)
	}
	if record.Memo == nil || *record.Memo != memo {
		t.Fatalf("memo = %v, want %q", record.Memo, memo)
	}
	assertInt64s(t, record.TagIds, []int64{refs.TagID})
}

func assertRichTemplateRecord(
	t *testing.T,
	record httpclient.TransactionTemplateRecord,
	refs transactionTemplateRefs,
	amount string,
	memo string,
	postingStatus httpclient.PostingStatus,
	reconciliationStatus httpclient.ReconciliationStatus,
) {
	t.Helper()

	if record.CategoryId != refs.CategoryID {
		t.Fatalf("category_id = %d, want %d", record.CategoryId, refs.CategoryID)
	}
	if record.AccountId == nil || *record.AccountId != refs.CheckingAccountID {
		t.Fatalf("account_id = %v, want %d", record.AccountId, refs.CheckingAccountID)
	}
	if record.MemberId == nil || *record.MemberId != refs.MemberID {
		t.Fatalf("member_id = %v, want %d", record.MemberId, refs.MemberID)
	}
	if record.Currency == nil || *record.Currency != "USD" {
		t.Fatalf("currency = %v, want USD", record.Currency)
	}
	if record.Amount == nil || *record.Amount != "-30.00000000" {
		t.Fatalf("amount = %v, want %s fixed scale", record.Amount, amount)
	}
	if record.Memo == nil || *record.Memo != memo {
		t.Fatalf("memo = %v, want %q", record.Memo, memo)
	}
	if record.PostingStatus == nil || *record.PostingStatus != postingStatus {
		t.Fatalf("posting_status = %v, want %q", record.PostingStatus, postingStatus)
	}
	if record.ReconciliationStatus == nil || *record.ReconciliationStatus != reconciliationStatus {
		t.Fatalf("reconciliation_status = %v, want %q", record.ReconciliationStatus, reconciliationStatus)
	}
	assertInt64s(t, record.TagIds, []int64{refs.TagID})
}

func assertTransactionTemplateHierarchy(t *testing.T, template httpclient.TransactionTemplate, parent string, name string, level int) {
	t.Helper()

	if template.ParentFqn == nil || *template.ParentFqn != parent {
		t.Fatalf("parent_fqn = %v, want %q", template.ParentFqn, parent)
	}
	if template.Name != name {
		t.Fatalf("name = %q, want %q", template.Name, name)
	}
	if template.Level != level {
		t.Fatalf("level = %d, want %d", template.Level, level)
	}
	if template.CreatedAt.IsZero() || template.UpdatedAt.IsZero() {
		t.Fatalf("template timestamps = %q/%q, want populated", template.CreatedAt, template.UpdatedAt)
	}
}

func assertTransactionTemplateIDs(t *testing.T, templates []httpclient.TransactionTemplate, want []int64) {
	t.Helper()

	got := make([]int64, 0, len(templates))
	for _, template := range templates {
		got = append(got, template.TransactionTemplateId)
	}
	assertInt64s(t, got, want)
}

func transactionTemplateRecordIDs(records []httpclient.TransactionTemplateRecord) []int64 {
	ids := make([]int64, 0, len(records))
	for _, record := range records {
		ids = append(ids, record.TransactionTemplateRecordId)
	}

	return ids
}

func assertTransactionTemplateUnchanged(t *testing.T, client *apptest.Client, id int64, fqn string, recordIDs []int64) {
	t.Helper()

	read := getTransactionTemplate(t, client, id)
	if read.JSON200.Fqn != fqn {
		t.Fatalf("template fqn after rejected replace = %q, want %q", read.JSON200.Fqn, fqn)
	}
	assertInt64s(t, transactionTemplateRecordIDs(read.JSON200.Records), recordIDs)
}

func deleteAccount(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().DeleteAccountWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete account request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete account status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}

func deleteCategory(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().DeleteCategoryWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete category request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete category status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}

func deleteMember(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().DeleteMemberWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete member request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete member status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}

func deleteTag(t *testing.T, client *apptest.Client, id int64) {
	t.Helper()

	response, err := client.REST().DeleteTagWithResponse(context.Background(), id)
	if err != nil {
		t.Fatalf("delete tag request: %v", err)
	}
	if response.StatusCode() != http.StatusNoContent {
		t.Fatalf("delete tag status = %d, want %d; body %s", response.StatusCode(), http.StatusNoContent, response.Body)
	}
}
