package httpapi

import (
	"context"
	"slices"
	"strconv"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services/transactions"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

func (s *strictServer) ListTransactions(ctx context.Context, _ openapi.ListTransactionsRequestObject) (openapi.ListTransactionsResponseObject, error) {
	transactionList, err := s.deps.Transactions.List(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.ListTransactions200JSONResponse{Transactions: transactionAPIResponses(transactionList)}, nil
}

func (s *strictServer) CreateTransaction(ctx context.Context, request openapi.CreateTransactionRequestObject) (openapi.CreateTransactionResponseObject, error) {
	input, err := transactionAPIInput(request.Body.InitiatedDate, request.Body.Records)
	if err != nil {
		return nil, err
	}

	transaction, err := s.deps.Transactions.Create(ctx, input)
	if err != nil {
		return nil, err
	}

	return openapi.CreateTransaction201JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) DeleteTransaction(ctx context.Context, request openapi.DeleteTransactionRequestObject) (openapi.DeleteTransactionResponseObject, error) {
	if err := s.deps.Transactions.Delete(ctx, request.TransactionId); err != nil {
		return nil, err
	}

	return openapi.DeleteTransaction204Response{}, nil
}

func (s *strictServer) GetTransaction(ctx context.Context, request openapi.GetTransactionRequestObject) (openapi.GetTransactionResponseObject, error) {
	transaction, err := s.deps.Transactions.Get(ctx, request.TransactionId)
	if err != nil {
		return nil, err
	}

	return openapi.GetTransaction200JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) ReplaceTransaction(ctx context.Context, request openapi.ReplaceTransactionRequestObject) (openapi.ReplaceTransactionResponseObject, error) {
	input, err := transactionAPIInput(request.Body.InitiatedDate, request.Body.Records)
	if err != nil {
		return nil, err
	}

	transaction, err := s.deps.Transactions.Replace(ctx, request.TransactionId, input)
	if err != nil {
		return nil, err
	}

	return openapi.ReplaceTransaction200JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) SearchJournalRecords(ctx context.Context, request openapi.SearchJournalRecordsRequestObject) (openapi.SearchJournalRecordsResponseObject, error) {
	opts, err := recordSearchOptionsFromParams(request.Params)
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
	opts, err := recordSearchOptionsFromAccountParams(request.Params)
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
	response, err := s.deps.Transactions.BulkCategorize(ctx, request.Body.RecordIds, request.Body.CategoryId)
	if err != nil {
		return nil, err
	}

	return openapi.BulkCategorizeJournalRecords200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkUpdateJournalRecordTags(ctx context.Context, request openapi.BulkUpdateJournalRecordTagsRequestObject) (openapi.BulkUpdateJournalRecordTagsResponseObject, error) {
	response, err := s.deps.Transactions.BulkUpdateTags(
		ctx,
		request.Body.RecordIds,
		cloneOptionalInt64Slice(request.Body.AddTagIds),
		cloneOptionalInt64Slice(request.Body.RemoveTagIds),
	)
	if err != nil {
		return nil, err
	}

	return openapi.BulkUpdateJournalRecordTags200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkReassignJournalRecordAccount(ctx context.Context, request openapi.BulkReassignJournalRecordAccountRequestObject) (openapi.BulkReassignJournalRecordAccountResponseObject, error) {
	response, err := s.deps.Transactions.BulkReassignAccount(ctx, request.Body.RecordIds, request.Body.AccountId)
	if err != nil {
		return nil, err
	}

	return openapi.BulkReassignJournalRecordAccount200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkUpdateJournalRecordStatuses(ctx context.Context, request openapi.BulkUpdateJournalRecordStatusesRequestObject) (openapi.BulkUpdateJournalRecordStatusesResponseObject, error) {
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

func recordSearchOptionsFromParams(params openapi.SearchJournalRecordsParams) (transactions.RecordSearchOptions, error) {
	opts := transactions.RecordSearchOptions{
		AccountID:         params.AccountId,
		CategoryID:        params.CategoryId,
		MemberID:          params.MemberId,
		TagID:             params.TagId,
		InitiatedDateFrom: nullableCivilDateFromOpenAPI(params.InitiatedDateFrom),
		InitiatedDateTo:   nullableCivilDateFromOpenAPI(params.InitiatedDateTo),
		PendingDateFrom:   nullableTimestampFromOpenAPI(params.PendingDateFrom),
		PendingDateTo:     nullableTimestampFromOpenAPI(params.PendingDateTo),
		PostedDateFrom:    nullableTimestampFromOpenAPI(params.PostedDateFrom),
		PostedDateTo:      nullableTimestampFromOpenAPI(params.PostedDateTo),
		MemoContains:      params.MemoContains,
	}
	var err error
	if opts.AmountMin, err = optionalDecimalField("amount_min", params.AmountMin); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if opts.AmountMax, err = optionalDecimalField("amount_max", params.AmountMax); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if opts.AmountUSDMin, err = optionalDecimalField("amount_usd_min", params.AmountUsdMin); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if opts.AmountUSDMax, err = optionalDecimalField("amount_usd_max", params.AmountUsdMax); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	setRecordSearchStatuses(&opts, params.PostingStatus, params.ReconciliationStatus)

	return opts, nil
}

func recordSearchOptionsFromAccountParams(params openapi.SearchAccountJournalRecordsParams) (transactions.RecordSearchOptions, error) {
	opts := transactions.RecordSearchOptions{
		CategoryID:        params.CategoryId,
		MemberID:          params.MemberId,
		TagID:             params.TagId,
		InitiatedDateFrom: nullableCivilDateFromOpenAPI(params.InitiatedDateFrom),
		InitiatedDateTo:   nullableCivilDateFromOpenAPI(params.InitiatedDateTo),
		PendingDateFrom:   nullableTimestampFromOpenAPI(params.PendingDateFrom),
		PendingDateTo:     nullableTimestampFromOpenAPI(params.PendingDateTo),
		PostedDateFrom:    nullableTimestampFromOpenAPI(params.PostedDateFrom),
		PostedDateTo:      nullableTimestampFromOpenAPI(params.PostedDateTo),
		MemoContains:      params.MemoContains,
	}
	var err error
	if opts.AmountMin, err = optionalDecimalField("amount_min", params.AmountMin); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if opts.AmountMax, err = optionalDecimalField("amount_max", params.AmountMax); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if opts.AmountUSDMin, err = optionalDecimalField("amount_usd_min", params.AmountUsdMin); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	if opts.AmountUSDMax, err = optionalDecimalField("amount_usd_max", params.AmountUsdMax); err != nil {
		return transactions.RecordSearchOptions{}, err
	}
	setRecordSearchStatuses(&opts, params.PostingStatus, params.ReconciliationStatus)

	return opts, nil
}

func setRecordSearchStatuses(
	opts *transactions.RecordSearchOptions,
	postingStatus *openapi.PostingStatus,
	reconciliationStatus *openapi.ReconciliationStatus,
) {
	if postingStatus != nil {
		value := transactions.PostingStatus(*postingStatus)
		opts.PostingStatus = &value
	}
	if reconciliationStatus != nil {
		value := transactions.ReconciliationStatus(*reconciliationStatus)
		opts.ReconciliationStatus = &value
	}
}

func transactionAPIInput(initiatedDate openapi_types.Date, records []openapi.CreateJournalRecordRequest) (transactions.CreateInput, error) {
	recordInputs, err := journalRecordAPIInputs(records)
	if err != nil {
		return transactions.CreateInput{}, err
	}

	return transactions.CreateInput{
		InitiatedDate: civilDateFromOpenAPI(initiatedDate),
		Records:       recordInputs,
	}, nil
}

func journalRecordAPIInputs(records []openapi.CreateJournalRecordRequest) ([]transactions.JournalRecordInput, error) {
	inputs := make([]transactions.JournalRecordInput, 0, len(records))
	for index, record := range records {
		amount, err := decimalField(recordField(index, "amount"), record.Amount)
		if err != nil {
			return nil, err
		}
		amountUSD, err := decimalField(recordField(index, "amount_usd"), record.AmountUsd)
		if err != nil {
			return nil, err
		}
		inputs = append(inputs, transactions.JournalRecordInput{
			AccountID:            record.AccountId,
			MemberID:             record.MemberId,
			Currency:             record.Currency,
			Amount:               amount,
			AmountUSD:            amountUSD,
			CategoryID:           record.CategoryId,
			TagIDs:               cloneOptionalInt64Slice(record.TagIds),
			Memo:                 record.Memo,
			PendingDate:          nullableTimestampFromOpenAPI(record.PendingDate),
			PostedDate:           nullableTimestampFromOpenAPI(record.PostedDate),
			PostingStatus:        transactions.PostingStatus(record.PostingStatus),
			ReconciliationStatus: transactions.ReconciliationStatus(record.ReconciliationStatus),
			Source:               transactions.Source(record.Source),
			ExternalID:           record.ExternalId,
			ExternalSystem:       record.ExternalSystem,
		})
	}

	return inputs, nil
}

func transactionAPIResponse(transaction transactions.Transaction) openapi.Transaction {
	return openapi.Transaction{
		TransactionId: transaction.ID,
		InitiatedDate: openAPIDate(transaction.InitiatedDate),
		CreatedAt:     transaction.CreatedAt.UTC(),
		TombstonedAt:  nullableTimestampTime(transaction.TombstonedAt),
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
		Amount:               record.Amount.String(),
		AmountUsd:            record.AmountUSD.String(),
		CategoryId:           record.CategoryID,
		TagIds:               cloneInt64Slice(record.TagIDs),
		Memo:                 record.Memo,
		PendingDate:          nullableOpenAPITimestamp(record.PendingDate),
		PostedDate:           nullableOpenAPITimestamp(record.PostedDate),
		PostingStatus:        openapi.PostingStatus(record.PostingStatus),
		ReconciliationStatus: openapi.ReconciliationStatus(record.ReconciliationStatus),
		Source:               openapi.Source(record.Source),
		ExternalId:           record.ExternalID,
		ExternalSystem:       record.ExternalSystem,
		CreatedAt:            record.CreatedAt.UTC(),
		UpdatedAt:            record.UpdatedAt.UTC(),
		TombstonedAt:         nullableTimestampTime(record.TombstonedAt),
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
		RecordIds:    cloneInt64Slice(response.RecordIDs),
		UpdatedCount: response.UpdatedCount,
	}
}

func cloneOptionalInt64Slice(values *[]int64) []int64 {
	if values == nil {
		return nil
	}

	return slices.Clone(*values)
}

func cloneInt64Slice(values []int64) []int64 {
	if values == nil {
		return []int64{}
	}

	return slices.Clone(values)
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

func recordField(index int, name string) string {
	return "records[" + strconv.Itoa(index) + "]." + name
}
