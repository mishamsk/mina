package runtime_test

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

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

	date := fixture.InitiatedDate
	params := &httpclient.ListTransactionsParams{
		AccountId:         &[]int64{accountID},
		CategoryId:        &[]int64{categoryID},
		TagId:             &[]int64{tagID},
		MemberId:          &[]int64{memberID},
		InitiatedDateFrom: &date,
		InitiatedDateTo:   &date,
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
	params := &httpclient.ListTransactionsParams{
		AccountId:  &[]int64{refs.CheckingAccountId},
		CategoryId: &[]int64{refs.CategoryId},
		TagId:      &[]int64{refs.TagId},
		MemberId:   &[]int64{refs.MemberId},
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

func containsTransactionID(transactions []httpclient.Transaction, id int64) bool {
	for _, transaction := range transactions {
		if transaction.TransactionId == id {
			return true
		}
	}
	return false
}
