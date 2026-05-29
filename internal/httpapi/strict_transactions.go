package httpapi

import (
	"context"

	"mina.local/mina/internal/httpapi/openapi"
	"mina.local/mina/internal/services"
	"mina.local/mina/internal/services/transactions"
)

func (s *strictServer) ListTransactions(ctx context.Context, _ openapi.ListTransactionsRequestObject) (openapi.ListTransactionsResponseObject, error) {
	r, err := requestFromStrictContext(ctx)
	if err != nil {
		return nil, err
	}
	if len(r.URL.Query()) != 0 {
		return nil, services.InvalidRequest("unsupported list query parameter")
	}

	transactionList, err := s.deps.Transactions.List(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.ListTransactions200JSONResponse{Transactions: transactionAPIResponses(transactionList)}, nil
}

func (s *strictServer) CreateTransaction(ctx context.Context, request openapi.CreateTransactionRequestObject) (openapi.CreateTransactionResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	transaction, err := s.deps.Transactions.Create(ctx, transactionAPIInput(request.Body.InitiatedDate, request.Body.Records))
	if err != nil {
		return nil, err
	}

	return openapi.CreateTransaction201JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) DeleteTransaction(ctx context.Context, request openapi.DeleteTransactionRequestObject) (openapi.DeleteTransactionResponseObject, error) {
	if err := positivePathID(request.TransactionId, "transaction_id"); err != nil {
		return nil, err
	}
	if err := s.deps.Transactions.Delete(ctx, request.TransactionId); err != nil {
		return nil, err
	}

	return openapi.DeleteTransaction204Response{}, nil
}

func (s *strictServer) GetTransaction(ctx context.Context, request openapi.GetTransactionRequestObject) (openapi.GetTransactionResponseObject, error) {
	if err := positivePathID(request.TransactionId, "transaction_id"); err != nil {
		return nil, err
	}
	transaction, err := s.deps.Transactions.Get(ctx, request.TransactionId)
	if err != nil {
		return nil, err
	}

	return openapi.GetTransaction200JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) ReplaceTransaction(ctx context.Context, request openapi.ReplaceTransactionRequestObject) (openapi.ReplaceTransactionResponseObject, error) {
	if err := positivePathID(request.TransactionId, "transaction_id"); err != nil {
		return nil, err
	}
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	transaction, err := s.deps.Transactions.Replace(ctx, request.TransactionId, transactionAPIInput(request.Body.InitiatedDate, request.Body.Records))
	if err != nil {
		return nil, err
	}

	return openapi.ReplaceTransaction200JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) SearchJournalRecords(ctx context.Context, _ openapi.SearchJournalRecordsRequestObject) (openapi.SearchJournalRecordsResponseObject, error) {
	r, err := requestFromStrictContext(ctx)
	if err != nil {
		return nil, err
	}
	opts, err := parseRecordSearchOptionsForStrict(r, true)
	if err != nil {
		return nil, err
	}
	records, err := s.deps.Transactions.SearchRecords(ctx, opts)
	if err != nil {
		return nil, err
	}

	return openapi.SearchJournalRecords200JSONResponse{Records: journalRecordAPIResponses(records)}, nil
}

func (s *strictServer) SearchAccountJournalRecords(ctx context.Context, request openapi.SearchAccountJournalRecordsRequestObject) (openapi.SearchAccountJournalRecordsResponseObject, error) {
	if err := positivePathID(request.AccountId, "account_id"); err != nil {
		return nil, err
	}
	r, err := requestFromStrictContext(ctx)
	if err != nil {
		return nil, err
	}
	opts, err := parseRecordSearchOptionsForStrict(r, false)
	if err != nil {
		return nil, err
	}
	opts.AccountID = &request.AccountId

	records, err := s.deps.Transactions.SearchRecords(ctx, opts)
	if err != nil {
		return nil, err
	}

	return openapi.SearchAccountJournalRecords200JSONResponse{Records: journalRecordAPIResponses(records)}, nil
}

func (s *strictServer) BulkCategorizeJournalRecords(ctx context.Context, request openapi.BulkCategorizeJournalRecordsRequestObject) (openapi.BulkCategorizeJournalRecordsResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	response, err := s.deps.Transactions.BulkCategorize(ctx, request.Body.RecordIds, request.Body.CategoryId)
	if err != nil {
		return nil, err
	}

	return openapi.BulkCategorizeJournalRecords200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkUpdateJournalRecordTags(ctx context.Context, request openapi.BulkUpdateJournalRecordTagsRequestObject) (openapi.BulkUpdateJournalRecordTagsResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	response, err := s.deps.Transactions.BulkUpdateTags(
		ctx,
		request.Body.RecordIds,
		optionalInt64Slice(request.Body.AddTagIds),
		optionalInt64Slice(request.Body.RemoveTagIds),
	)
	if err != nil {
		return nil, err
	}

	return openapi.BulkUpdateJournalRecordTags200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkReassignJournalRecordAccount(ctx context.Context, request openapi.BulkReassignJournalRecordAccountRequestObject) (openapi.BulkReassignJournalRecordAccountResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	response, err := s.deps.Transactions.BulkReassignAccount(ctx, request.Body.RecordIds, request.Body.AccountId)
	if err != nil {
		return nil, err
	}

	return openapi.BulkReassignJournalRecordAccount200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkUpdateJournalRecordStatuses(ctx context.Context, request openapi.BulkUpdateJournalRecordStatusesRequestObject) (openapi.BulkUpdateJournalRecordStatusesResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	response, err := s.deps.Transactions.BulkUpdateStatuses(
		ctx,
		request.Body.RecordIds,
		transactionAPIPostingStatusPtr(request.Body.PostingStatus),
		transactionAPIReconciliationStatusPtr(request.Body.ReconciliationStatus),
	)
	if err != nil {
		return nil, err
	}

	return openapi.BulkUpdateJournalRecordStatuses200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func transactionAPIInput(initiatedDate string, records []openapi.CreateJournalRecordRequest) transactions.CreateInput {
	return transactions.CreateInput{
		InitiatedDate: initiatedDate,
		Records:       journalRecordAPIInputs(records),
	}
}

func journalRecordAPIInputs(records []openapi.CreateJournalRecordRequest) []transactions.JournalRecordInput {
	inputs := make([]transactions.JournalRecordInput, 0, len(records))
	for _, record := range records {
		inputs = append(inputs, transactions.JournalRecordInput{
			AccountID:            record.AccountId,
			MemberID:             record.MemberId,
			Currency:             record.Currency,
			Amount:               record.Amount,
			AmountUSD:            record.AmountUsd,
			CategoryID:           record.CategoryId,
			TagIDs:               optionalInt64Slice(record.TagIds),
			Memo:                 record.Memo,
			PendingDate:          record.PendingDate,
			PostedDate:           record.PostedDate,
			PostingStatus:        transactions.PostingStatus(record.PostingStatus),
			ReconciliationStatus: transactions.ReconciliationStatus(record.ReconciliationStatus),
			Source:               transactions.Source(record.Source),
			ExternalID:           record.ExternalId,
			ExternalSystem:       record.ExternalSystem,
		})
	}

	return inputs
}

func transactionAPIResponse(transaction transactions.Transaction) openapi.Transaction {
	return openapi.Transaction{
		TransactionId: transaction.ID,
		InitiatedDate: transaction.InitiatedDate,
		CreatedAt:     transaction.CreatedAt,
		TombstonedAt:  transaction.TombstonedAt,
		Records:       journalRecordAPIResponses(transaction.Records),
	}
}

func transactionAPIResponses(transactions []transactions.Transaction) []openapi.Transaction {
	responses := make([]openapi.Transaction, 0, len(transactions))
	for _, transaction := range transactions {
		responses = append(responses, transactionAPIResponse(transaction))
	}

	return responses
}

func journalRecordAPIResponse(record transactions.JournalRecord) openapi.JournalRecord {
	return openapi.JournalRecord{
		RecordId:             record.ID,
		TransactionId:        record.TransactionID,
		AccountId:            record.AccountID,
		MemberId:             record.MemberID,
		Currency:             record.Currency,
		Amount:               record.Amount,
		AmountUsd:            record.AmountUSD,
		CategoryId:           record.CategoryID,
		TagIds:               append([]int64{}, record.TagIDs...),
		Memo:                 record.Memo,
		PendingDate:          record.PendingDate,
		PostedDate:           record.PostedDate,
		PostingStatus:        openapi.PostingStatus(record.PostingStatus),
		ReconciliationStatus: openapi.ReconciliationStatus(record.ReconciliationStatus),
		Source:               openapi.Source(record.Source),
		ExternalId:           record.ExternalID,
		ExternalSystem:       record.ExternalSystem,
		CreatedAt:            record.CreatedAt,
		UpdatedAt:            record.UpdatedAt,
		TombstonedAt:         record.TombstonedAt,
	}
}

func journalRecordAPIResponses(records []transactions.JournalRecord) []openapi.JournalRecord {
	responses := make([]openapi.JournalRecord, 0, len(records))
	for _, record := range records {
		responses = append(responses, journalRecordAPIResponse(record))
	}

	return responses
}

func bulkRecordOperationAPIResponse(response transactions.BulkRecordOperationResponse) openapi.BulkRecordOperationResponse {
	return openapi.BulkRecordOperationResponse{
		RecordIds:    append([]int64{}, response.RecordIDs...),
		UpdatedCount: response.UpdatedCount,
	}
}

func optionalInt64Slice(values *[]int64) []int64 {
	if values == nil {
		return nil
	}

	return append([]int64{}, (*values)...)
}

func transactionAPIPostingStatusPtr(status *openapi.PostingStatus) *transactions.PostingStatus {
	if status == nil {
		return nil
	}
	value := transactions.PostingStatus(*status)

	return &value
}

func transactionAPIReconciliationStatusPtr(status *openapi.ReconciliationStatus) *transactions.ReconciliationStatus {
	if status == nil {
		return nil
	}
	value := transactions.ReconciliationStatus(*status)

	return &value
}
