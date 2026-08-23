package runtime_test

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

type concurrentHTTPResult struct {
	status int
	body   []byte
	err    error
}

func assertOneCreatedOneConflict(t *testing.T, results []concurrentHTTPResult) {
	t.Helper()
	statuses := map[int]int{}
	for _, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent hierarchy request: %v", result.err)
		}
		statuses[result.status]++
	}
	if statuses[http.StatusCreated] != 1 || statuses[http.StatusConflict] != 1 {
		t.Fatalf("concurrent hierarchy statuses = %+v, want one 201 and one 409; bodies = %s | %s", statuses, results[0].body, results[1].body)
	}
}

func TestConcurrentPrefixConflictsKeepHierarchiesPrefixFree(t *testing.T) {
	t.Run("accounts", func(t *testing.T) {
		client := newSharedClient(t)
		request := func(fqn string) func(httpclient.RequestEditorFn) concurrentHTTPResult {
			return func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
				response, err := client.REST().CreateAccountWithResponse(context.Background(), httpclient.CreateAccountRequest{Fqn: fqn, AccountType: httpclient.WritableAccountTypeFlow}, editor)
				if err != nil {
					return concurrentHTTPResult{err: err}
				}
				return concurrentHTTPResult{status: response.StatusCode(), body: response.Body, err: err}
			}
		}
		assertOneCreatedOneConflict(t, apptest.RunConcurrentRequests(t, request("ConcurrentPrefix:Account"), request("ConcurrentPrefix:Account:Child")))
		listed, err := client.REST().ListAccountsWithResponse(context.Background(), nil)
		requireClientResponse(t, "list accounts after prefix conflict", err, listed.StatusCode(), http.StatusOK, listed.Body)
		count := 0
		for _, account := range listed.JSON200.Accounts {
			if strings.HasPrefix(account.Fqn, "ConcurrentPrefix:Account") {
				count++
			}
		}
		if count != 1 {
			t.Fatalf("active concurrent account hierarchy count = %d, want 1", count)
		}
	})

	t.Run("categories", func(t *testing.T) {
		client := newSharedClient(t)
		request := func(fqn string) func(httpclient.RequestEditorFn) concurrentHTTPResult {
			return func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
				response, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{Fqn: fqn, EconomicIntent: httpclient.CategoryEconomicIntentExpense}, editor)
				if err != nil {
					return concurrentHTTPResult{err: err}
				}
				return concurrentHTTPResult{status: response.StatusCode(), body: response.Body, err: err}
			}
		}
		assertOneCreatedOneConflict(t, apptest.RunConcurrentRequests(t, request("ConcurrentPrefix:Category"), request("ConcurrentPrefix:Category:Child")))
		listed, err := client.REST().ListCategoriesWithResponse(context.Background(), nil)
		requireClientResponse(t, "list categories after prefix conflict", err, listed.StatusCode(), http.StatusOK, listed.Body)
		count := 0
		for _, category := range listed.JSON200.Categories {
			if strings.HasPrefix(category.Fqn, "ConcurrentPrefix:Category") {
				count++
			}
		}
		if count != 1 {
			t.Fatalf("active concurrent category hierarchy count = %d, want 1", count)
		}
	})

	t.Run("tags", func(t *testing.T) {
		client := newSharedClient(t)
		request := func(fqn string) func(httpclient.RequestEditorFn) concurrentHTTPResult {
			return func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
				response, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: fqn}, editor)
				if err != nil {
					return concurrentHTTPResult{err: err}
				}
				return concurrentHTTPResult{status: response.StatusCode(), body: response.Body, err: err}
			}
		}
		assertOneCreatedOneConflict(t, apptest.RunConcurrentRequests(t, request("ConcurrentPrefix:Tag"), request("ConcurrentPrefix:Tag:Child")))
		listed, err := client.REST().ListTagsWithResponse(context.Background(), nil)
		requireClientResponse(t, "list tags after prefix conflict", err, listed.StatusCode(), http.StatusOK, listed.Body)
		count := 0
		for _, tag := range listed.JSON200.Tags {
			if strings.HasPrefix(tag.Fqn, "ConcurrentPrefix:Tag") {
				count++
			}
		}
		if count != 1 {
			t.Fatalf("active concurrent tag hierarchy count = %d, want 1", count)
		}
	})

	t.Run("recurring definitions", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createRecurringDefinitionRefs(t, client, "ConcurrentPrefixRecurring")
		request := func(fqn string) func(httpclient.RequestEditorFn) concurrentHTTPResult {
			return func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
				body := recurringDefinitionRequest(fqn, refs, "-10.00000000", "10.00000000", intervalRule(1, "MONTH"), "2026-08-18")
				response, err := client.REST().CreateRecurringDefinitionWithResponse(context.Background(), body, editor)
				if err != nil {
					return concurrentHTTPResult{err: err}
				}
				return concurrentHTTPResult{status: response.StatusCode(), body: response.Body, err: err}
			}
		}
		assertOneCreatedOneConflict(t, apptest.RunConcurrentRequests(t, request("ConcurrentPrefix:Recurring"), request("ConcurrentPrefix:Recurring:Child")))
		listed, err := client.REST().ListRecurringDefinitionsWithResponse(context.Background(), nil)
		requireClientResponse(t, "list recurring definitions after prefix conflict", err, listed.StatusCode(), http.StatusOK, listed.Body)
		count := 0
		for _, definition := range listed.JSON200.RecurringDefinitions {
			if strings.HasPrefix(definition.Fqn, "ConcurrentPrefix:Recurring") {
				count++
			}
		}
		if count != 1 {
			t.Fatalf("active concurrent recurring hierarchy count = %d, want 1", count)
		}
	})
}

func TestConcurrentAPIAuditRecordingAndListing(t *testing.T) {
	client := newSharedClient(t)
	const workers = 4
	const requestsPerWorker = 20
	start := make(chan struct{})
	errors := make(chan error, workers*2)
	var pending sync.WaitGroup
	pending.Add(workers * 2)

	for worker := range workers {
		go func() {
			defer pending.Done()
			<-start
			for request := range requestsPerWorker {
				response, err := client.REST().CreateTagWithResponse(
					context.Background(),
					httpclient.CreateTagRequest{Fqn: fmt.Sprintf("Audit:Concurrent:%d:%d", worker, request)},
				)
				if err != nil {
					errors <- fmt.Errorf("create tag: %w", err)
					return
				}
				if response.StatusCode() != http.StatusCreated {
					errors <- fmt.Errorf("create tag status = %d; body %s", response.StatusCode(), response.Body)
					return
				}
			}
		}()
		go func() {
			defer pending.Done()
			<-start
			for range requestsPerWorker {
				response, err := client.REST().ListAPIAuditEntriesWithResponse(context.Background(), nil)
				if err != nil {
					errors <- fmt.Errorf("list audit entries: %w", err)
					return
				}
				if response.StatusCode() != http.StatusOK {
					errors <- fmt.Errorf("list audit entries status = %d; body %s", response.StatusCode(), response.Body)
					return
				}
			}
		}()
	}

	close(start)
	pending.Wait()
	close(errors)
	for err := range errors {
		t.Error(err)
	}

	entries := listAPIAuditEntries(t, client, nil)
	if entries.TotalCount != workers*requestsPerWorker {
		t.Fatalf("audit entry count = %d, want %d", entries.TotalCount, workers*requestsPerWorker)
	}
}

func TestConcurrentColdReferenceReads(t *testing.T) {
	client := newSharedClient(t)
	rest := client.REST()
	ctx := context.Background()
	anchorDate := apptest.Date("2026-07-15")
	maxMonths := 1

	seeded, err := rest.SeedDemoWithResponse(ctx, &httpclient.SeedDemoParams{
		AnchorDate: &anchorDate,
		MaxMonths:  &maxMonths,
	})
	if err != nil {
		t.Fatalf("seed cold-cache fixture request: %v", err)
	}
	if seeded.StatusCode() != http.StatusOK {
		t.Fatalf("seed cold-cache fixture status = %d, want %d; body %s", seeded.StatusCode(), http.StatusOK, seeded.Body)
	}

	limit := 500
	listed, err := rest.ListTransactionsWithResponse(ctx, &httpclient.ListTransactionsParams{Limit: &limit})
	if err != nil {
		t.Fatalf("list cold-cache fixtures request: %v", err)
	}
	if listed.StatusCode() != http.StatusOK {
		t.Fatalf("list cold-cache fixtures status = %d, want %d; body %s", listed.StatusCode(), http.StatusOK, listed.Body)
	}

	var fixture *httpclient.Transaction
	var accountID, categoryID, tagID, memberID int64
	for index := range listed.JSON200.Transactions {
		candidate := &listed.JSON200.Transactions[index]
		for _, record := range candidate.Records {
			if accountID == 0 {
				accountID = record.AccountId
			}
			if categoryID == 0 && record.CategoryId != nil {
				categoryID = *record.CategoryId
			}
			if tagID == 0 && len(record.TagIds) > 0 {
				tagID = record.TagIds[0]
			}
			if memberID == 0 && record.MemberId != nil {
				memberID = *record.MemberId
			}
		}
		if accountID != 0 && categoryID != 0 && tagID != 0 && memberID != 0 {
			fixture = candidate
			break
		}
		accountID, categoryID, tagID, memberID = 0, 0, 0, 0
	}
	if fixture == nil {
		t.Fatal("seeded transactions contain no fixture with account, category, tag, and member references")
	}

	account, err := rest.GetAccountWithResponse(ctx, accountID, nil)
	if err != nil || account.StatusCode() != http.StatusOK {
		t.Fatalf("get cold-cache account request: %v; response %+v", err, account)
	}
	category, err := rest.GetCategoryWithResponse(ctx, categoryID, nil)
	if err != nil || category.StatusCode() != http.StatusOK {
		t.Fatalf("get cold-cache category request: %v; response %+v", err, category)
	}
	tag, err := rest.GetTagWithResponse(ctx, tagID, nil)
	if err != nil || tag.StatusCode() != http.StatusOK {
		t.Fatalf("get cold-cache tag request: %v; response %+v", err, tag)
	}
	member, err := rest.GetMemberWithResponse(ctx, memberID, nil)
	if err != nil || member.StatusCode() != http.StatusOK {
		t.Fatalf("get cold-cache member request: %v; response %+v", err, member)
	}
	filter := "account:" + strconv.Quote(account.JSON200.Fqn) +
		" and category:" + strconv.Quote(category.JSON200.Fqn) +
		" and tag:" + strconv.Quote(tag.JSON200.Fqn) +
		" and member:" + strconv.Quote(member.JSON200.Name)
	params := &httpclient.ListTransactionsParams{
		Filter: &filter,
	}

	type readResult struct {
		response *httpclient.ListTransactionsResponse
		err      error
	}
	const readers = 4
	start := make(chan struct{})
	ready := make(chan struct{}, readers)
	results := make(chan readResult, readers)
	var workers sync.WaitGroup
	workers.Add(readers)
	for range readers {
		go func() {
			defer workers.Done()
			ready <- struct{}{}
			<-start
			response, requestErr := rest.ListTransactionsWithResponse(context.Background(), params)
			results <- readResult{response: response, err: requestErr}
		}()
	}
	for range readers {
		<-ready
	}
	close(start)
	workers.Wait()
	close(results)

	for result := range results {
		if result.err != nil {
			t.Errorf("concurrent cold reference read request: %v", result.err)
			continue
		}
		if result.response.StatusCode() != http.StatusOK {
			t.Errorf("concurrent cold reference read status = %d, want %d; body %s", result.response.StatusCode(), http.StatusOK, result.response.Body)
			continue
		}
		if !containsTransactionID(result.response.JSON200.Transactions, fixture.TransactionId) {
			t.Errorf("concurrent cold reference read did not include fixture transaction %d", fixture.TransactionId)
		}
	}
}

func TestConcurrentReadsWithReferenceMutation(t *testing.T) {
	client := newSharedClient(t)
	rest := client.REST()
	refs := createTransactionRefs(t, client)
	created := createTransaction(t, client, balancedTransactionRequest(refs))
	filter := `account:"checking:Chase:Primary" and category:"Food:Restaurants" and tag:"Trips:Local" and member:Avery`
	params := &httpclient.ListTransactionsParams{
		Filter: &filter,
	}

	warm, err := rest.ListTransactionsWithResponse(context.Background(), params)
	if err != nil {
		t.Fatalf("warm reference read request: %v", err)
	}
	if warm.StatusCode() != http.StatusOK {
		t.Fatalf("warm reference read status = %d, want %d; body %s", warm.StatusCode(), http.StatusOK, warm.Body)
	}
	assertTransactionIDs(t, warm.JSON200.Transactions, []int64{created.JSON201.TransactionId})

	type readResult struct {
		response *httpclient.ListTransactionsResponse
		err      error
	}
	type updateResult struct {
		response *httpclient.UpdateCategoryResponse
		err      error
	}
	const readers = 3
	start := make(chan struct{})
	ready := make(chan struct{}, readers+1)
	reads := make(chan readResult, readers)
	updated := make(chan updateResult, 1)
	var workers sync.WaitGroup
	workers.Add(readers + 1)
	for range readers {
		go func() {
			defer workers.Done()
			ready <- struct{}{}
			<-start
			response, requestErr := rest.ListTransactionsWithResponse(context.Background(), params)
			reads <- readResult{response: response, err: requestErr}
		}()
	}
	go func() {
		defer workers.Done()
		ready <- struct{}{}
		<-start
		hidden := true
		response, requestErr := rest.UpdateCategoryWithResponse(context.Background(), refs.CategoryId, httpclient.UpdateCategoryRequest{IsHidden: &hidden})
		updated <- updateResult{response: response, err: requestErr}
	}()
	for range readers + 1 {
		<-ready
	}
	close(start)
	workers.Wait()
	close(reads)

	for result := range reads {
		if result.err != nil {
			t.Errorf("concurrent warm reference read request: %v", result.err)
			continue
		}
		if result.response.StatusCode() != http.StatusOK {
			t.Errorf("concurrent warm reference read status = %d, want %d; body %s", result.response.StatusCode(), http.StatusOK, result.response.Body)
			continue
		}
		assertTransactionIDs(t, result.response.JSON200.Transactions, []int64{created.JSON201.TransactionId})
	}
	mutation := <-updated
	if mutation.err != nil {
		t.Fatalf("concurrent category update request: %v", mutation.err)
	}
	if mutation.response.StatusCode() != http.StatusOK {
		t.Fatalf("concurrent category update status = %d, want %d; body %s", mutation.response.StatusCode(), http.StatusOK, mutation.response.Body)
	}

	final, err := rest.GetCategoryWithResponse(context.Background(), refs.CategoryId, nil)
	if err != nil {
		t.Fatalf("get category after concurrent reads request: %v", err)
	}
	if final.StatusCode() != http.StatusOK {
		t.Fatalf("get category after concurrent reads status = %d, want %d; body %s", final.StatusCode(), http.StatusOK, final.Body)
	}
	if !final.JSON200.IsHidden {
		t.Fatal("category after concurrent reads is_hidden = false, want true")
	}
}

func TestConcurrentDependentCreationAndReferenceDeletion(t *testing.T) {
	client := newSharedClient(t)
	rest := client.REST()
	refs := createTransactionRefs(t, client)
	request := balancedTransactionRequest(refs)

	type createResult struct {
		response *httpclient.CreateTransactionResponse
		err      error
	}
	type deleteResult struct {
		response *httpclient.DeleteMemberResponse
		err      error
	}
	start := make(chan struct{})
	ready := make(chan struct{}, 2)
	created := make(chan createResult, 1)
	deleted := make(chan deleteResult, 1)
	var workers sync.WaitGroup
	workers.Add(2)
	go func() {
		defer workers.Done()
		ready <- struct{}{}
		<-start
		response, requestErr := rest.CreateTransactionWithResponse(context.Background(), request)
		created <- createResult{response: response, err: requestErr}
	}()
	go func() {
		defer workers.Done()
		ready <- struct{}{}
		<-start
		response, requestErr := rest.DeleteMemberWithResponse(context.Background(), refs.MemberId)
		deleted <- deleteResult{response: response, err: requestErr}
	}()
	<-ready
	<-ready
	close(start)
	workers.Wait()

	creation := <-created
	deletion := <-deleted
	if creation.err != nil {
		t.Fatalf("concurrent dependent create request: %v", creation.err)
	}
	if deletion.err != nil {
		t.Fatalf("concurrent reference delete request: %v", deletion.err)
	}

	createStatus := creation.response.StatusCode()
	deleteStatus := deletion.response.StatusCode()
	creationWon := createStatus == http.StatusCreated && deleteStatus == http.StatusConflict
	deletionWon := createStatus == http.StatusBadRequest && deleteStatus == http.StatusNoContent
	if !creationWon && !deletionWon {
		t.Fatalf("concurrent create/delete statuses = (%d, %d), want (%d, %d) or (%d, %d); create body %s; delete body %s",
			createStatus,
			deleteStatus,
			http.StatusCreated,
			http.StatusConflict,
			http.StatusBadRequest,
			http.StatusNoContent,
			creation.response.Body,
			deletion.response.Body,
		)
	}

	final, err := rest.ListTransactionsWithResponse(context.Background(), nil)
	if err != nil {
		t.Fatalf("list transactions after concurrent create/delete request: %v", err)
	}
	if final.StatusCode() != http.StatusOK {
		t.Fatalf("list transactions after concurrent create/delete status = %d, want %d; body %s", final.StatusCode(), http.StatusOK, final.Body)
	}
	if creationWon {
		assertTransactionIDs(t, final.JSON200.Transactions, []int64{creation.response.JSON201.TransactionId})
		return
	}
	assertTransactionIDs(t, final.JSON200.Transactions, nil)
}

func assertDependentMutationDeletionRace(
	t *testing.T,
	mutationSuccess int,
	mutationFailure int,
	mutate func(httpclient.RequestEditorFn) concurrentHTTPResult,
	remove func(httpclient.RequestEditorFn) concurrentHTTPResult,
	assertFinal func(bool),
) {
	t.Helper()
	results := apptest.RunConcurrentRequests(t, mutate, remove)
	for _, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent dependent mutation/reference deletion request: %v", result.err)
		}
		if result.status == http.StatusInternalServerError {
			t.Fatalf("concurrent dependent mutation/reference deletion returned internal error: %s", result.body)
		}
	}
	mutationWon := results[0].status == mutationSuccess && results[1].status == http.StatusConflict
	deletionWon := results[0].status == mutationFailure && results[1].status == http.StatusNoContent
	if !mutationWon && !deletionWon {
		t.Fatalf("concurrent mutation/delete statuses = (%d, %d), want (%d, %d) or (%d, %d); bodies = %s | %s",
			results[0].status, results[1].status,
			mutationSuccess, http.StatusConflict,
			mutationFailure, http.StatusNoContent,
			results[0].body, results[1].body,
		)
	}
	assertFinal(mutationWon)
}

func TestConcurrentDependentMutationsAndReferenceDeletion(t *testing.T) {
	t.Run("credit limit and account", func(t *testing.T) {
		client := newSharedClient(t)
		account := client.Scenario().AccountWithCurrency("credit:ConcurrentReference", "USD")
		mutate := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
				CreditLimit: "1000.00000000", EffectiveDate: apptest.Date("2026-08-18"),
			}, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		remove := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().DeleteAccountWithResponse(context.Background(), account.AccountId, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		assertDependentMutationDeletionRace(t, http.StatusCreated, http.StatusNotFound, mutate, remove, func(mutationWon bool) {
			response, err := client.REST().GetAccountWithResponse(context.Background(), account.AccountId, nil)
			want := http.StatusNotFound
			if mutationWon {
				want = http.StatusOK
			}
			requireClientResponse(t, "get account after credit-limit race", err, response.StatusCode(), want, response.Body)
		})
	})

	t.Run("transaction replacement and member", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createTransactionRefs(t, client)
		created := createTransaction(t, client, balancedTransactionRequest(refs)).JSON201
		target := client.Scenario().Member("Concurrent replacement member")
		body := balancedTransactionRequest(refs)
		body.Records[0].MemberId = &target.MemberId
		update := httpclient.UpdateTransactionRequest{
			InitiatedDate: body.InitiatedDate,
			Records: []httpclient.UpdateTransactionRequest_Records_Item{
				apptest.ExistingTransactionRecord(created.Records[0].RecordId, body.Records[0]),
				apptest.ExistingTransactionRecord(created.Records[1].RecordId, body.Records[1]),
			},
		}
		mutate := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().ReplaceTransactionWithResponse(context.Background(), created.TransactionId, &httpclient.ReplaceTransactionParams{IfMatch: created.Etag}, update, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		remove := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().DeleteMemberWithResponse(context.Background(), target.MemberId, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		assertDependentMutationDeletionRace(t, http.StatusOK, http.StatusBadRequest, mutate, remove, func(mutationWon bool) {
			final := getTransaction(t, client, created.TransactionId).JSON200
			got := final.Records[0].MemberId
			if mutationWon && (got == nil || *got != target.MemberId) {
				t.Fatalf("replacement winner member_id = %v, want %d", got, target.MemberId)
			}
			if !mutationWon && (got == nil || *got != refs.MemberId) {
				t.Fatalf("deletion winner member_id = %v, want original %d", got, refs.MemberId)
			}
		})
	})

	t.Run("bulk category and category", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createTransactionRefs(t, client)
		created := createTransaction(t, client, balancedTransactionRequest(refs)).JSON201
		target := client.Scenario().Category("Concurrent:BulkCategory")
		mutate := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().BulkCategorizeJournalRecordsWithResponse(context.Background(), httpclient.BulkCategorizeRecordsRequest{RecordIds: []int64{created.Records[1].RecordId}, CategoryId: target.CategoryId}, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		remove := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().DeleteCategoryWithResponse(context.Background(), target.CategoryId, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		assertDependentMutationDeletionRace(t, http.StatusOK, http.StatusBadRequest, mutate, remove, func(mutationWon bool) {
			got := getTransaction(t, client, created.TransactionId).JSON200.Records[1].CategoryId
			want := refs.CategoryId
			if mutationWon {
				want = target.CategoryId
			}
			if got == nil || *got != want {
				t.Fatalf("category race final category_id = %v, want %d", got, want)
			}
		})
	})

	t.Run("bulk tags and tag", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createTransactionRefs(t, client)
		created := createTransaction(t, client, balancedTransactionRequest(refs)).JSON201
		target := client.Scenario().Tag("Concurrent:BulkTag")
		mutate := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().BulkUpdateJournalRecordTagsWithResponse(context.Background(), httpclient.BulkTagRecordsRequest{RecordIds: []int64{created.Records[0].RecordId}, AddTagIds: apptest.Int64SlicePtr(target.TagId)}, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		remove := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().DeleteTagWithResponse(context.Background(), target.TagId, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		assertDependentMutationDeletionRace(t, http.StatusOK, http.StatusBadRequest, mutate, remove, func(mutationWon bool) {
			tags := getTransaction(t, client, created.TransactionId).JSON200.Records[0].TagIds
			found := false
			for _, id := range tags {
				found = found || id == target.TagId
			}
			if found != mutationWon {
				t.Fatalf("tag race target presence = %v, want %v; tags = %v", found, mutationWon, tags)
			}
		})
	})

	t.Run("bulk member and member", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createTransactionRefs(t, client)
		created := createTransaction(t, client, balancedTransactionRequest(refs)).JSON201
		target := client.Scenario().Member("Concurrent bulk member")
		mutate := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().BulkSetJournalRecordMemberWithResponse(context.Background(), httpclient.BulkSetRecordMemberRequest{RecordIds: []int64{created.Records[0].RecordId}, MemberId: &target.MemberId}, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		remove := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().DeleteMemberWithResponse(context.Background(), target.MemberId, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		assertDependentMutationDeletionRace(t, http.StatusOK, http.StatusBadRequest, mutate, remove, func(mutationWon bool) {
			got := getTransaction(t, client, created.TransactionId).JSON200.Records[0].MemberId
			want := refs.MemberId
			if mutationWon {
				want = target.MemberId
			}
			if got == nil || *got != want {
				t.Fatalf("member race final member_id = %v, want %d", got, want)
			}
		})
	})

	t.Run("bulk account and account", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createTransactionRefs(t, client)
		created := createTransaction(t, client, balancedTransactionRequest(refs)).JSON201
		target := client.Scenario().Account("merchant:ConcurrentBulkAccount")
		mutate := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{RecordIds: []int64{created.Records[1].RecordId}, AccountId: target.AccountId}, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		remove := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().DeleteAccountWithResponse(context.Background(), target.AccountId, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		assertDependentMutationDeletionRace(t, http.StatusOK, http.StatusBadRequest, mutate, remove, func(mutationWon bool) {
			got := getTransaction(t, client, created.TransactionId).JSON200.Records[1].AccountId
			want := refs.MerchantAccountId
			if mutationWon {
				want = target.AccountId
			}
			if got != want {
				t.Fatalf("account race final account_id = %d, want %d", got, want)
			}
		})
	})
}

func TestConcurrentBulkMutationsOfOneTransactionAvoidInternalErrors(t *testing.T) {
	client := apptest.New(t)
	refs := createSearchRefs(t, client)
	request := httpclient.CreateTransactionRequest{InitiatedDate: apptest.Date("2026-08-19")}
	for range 20 {
		request.Records = append(request.Records,
			httpclient.CreateJournalRecordRequest{
				AccountId: refs.CheckingAccountId, Currency: "USD", Amount: "-1.00000000", AmountUsd: apptest.StringPtr("-1.00000000"),
				Settlement: &httpclient.SettlementIntent{Status: httpclient.SettlementStatusPending}, ReconciliationStatus: httpclient.Unreconciled, Source: httpclient.WritableSourceManual,
			},
			httpclient.CreateJournalRecordRequest{
				AccountId: refs.MerchantAccountId, Currency: "USD", Amount: "1.00000000", AmountUsd: apptest.StringPtr("1.00000000"), CategoryId: &refs.CategoryId,
				ReconciliationStatus: httpclient.Unreconciled, Source: httpclient.WritableSourceManual,
			},
		)
	}
	created := createTransaction(t, client, request).JSON201

	requests := make([]func(httpclient.RequestEditorFn) concurrentHTTPResult, 0, len(created.Records)/2)
	for pairIndex := range len(created.Records) / 2 {
		recordID := created.Records[pairIndex*2].RecordId
		switch pairIndex % 3 {
		case 0:
			requests = append(requests, func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
				response, err := client.REST().BulkReassignJournalRecordAccountWithResponse(context.Background(), httpclient.BulkReassignRecordsAccountRequest{RecordIds: []int64{recordID}, AccountId: refs.SavingsAccountId}, editor)
				if err != nil {
					return concurrentHTTPResult{err: err}
				}
				return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
			})
		case 1:
			requests = append(requests, func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
				response, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{RecordIds: []int64{recordID}, Settlement: httpclient.SettlementStatusPosted}, editor)
				if err != nil {
					return concurrentHTTPResult{err: err}
				}
				return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
			})
		case 2:
			requests = append(requests, func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
				response, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{RecordIds: []int64{recordID}, ReconciliationStatus: httpclient.Reconciled}, editor)
				if err != nil {
					return concurrentHTTPResult{err: err}
				}
				return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
			})
		}
	}

	statuses := map[int]int{}
	for _, result := range apptest.RunConcurrentRequests(t, requests...) {
		if result.err != nil {
			t.Fatalf("concurrent bulk mutation request: %v", result.err)
		}
		statuses[result.status]++
		if result.status != http.StatusOK && result.status != http.StatusConflict {
			t.Fatalf("concurrent bulk mutation status = %d, want 200 or 409; body %s", result.status, result.body)
		}
	}
	if statuses[http.StatusOK] == 0 {
		t.Fatalf("concurrent bulk mutation statuses = %+v, want at least one success", statuses)
	}
	if statuses[http.StatusConflict] == 0 {
		t.Fatalf("concurrent bulk mutation statuses = %+v, want at least one conflict", statuses)
	}
}

func TestConcurrentBulkAccountReplacementConflictRollsBackSelection(t *testing.T) {
	client := apptest.New(t)
	scenario := client.Scenario()
	source := scenario.AccountWithCurrency("checking:ConcurrentAccountReplace:Source", "USD")
	replacement := scenario.AccountWithType("people:ConcurrentAccountReplace:Replacement", httpclient.WritableAccountTypeParty)
	merchant := scenario.Account("merchant:ConcurrentAccountReplace")
	category := scenario.Category("ConcurrentAccountReplace:Expense")

	const (
		maxAttempts      = 5
		transactionCount = 20
	)
	for range maxAttempts {
		transactionIDs := make([]int64, 0, transactionCount)
		sourceRecordIDs := make([]int64, 0, transactionCount)
		for range transactionCount {
			created := createTransaction(t, client, classificationRequest(
				semanticRecord(source.AccountId, "-1.00", "USD", nil),
				semanticRecord(merchant.AccountId, "1.00", "USD", &category.CategoryId),
			)).JSON201
			transactionIDs = append(transactionIDs, created.TransactionId)
			sourceRecordIDs = append(sourceRecordIDs, created.Records[0].RecordId)
		}

		requests := make([]func(httpclient.RequestEditorFn) concurrentHTTPResult, 0, transactionCount+1)
		requests = append(requests, func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().BulkReplaceTransactionAccountWithResponse(context.Background(), httpclient.BulkReplaceTransactionAccountRequest{
				TransactionIds:       transactionIDs,
				SourceAccountId:      source.AccountId,
				ReplacementAccountId: replacement.AccountId,
			}, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		})
		for _, recordID := range sourceRecordIDs {
			requests = append(requests, func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
				response, err := client.REST().BulkSetJournalRecordReconciliationWithResponse(context.Background(), httpclient.BulkSetRecordReconciliationRequest{
					RecordIds:            []int64{recordID},
					ReconciliationStatus: httpclient.Unreconciled,
				}, editor)
				if err != nil {
					return concurrentHTTPResult{err: err}
				}
				return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
			})
		}

		results := apptest.RunConcurrentRequests(t, requests...)
		if results[0].err != nil {
			t.Fatalf("concurrent account replacement request: %v", results[0].err)
		}
		if results[0].status != http.StatusOK && results[0].status != http.StatusConflict {
			t.Fatalf("concurrent account replacement status = %d, want 200 or 409; body %s", results[0].status, results[0].body)
		}
		competingMutationSucceeded := false
		for _, result := range results[1:] {
			if result.err != nil {
				t.Fatalf("concurrent reconciliation request: %v", result.err)
			}
			if result.status != http.StatusOK && result.status != http.StatusConflict {
				t.Fatalf("concurrent reconciliation status = %d, want 200 or 409; body %s", result.status, result.body)
			}
			competingMutationSucceeded = competingMutationSucceeded || result.status == http.StatusOK
		}
		if results[0].status == http.StatusOK {
			continue
		}
		if !competingMutationSucceeded {
			t.Fatal("conflicting account replacement had no committed competing mutation")
		}
		for _, transactionID := range transactionIDs {
			transaction := getTransaction(t, client, transactionID).JSON200
			if transaction.Records[0].AccountId != source.AccountId {
				t.Fatalf("transaction %d source account = %d after conflict, want %d", transactionID, transaction.Records[0].AccountId, source.AccountId)
			}
		}
		return
	}
	t.Fatalf("account replacement committed before competing mutations in all %d attempts", maxAttempts)
}

func TestConcurrentDuplicateCreditLimitCreation(t *testing.T) {
	client := apptest.New(t)
	account := client.Scenario().AccountWithCurrency("credit:ConcurrentDuplicate", "USD")
	request := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
		response, err := client.REST().CreateCreditLimitHistoryWithResponse(context.Background(), account.AccountId, httpclient.CreateCreditLimitHistoryRequest{
			CreditLimit: "1000.00000000", EffectiveDate: apptest.Date("2026-08-18"),
		}, editor)
		if err != nil {
			return concurrentHTTPResult{err: err}
		}
		return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
	}

	results := apptest.RunConcurrentRequests(t, request, request)
	statuses := map[int]int{}
	for _, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent duplicate credit-limit request: %v", result.err)
		}
		statuses[result.status]++
	}
	if statuses[http.StatusCreated] != 1 || statuses[http.StatusConflict] != 1 {
		t.Fatalf("concurrent duplicate credit-limit statuses = %+v, want one 201 and one 409; bodies = %s | %s", statuses, results[0].body, results[1].body)
	}
}

func TestConcurrentRecurringDefinitionReplacementAndMaterialization(t *testing.T) {
	client := newSharedClient(t)
	refs := createRecurringDefinitionRefs(t, client, "ConcurrentRecurringReplacement")
	today := civilDateOnly(client.Now())
	definition := createRecurringDefinition(t, client, recurringDefinitionRequest(
		"ConcurrentRecurringReplacement:Weekly",
		refs,
		"-10.00000000",
		"10.00000000",
		intervalRule(1, "WEEK"),
		formatDate(today),
	))
	id := definition.JSON201.RecurringDefinitionId

	materialize := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
		response, err := client.REST().ListRecurringOccurrencesWithResponse(context.Background(), &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &id}, editor)
		if err != nil {
			return concurrentHTTPResult{err: err}
		}
		return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
	}
	replace := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
		response, err := client.REST().ReplaceRecurringDefinitionWithResponse(context.Background(), id, recurringDefinitionRequest(
			"ConcurrentRecurringReplacement:Weekly",
			refs,
			"-20.00000000",
			"20.00000000",
			intervalRule(1, "WEEK"),
			formatDate(today),
		), editor)
		if err != nil {
			return concurrentHTTPResult{err: err}
		}
		return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
	}
	results := apptest.RunConcurrentRequests(t, materialize, replace)
	for _, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent recurring replacement/materialization request: %v", result.err)
		}
		if result.status != http.StatusOK {
			t.Fatalf("concurrent recurring replacement/materialization status = %d, want 200; body %s", result.status, result.body)
		}
	}

	final := listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &id})
	if len(final.JSON200.RecurringOccurrences) != 1 {
		t.Fatalf("recurring replacement/materialization occurrence count = %d, want 1; occurrences = %+v", len(final.JSON200.RecurringOccurrences), final.JSON200.RecurringOccurrences)
	}
	occurrence := final.JSON200.RecurringOccurrences[0]
	transaction := getTransaction(t, client, *occurrence.GeneratedTransactionId)
	switch occurrence.MaterializedDefinitionVersion {
	case 1:
		assertTransactionCheckingAmount(t, transaction.JSON200.Records, refs.CheckingAccountID, "-10.00000000")
	case 2:
		assertTransactionCheckingAmount(t, transaction.JSON200.Records, refs.CheckingAccountID, "-20.00000000")
	default:
		t.Fatalf("materialized definition version = %d, want 1 or 2", occurrence.MaterializedDefinitionVersion)
	}
}

func TestConcurrentRecurringOccurrenceSlotWriters(t *testing.T) {
	t.Run("materialization", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createRecurringDefinitionRefs(t, client, "ConcurrentMaterialization")
		today := civilDateOnly(client.Now())
		definition := createRecurringDefinition(t, client, recurringDefinitionRequest("ConcurrentMaterialization:Daily", refs, "-5.00000000", "5.00000000", intervalRule(1, "DAY"), formatDate(today)))
		id := definition.JSON201.RecurringDefinitionId
		request := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().ListRecurringOccurrencesWithResponse(context.Background(), &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &id}, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		results := apptest.RunConcurrentRequests(t, request, request)
		for _, result := range results {
			if result.err != nil || result.status != http.StatusOK {
				t.Fatalf("concurrent materialization = status %d err %v body %s", result.status, result.err, result.body)
			}
		}
		assertUniqueRecurringSlots(t, listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &id}).JSON200.RecurringOccurrences)
	})

	t.Run("confirm next", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createRecurringDefinitionRefs(t, client, "ConcurrentConfirmNext")
		today := civilDateOnly(client.Now())
		definition := createRecurringDefinition(t, client, recurringDefinitionRequest("ConcurrentConfirmNext:Daily", refs, "-6.00000000", "6.00000000", intervalRule(1, "DAY"), formatDate(today.AddDate(0, 0, 1))))
		id := definition.JSON201.RecurringDefinitionId
		request := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().ConfirmNextRecurringDefinitionWithResponse(context.Background(), id, *apptest.PostedSettlement(), editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		results := apptest.RunConcurrentRequests(t, request, request)
		for _, result := range results {
			if result.err != nil || result.status != http.StatusOK {
				t.Fatalf("concurrent confirm-next = status %d err %v body %s", result.status, result.err, result.body)
			}
		}
		assertUniqueRecurringSlots(t, listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &id}).JSON200.RecurringOccurrences)
	})

	t.Run("defer", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createRecurringDefinitionRefs(t, client, "ConcurrentDefer")
		today := civilDateOnly(client.Now())
		definition := createRecurringDefinition(t, client, recurringDefinitionRequest("ConcurrentDefer:Daily", refs, "-7.00000000", "7.00000000", intervalRule(1, "DAY"), formatDate(today.AddDate(0, 0, 1))))
		id := definition.JSON201.RecurringDefinitionId
		request := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().DeferRecurringDefinitionWithResponse(context.Background(), id, httpclient.RecurringDefinitionDeferRequest{}, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		assertRecurringWriterResults(t, apptest.RunConcurrentRequests(t, request, request), "defer")
		assertUniqueRecurringSlots(t, listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &id}).JSON200.RecurringOccurrences)
	})

	t.Run("resume", func(t *testing.T) {
		client := newSharedClient(t)
		refs := createRecurringDefinitionRefs(t, client, "ConcurrentResume")
		today := civilDateOnly(client.Now())
		definition := createRecurringDefinition(t, client, recurringDefinitionRequest("ConcurrentResume:Monthly", refs, "-8.00000000", "8.00000000", dayOfMonthRule(today.Day()), formatDate(today)))
		id := definition.JSON201.RecurringDefinitionId
		pauseRecurringDefinition(t, client, id)
		client.SetTime(today.AddDate(0, 1, 0))
		request := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
			response, err := client.REST().ResumeRecurringDefinitionWithResponse(context.Background(), id, editor)
			if err != nil {
				return concurrentHTTPResult{err: err}
			}
			return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
		}
		assertRecurringWriterResults(t, apptest.RunConcurrentRequests(t, request, request), "resume")
		assertUniqueRecurringSlots(t, listRecurringOccurrences(t, client, &httpclient.ListRecurringOccurrencesParams{RecurringDefinitionId: &id}).JSON200.RecurringOccurrences)
	})
}

func assertRecurringWriterResults(t *testing.T, results []concurrentHTTPResult, operation string) {
	t.Helper()
	successes := 0
	for _, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent recurring %s request: %v", operation, result.err)
		}
		if result.status == http.StatusOK {
			successes++
			continue
		}
		if result.status != http.StatusConflict {
			t.Fatalf("concurrent recurring %s status = %d, want 200 or 409; body %s", operation, result.status, result.body)
		}
	}
	if successes == 0 {
		t.Fatalf("concurrent recurring %s had no successful writer", operation)
	}
}

func assertUniqueRecurringSlots(t *testing.T, occurrences []httpclient.RecurringOccurrence) {
	t.Helper()
	if len(occurrences) == 0 {
		t.Fatal("recurring occurrence slots are empty, want at least one persisted slot")
	}
	dates := map[string]struct{}{}
	transactions := map[int64]struct{}{}
	for _, occurrence := range occurrences {
		date := occurrence.ScheduledDate.Format("2006-01-02")
		if _, duplicate := dates[date]; duplicate {
			t.Fatalf("duplicate recurring occurrence slot for %s: %+v", date, occurrences)
		}
		dates[date] = struct{}{}
		if occurrence.GeneratedTransactionId == nil {
			continue
		}
		if _, duplicate := transactions[*occurrence.GeneratedTransactionId]; duplicate {
			t.Fatalf("duplicate generated transaction %d: %+v", *occurrence.GeneratedTransactionId, occurrences)
		}
		transactions[*occurrence.GeneratedTransactionId] = struct{}{}
	}
}

func TestConcurrentTransactionReplacementPrecondition(t *testing.T) {
	client := newSharedClient(t)
	rest := client.REST()
	refs := createTransactionRefs(t, client)
	created := createTransaction(t, client, balancedTransactionRequest(refs))
	current := created.JSON201

	requestForMemo := func(memo string) httpclient.UpdateTransactionRequest {
		body := balancedTransactionRequest(refs)
		body.Records[0].Memo = &memo
		return httpclient.UpdateTransactionRequest{
			InitiatedDate: body.InitiatedDate,
			Records: []httpclient.UpdateTransactionRequest_Records_Item{
				apptest.ExistingTransactionRecord(current.Records[0].RecordId, body.Records[0]),
				apptest.ExistingTransactionRecord(current.Records[1].RecordId, body.Records[1]),
			},
		}
	}
	bodies := []httpclient.UpdateTransactionRequest{requestForMemo("concurrent winner A"), requestForMemo("concurrent winner B")}

	type replaceResult struct {
		response *httpclient.ReplaceTransactionResponse
		err      error
	}
	requestReady := make(chan struct{}, len(bodies))
	releaseRequests := make(chan struct{})
	results := make(chan replaceResult, len(bodies))
	awaitRelease := func(context.Context, *http.Request) error {
		requestReady <- struct{}{}
		<-releaseRequests
		return nil
	}
	for _, body := range bodies {
		go func() {
			response, err := rest.ReplaceTransactionWithResponse(
				context.Background(),
				current.TransactionId,
				&httpclient.ReplaceTransactionParams{IfMatch: current.Etag},
				body,
				awaitRelease,
			)
			results <- replaceResult{response: response, err: err}
		}()
	}
	for range bodies {
		apptest.AwaitSignal(t, requestReady, "concurrent replacement request readiness")
	}
	close(releaseRequests)

	statuses := map[int]int{}
	var winner *httpclient.Transaction
	for range bodies {
		result := apptest.AwaitValue(t, results, "concurrent replacement result")
		if result.err != nil {
			t.Fatalf("concurrent replacement request: %v", result.err)
		}
		statuses[result.response.StatusCode()]++
		if result.response.JSON200 != nil {
			winner = result.response.JSON200
		}
	}
	if statuses[http.StatusOK] != 1 || statuses[http.StatusPreconditionFailed] != 1 {
		t.Fatalf("concurrent replacement statuses = %+v, want one 200 and one 412", statuses)
	}

	final := getTransaction(t, client, current.TransactionId)
	if winner == nil || final.JSON200.Etag != winner.Etag || final.JSON200.Records[0].Memo == nil || *final.JSON200.Records[0].Memo != *winner.Records[0].Memo {
		t.Fatalf("final concurrent replacement = %+v, want committed winner %+v", final.JSON200, winner)
	}
}

func TestConcurrentTransactionCancellationAndPosting(t *testing.T) {
	client := newSharedClient(t)
	refs := createTransactionRefs(t, client)
	request := balancedTransactionRequest(refs)
	request.Records[0].Settlement = apptest.PendingSettlement()
	created := createTransaction(t, client, request)
	transactionID := created.JSON201.TransactionId
	recordID := created.JSON201.Records[0].RecordId

	cancel := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
		response, err := client.REST().CancelTransactionWithResponse(context.Background(), transactionID, editor)
		if err != nil {
			return concurrentHTTPResult{err: err}
		}
		return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
	}
	post := func(editor httpclient.RequestEditorFn) concurrentHTTPResult {
		response, err := client.REST().BulkSetJournalRecordSettlementWithResponse(context.Background(), httpclient.BulkSetRecordSettlementRequest{
			RecordIds: []int64{recordID}, Settlement: httpclient.SettlementStatusPosted,
		}, editor)
		if err != nil {
			return concurrentHTTPResult{err: err}
		}
		return concurrentHTTPResult{status: response.StatusCode(), body: response.Body}
	}
	results := apptest.RunConcurrentRequests(t, cancel, post)
	for _, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent cancellation/posting request: %v", result.err)
		}
		if result.status == http.StatusInternalServerError {
			t.Fatalf("concurrent cancellation/posting returned internal error: %s", result.body)
		}
	}
	statuses := map[int]int{results[0].status: 1}
	statuses[results[1].status]++
	if statuses[http.StatusOK] != 1 || statuses[http.StatusBadRequest]+statuses[http.StatusConflict] != 1 {
		t.Fatalf("concurrent cancellation/posting statuses = %+v, want one 200 and one 400 or 409; bodies = %s | %s", statuses, results[0].body, results[1].body)
	}

	final := getTransaction(t, client, transactionID).JSON200
	legalCancelled := final.LifecycleStatus == httpclient.TransactionLifecycleStatusCancelled && final.Settlement == httpclient.TransactionSettlementPending
	legalPosted := final.LifecycleStatus == httpclient.TransactionLifecycleStatusActive && final.Settlement == httpclient.TransactionSettlementPosted
	if !legalCancelled && !legalPosted {
		t.Fatalf("final cancellation/posting state = lifecycle %q settlement %q, want cancelled/pending or active/posted", final.LifecycleStatus, final.Settlement)
	}
}

func containsTransactionID(transactions []httpclient.Transaction, id int64) bool {
	for _, transaction := range transactions {
		if transaction.TransactionId == id {
			return true
		}
	}
	return false
}
