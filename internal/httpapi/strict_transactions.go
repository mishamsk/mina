package httpapi

import (
	"context"
	"slices"
	"strconv"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/values"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

func (s *strictServer) ListTransactions(ctx context.Context, request openapi.ListTransactionsRequestObject) (openapi.ListTransactionsResponseObject, error) {
	sortDirection := request.Params.SortDir
	if sortDirection == nil {
		defaultSortDirection := openapi.ListTransactionsParamsSortDirDesc
		sortDirection = &defaultSortDirection
	}
	listOptions := listOptionsFromParams(
		request.Params.Sort,
		sortDirection,
		request.Params.Limit,
		request.Params.Offset,
		services.SortKeyInitiatedDate,
	)

	transactionList, err := s.deps.Transactions.List(ctx, transactions.ListOptions{
		ListOptions:        listOptions,
		AnchorDate:         nullableCivilDateFromOpenAPI(request.Params.AnchorDate),
		OffsetSpecified:    request.Params.Offset != nil,
		AccountIDs:         cloneOptionalInt64Slice(request.Params.AccountId),
		CategoryIDs:        cloneOptionalInt64Slice(request.Params.CategoryId),
		CategoryFQNPrefix:  request.Params.CategoryFqnPrefix,
		TagIDs:             cloneOptionalInt64Slice(request.Params.TagId),
		TagFQNPrefix:       request.Params.TagFqnPrefix,
		MemberIDs:          cloneOptionalInt64Slice(request.Params.MemberId),
		Currencies:         cloneOptionalStringSlice(request.Params.Currency),
		LifecycleStatuses:  transactionAPILifecycleStatusSlice(request.Params.LifecycleStatus),
		Settlements:        transactionAPISettlementSummarySlice(request.Params.Settlement),
		TransactionClasses: transactionAPIClassSlice(request.Params.TransactionClass),
		TransactionShapes:  transactionAPIShapeSlice(request.Params.TransactionShape),
		RecordRoles:        transactionAPIRoleSlice(request.Params.RecordRole),
		AmountMinText:      request.Params.AmountMin,
		AmountMaxText:      request.Params.AmountMax,
		AmountUSDMinText:   request.Params.AmountUsdMin,
		AmountUSDMaxText:   request.Params.AmountUsdMax,
		InitiatedDateFrom:  nullableCivilDateFromOpenAPI(request.Params.InitiatedDateFrom),
		InitiatedDateTo:    nullableCivilDateFromOpenAPI(request.Params.InitiatedDateTo),
		PendingDateFrom:    nullableTimestampFromOpenAPI(request.Params.PendingDateFrom),
		PendingDateTo:      nullableTimestampFromOpenAPI(request.Params.PendingDateTo),
		PostedDateFrom:     nullableTimestampFromOpenAPI(request.Params.PostedDateFrom),
		PostedDateTo:       nullableTimestampFromOpenAPI(request.Params.PostedDateTo),
		Search:             request.Params.Search,
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListTransactions200JSONResponse{
		Transactions: transactionAPIResponses(transactionList.Items),
		Offset:       transactionList.Offset,
		TotalCount:   transactionList.TotalCount,
	}, nil
}

func (s *strictServer) ClassifyTransaction(ctx context.Context, request openapi.ClassifyTransactionRequestObject) (openapi.ClassifyTransactionResponseObject, error) {
	records, err := classificationRecordAPIInputs(request.Body.Records)
	if err != nil {
		return nil, err
	}
	classification, err := s.deps.Transactions.Classify(ctx, records)
	if err != nil {
		return nil, err
	}
	classifiedRecords := make([]openapi.ClassifiedRecord, 0, len(classification.Roles))
	for index, role := range classification.Roles {
		classifiedRecords = append(classifiedRecords, openapi.ClassifiedRecord{
			RecordIndex: index,
			RecordRole:  openapi.RecordRole(role),
		})
	}
	return openapi.ClassifyTransaction200JSONResponse{
		TransactionClass: openapi.TransactionClass(classification.Class),
		PrimaryAmounts:   displayAmountAPIResponses(classification.PrimaryAmounts),
		Shapes:           transactionShapeAPIResponses(classification.Shapes),
		Records:          classifiedRecords,
	}, nil
}

func classificationRecordAPIInputs(records []openapi.ClassifyJournalRecordRequest) ([]transactions.ClassificationRecordInput, error) {
	inputs := make([]transactions.ClassificationRecordInput, 0, len(records))
	for index, record := range records {
		amount, err := decimalField(recordField(index, "amount"), record.Amount)
		if err != nil {
			return nil, err
		}
		inputs = append(inputs, transactions.ClassificationRecordInput{
			AccountID:  record.AccountId,
			Currency:   record.Currency,
			Amount:     amount,
			CategoryID: record.CategoryId,
		})
	}
	return inputs, nil
}

func (s *strictServer) CreateExchangeTransaction(ctx context.Context, request openapi.CreateExchangeTransactionRequestObject) (openapi.CreateExchangeTransactionResponseObject, error) {
	soldAmount, err := decimalField("sold_amount", request.Body.SoldAmount)
	if err != nil {
		return nil, err
	}
	boughtAmount, err := decimalField("bought_amount", request.Body.BoughtAmount)
	if err != nil {
		return nil, err
	}
	transaction, err := s.deps.Transactions.CreateExchange(ctx, transactions.ExchangeInput{
		InitiatedDate:        civilDateFromOpenAPI(request.Body.InitiatedDate),
		SoldAccountID:        request.Body.SoldAccountId,
		BoughtAccountID:      request.Body.BoughtAccountId,
		SoldCurrency:         request.Body.SoldCurrency,
		BoughtCurrency:       request.Body.BoughtCurrency,
		SoldAmount:           soldAmount,
		BoughtAmount:         boughtAmount,
		MemberID:             request.Body.MemberId,
		TagIDs:               cloneOptionalInt64Slice(request.Body.TagIds),
		Memo:                 request.Body.Memo,
		Settlement:           transactionAPISettlementIntentPtr(request.Body.Settlement),
		ReconciliationStatus: transactionAPIReconciliationStatusPtr(request.Body.ReconciliationStatus),
	})
	if err != nil {
		return nil, err
	}
	return openapi.CreateExchangeTransaction201JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) GetTransactionMonthTotals(ctx context.Context, request openapi.GetTransactionMonthTotalsRequestObject) (openapi.GetTransactionMonthTotalsResponseObject, error) {
	totals, err := s.deps.Transactions.MonthTotals(ctx, request.Params.Month)
	if err != nil {
		return nil, err
	}

	return openapi.GetTransactionMonthTotals200JSONResponse(transactionMonthTotalsAPIResponse(totals)), nil
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

func (s *strictServer) CreateSpendTransaction(ctx context.Context, request openapi.CreateSpendTransactionRequestObject) (openapi.CreateSpendTransactionResponseObject, error) {
	fields, err := shorthandCreateFields(
		request.Body.InitiatedDate,
		request.Body.Currency,
		request.Body.Amount,
		request.Body.MemberId,
		request.Body.TagIds,
		request.Body.Memo,
		request.Body.Settlement,
		request.Body.ReconciliationStatus,
	)
	if err != nil {
		return nil, err
	}

	transaction, err := s.deps.Transactions.CreateSpend(ctx, transactions.SpendInput{
		ShorthandCreateFields: fields,
		FundingAccountID:      request.Body.FundingAccountId,
		CounterpartyAccountID: request.Body.CounterpartyAccountId,
		ExpenseCategoryID:     request.Body.CategoryId,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateSpendTransaction201JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) CreateIncomeTransaction(ctx context.Context, request openapi.CreateIncomeTransactionRequestObject) (openapi.CreateIncomeTransactionResponseObject, error) {
	fields, err := shorthandCreateFields(
		request.Body.InitiatedDate,
		request.Body.Currency,
		request.Body.Amount,
		request.Body.MemberId,
		request.Body.TagIds,
		request.Body.Memo,
		request.Body.Settlement,
		request.Body.ReconciliationStatus,
	)
	if err != nil {
		return nil, err
	}

	transaction, err := s.deps.Transactions.CreateIncome(ctx, transactions.IncomeInput{
		ShorthandCreateFields: fields,
		DestinationAccountID:  request.Body.DestinationAccountId,
		SourceAccountID:       request.Body.SourceAccountId,
		IncomeCategoryID:      request.Body.CategoryId,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateIncomeTransaction201JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) CreateRefundTransaction(ctx context.Context, request openapi.CreateRefundTransactionRequestObject) (openapi.CreateRefundTransactionResponseObject, error) {
	fields, err := shorthandCreateFields(
		request.Body.InitiatedDate,
		request.Body.Currency,
		request.Body.Amount,
		request.Body.MemberId,
		request.Body.TagIds,
		request.Body.Memo,
		request.Body.Settlement,
		request.Body.ReconciliationStatus,
	)
	if err != nil {
		return nil, err
	}

	transaction, err := s.deps.Transactions.CreateRefund(ctx, transactions.RefundInput{
		ShorthandCreateFields: fields,
		DestinationAccountID:  request.Body.DestinationAccountId,
		CounterpartyAccountID: request.Body.CounterpartyAccountId,
		RefundCategoryID:      request.Body.CategoryId,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateRefundTransaction201JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) CreateTransferTransaction(ctx context.Context, request openapi.CreateTransferTransactionRequestObject) (openapi.CreateTransferTransactionResponseObject, error) {
	fields, err := shorthandCreateFields(
		request.Body.InitiatedDate,
		request.Body.Currency,
		request.Body.Amount,
		request.Body.MemberId,
		request.Body.TagIds,
		request.Body.Memo,
		request.Body.Settlement,
		request.Body.ReconciliationStatus,
	)
	if err != nil {
		return nil, err
	}

	transaction, err := s.deps.Transactions.CreateTransfer(ctx, transactions.TransferInput{
		ShorthandCreateFields: fields,
		SourceAccountID:       request.Body.SourceAccountId,
		DestinationAccountID:  request.Body.DestinationAccountId,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateTransferTransaction201JSONResponse(transactionAPIResponse(transaction)), nil
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

func (s *strictServer) CancelTransaction(ctx context.Context, request openapi.CancelTransactionRequestObject) (openapi.CancelTransactionResponseObject, error) {
	transaction, err := s.deps.Transactions.Cancel(ctx, request.TransactionId)
	if err != nil {
		return nil, err
	}

	return openapi.CancelTransaction200JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) RestoreTransaction(ctx context.Context, request openapi.RestoreTransactionRequestObject) (openapi.RestoreTransactionResponseObject, error) {
	transaction, err := s.deps.Transactions.Restore(ctx, request.TransactionId)
	if err != nil {
		return nil, err
	}
	return openapi.RestoreTransaction200JSONResponse(transactionAPIResponse(transaction)), nil
}

func (s *strictServer) ReplaceTransaction(ctx context.Context, request openapi.ReplaceTransactionRequestObject) (openapi.ReplaceTransactionResponseObject, error) {
	records, err := updateJournalRecordAPIInputs(request.Body.Records)
	if err != nil {
		return nil, err
	}
	input := transactions.UpdateInput{
		InitiatedDate: civilDateFromOpenAPI(request.Body.InitiatedDate),
		ExpectedETag:  request.Params.IfMatch,
		Records:       records,
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

	return openapi.SearchJournalRecords200JSONResponse{
		Records:    journalRecordAPIResponses(records.Items),
		TotalCount: records.TotalCount,
	}, nil
}

func (s *strictServer) SearchAccountJournalRecords(ctx context.Context, request openapi.SearchAccountJournalRecordsRequestObject) (openapi.SearchAccountJournalRecordsResponseObject, error) {
	opts, err := recordSearchOptionsFromAccountParams(request.Params)
	if err != nil {
		return nil, err
	}

	records, err := s.deps.Transactions.SearchAccountRecords(ctx, request.AccountId, opts)
	if err != nil {
		return nil, err
	}
	responses := journalRecordAPIResponses(records.Items)

	if boolParam(request.Params.IncludeRunningBalance) && len(records.Items) > 0 {
		currentLimits, err := s.deps.CreditLimits.CurrentByAccounts(
			ctx,
			[]int64{request.AccountId},
		)
		if err != nil {
			return nil, err
		}
		if currentLimit, ok := currentLimits[request.AccountId]; ok {
			if err := addRemainingCreditToJournalRecordAPIResponses(
				records.Items,
				responses,
				currentLimit,
			); err != nil {
				return nil, err
			}
		}
	}

	return openapi.SearchAccountJournalRecords200JSONResponse{
		Records:    responses,
		TotalCount: records.TotalCount,
	}, nil
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

func (s *strictServer) BulkSetJournalRecordMember(ctx context.Context, request openapi.BulkSetJournalRecordMemberRequestObject) (openapi.BulkSetJournalRecordMemberResponseObject, error) {
	response, err := s.deps.Transactions.BulkSetMember(ctx, request.Body.RecordIds, request.Body.MemberId)
	if err != nil {
		return nil, err
	}
	return openapi.BulkSetJournalRecordMember200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkReassignJournalRecordAccount(ctx context.Context, request openapi.BulkReassignJournalRecordAccountRequestObject) (openapi.BulkReassignJournalRecordAccountResponseObject, error) {
	response, err := s.deps.Transactions.BulkReassignAccount(ctx, request.Body.RecordIds, request.Body.AccountId, transactionAPISettlementIntentPtr(request.Body.Settlement))
	if err != nil {
		return nil, err
	}

	return openapi.BulkReassignJournalRecordAccount200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkReplaceTransactionAccount(ctx context.Context, request openapi.BulkReplaceTransactionAccountRequestObject) (openapi.BulkReplaceTransactionAccountResponseObject, error) {
	response, err := s.deps.Transactions.BulkReplaceAccount(
		ctx,
		request.Body.TransactionIds,
		request.Body.SourceAccountId,
		request.Body.ReplacementAccountId,
	)
	if err != nil {
		return nil, err
	}

	return openapi.BulkReplaceTransactionAccount200JSONResponse(bulkAccountReplaceAPIResponse(response)), nil
}

func (s *strictServer) BulkSetJournalRecordSettlement(ctx context.Context, request openapi.BulkSetJournalRecordSettlementRequestObject) (openapi.BulkSetJournalRecordSettlementResponseObject, error) {
	response, err := s.deps.Transactions.BulkSetSettlement(ctx, request.Body.RecordIds, transactions.SettlementIntent{
		Status:      transactions.SettlementStatus(request.Body.Settlement),
		PendingDate: nullableTimestampFromOpenAPI(request.Body.PendingDate),
		PostedDate:  nullableTimestampFromOpenAPI(request.Body.PostedDate),
	})
	if err != nil {
		return nil, err
	}
	return openapi.BulkSetJournalRecordSettlement200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func (s *strictServer) BulkSetJournalRecordReconciliation(ctx context.Context, request openapi.BulkSetJournalRecordReconciliationRequestObject) (openapi.BulkSetJournalRecordReconciliationResponseObject, error) {
	response, err := s.deps.Transactions.BulkSetReconciliation(ctx, request.Body.RecordIds, transactions.ReconciliationStatus(request.Body.ReconciliationStatus))
	if err != nil {
		return nil, err
	}
	return openapi.BulkSetJournalRecordReconciliation200JSONResponse(bulkRecordOperationAPIResponse(response)), nil
}

func recordSearchOptionsFromParams(params openapi.SearchJournalRecordsParams) (transactions.RecordSearchOptions, error) {
	opts := transactions.RecordSearchOptions{
		ListOptions: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyInitiatedDate,
		),
		AccountID:         params.AccountId,
		AccountFQNPrefix:  params.AccountFqnPrefix,
		CategoryID:        params.CategoryId,
		MemberID:          params.MemberId,
		TagID:             params.TagId,
		RecordRole:        transactionAPIRolePtr(params.RecordRole),
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
	setRecordSearchStatuses(&opts, params.LifecycleStatus, params.Settlement, params.ReconciliationStatus)

	return opts, nil
}

func recordSearchOptionsFromAccountParams(params openapi.SearchAccountJournalRecordsParams) (transactions.RecordSearchOptions, error) {
	opts := transactions.RecordSearchOptions{
		ListOptions: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyInitiatedDate,
		),
		CategoryID:            params.CategoryId,
		MemberID:              params.MemberId,
		TagID:                 params.TagId,
		InitiatedDateFrom:     nullableCivilDateFromOpenAPI(params.InitiatedDateFrom),
		InitiatedDateTo:       nullableCivilDateFromOpenAPI(params.InitiatedDateTo),
		PendingDateFrom:       nullableTimestampFromOpenAPI(params.PendingDateFrom),
		PendingDateTo:         nullableTimestampFromOpenAPI(params.PendingDateTo),
		PostedDateFrom:        nullableTimestampFromOpenAPI(params.PostedDateFrom),
		PostedDateTo:          nullableTimestampFromOpenAPI(params.PostedDateTo),
		MemoContains:          params.MemoContains,
		IncludeRunningBalance: boolParam(params.IncludeRunningBalance),
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
	setRecordSearchStatuses(&opts, params.LifecycleStatus, params.Settlement, params.ReconciliationStatus)

	return opts, nil
}

func setRecordSearchStatuses(
	opts *transactions.RecordSearchOptions,
	lifecycleStatus *openapi.TransactionLifecycleStatus,
	settlement *openapi.SettlementStatus,
	reconciliationStatus *openapi.ReconciliationStatus,
) {
	if lifecycleStatus != nil {
		value := transactions.LifecycleStatus(*lifecycleStatus)
		opts.LifecycleStatus = &value
	}
	if settlement != nil {
		value := transactions.SettlementStatus(*settlement)
		opts.Settlement = &value
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

func shorthandCreateFields(
	initiatedDate openapi_types.Date,
	currency string,
	amountValue string,
	memberID *int64,
	tagIDs *[]int64,
	memo *string,
	settlement *openapi.SettlementIntent,
	reconciliationStatus *openapi.ReconciliationStatus,
) (transactions.ShorthandCreateFields, error) {
	amount, err := decimalField("amount", amountValue)
	if err != nil {
		return transactions.ShorthandCreateFields{}, err
	}

	return transactions.ShorthandCreateFields{
		InitiatedDate:        civilDateFromOpenAPI(initiatedDate),
		Currency:             currency,
		Amount:               amount,
		MemberID:             memberID,
		TagIDs:               cloneOptionalInt64Slice(tagIDs),
		Memo:                 memo,
		Settlement:           transactionAPISettlementIntentPtr(settlement),
		ReconciliationStatus: transactionAPIReconciliationStatusPtr(reconciliationStatus),
	}, nil
}

func journalRecordAPIInputs(records []openapi.CreateJournalRecordRequest) ([]transactions.JournalRecordInput, error) {
	inputs := make([]transactions.JournalRecordInput, 0, len(records))
	for index, record := range records {
		amount, err := decimalField(recordField(index, "amount"), record.Amount)
		if err != nil {
			return nil, err
		}
		amountUSDValue, err := optionalDecimalField(recordField(index, "amount_usd"), record.AmountUsd)
		if err != nil {
			return nil, err
		}
		inputs = append(inputs, transactions.JournalRecordInput{
			AccountID:            record.AccountId,
			MemberID:             record.MemberId,
			Currency:             record.Currency,
			Amount:               amount,
			AmountUSD:            amountUSDValue,
			CategoryID:           record.CategoryId,
			TagIDs:               cloneOptionalInt64Slice(record.TagIds),
			Memo:                 record.Memo,
			Settlement:           transactionAPISettlementIntentPtr(record.Settlement),
			ReconciliationStatus: transactions.ReconciliationStatus(record.ReconciliationStatus),
			Source:               transactions.Source(record.Source),
			ExternalID:           record.ExternalId,
			ExternalSystem:       record.ExternalSystem,
		})
	}

	return inputs, nil
}

func updateJournalRecordAPIInputs(records []openapi.UpdateTransactionRequest_Records_Item) ([]transactions.UpdateJournalRecordInput, error) {
	inputs := make([]transactions.UpdateJournalRecordInput, 0, len(records))
	for index, item := range records {
		existing, err := item.AsUpdateExistingJournalRecordRequest()
		if err != nil {
			return nil, services.InvalidRequest(recordField(index, "record_id") + " has invalid update shape")
		}
		if existing.RecordId == 0 {
			created, err := item.AsUpdateNewJournalRecordRequest()
			if err != nil {
				return nil, services.InvalidRequest(recordField(index, "record_id") + " has invalid new-record shape")
			}
			mapped, err := journalRecordAPIInputs([]openapi.CreateJournalRecordRequest{created})
			if err != nil {
				return nil, err
			}
			inputs = append(inputs, transactions.UpdateJournalRecordInput{JournalRecordInput: mapped[0]})
			continue
		}
		amount, err := decimalField(recordField(index, "amount"), existing.Amount)
		if err != nil {
			return nil, err
		}
		amountUSD, err := optionalDecimalField(recordField(index, "amount_usd"), existing.AmountUsd)
		if err != nil {
			return nil, err
		}
		inputs = append(inputs, transactions.UpdateJournalRecordInput{
			RecordID: &existing.RecordId,
			JournalRecordInput: transactions.JournalRecordInput{
				AccountID:            existing.AccountId,
				MemberID:             existing.MemberId,
				Currency:             existing.Currency,
				Amount:               amount,
				AmountUSD:            amountUSD,
				CategoryID:           existing.CategoryId,
				TagIDs:               cloneOptionalInt64Slice(existing.TagIds),
				Memo:                 existing.Memo,
				Settlement:           transactionAPISettlementIntentPtr(existing.Settlement),
				ReconciliationStatus: transactions.ReconciliationStatus(existing.ReconciliationStatus),
			},
		})
	}
	return inputs, nil
}

func transactionAPIResponse(transaction transactions.Transaction) openapi.Transaction {
	return openapi.Transaction{
		TransactionId:                   transaction.ID,
		Etag:                            transactions.ETag(transaction.UpdatedAt),
		InitiatedDate:                   openAPIDate(transaction.InitiatedDate),
		TransactionClass:                openapi.TransactionClass(transaction.Class),
		DisplayTitle:                    transaction.DisplayTitle,
		PrimaryAmounts:                  displayAmountAPIResponses(transaction.PrimaryAmounts),
		Shapes:                          transactionShapeAPIResponses(transaction.Shapes),
		RecurringOccurrenceId:           transaction.RecurringOccurrenceID,
		RecurringProjectionDefinitionId: transaction.RecurringProjectionDefinitionID,
		RecurringProjectionIsNext:       transaction.RecurringProjectionIsNext,
		LifecycleStatus:                 openapi.TransactionLifecycleStatus(transaction.LifecycleStatus),
		Settlement:                      openapi.TransactionSettlement(transaction.Settlement),
		CreatedAt:                       transaction.CreatedAt.UTC(),
		UpdatedAt:                       transaction.UpdatedAt.UTC(),
		TombstonedAt:                    nullableTimestampTime(transaction.TombstonedAt),
		Records:                         journalRecordAPIResponses(transaction.Records),
	}
}

func transactionAPIResponses(transactions []transactions.Transaction) []openapi.Transaction {
	responses := make([]openapi.Transaction, 0, len(transactions))
	for _, transaction := range transactions {
		responses = append(responses, transactionAPIResponse(transaction))
	}

	return responses
}

func transactionMonthTotalsAPIResponse(totals transactions.MonthActivityTotals) openapi.TransactionMonthTotalsResponse {
	return openapi.TransactionMonthTotalsResponse{
		Month:  totals.Month,
		Spend:  transactionMonthTotalAPIResponse(totals.Spend),
		Income: transactionMonthTotalAPIResponse(totals.Income),
	}
}

func transactionMonthTotalAPIResponse(total transactions.MonthActivityTotal) openapi.TransactionMonthTotal {
	return openapi.TransactionMonthTotal{
		AmountUsd:        total.AmountUSD.String(),
		UnconvertedCount: total.UnconvertedCount,
	}
}

func journalRecordAPIResponse(record transactions.JournalRecord) openapi.JournalRecord {
	amountUSD := nullableDecimalString(record.AmountUSD)

	return openapi.JournalRecord{
		RecordId:             record.ID,
		TransactionId:        record.TransactionID,
		InitiatedDate:        openAPIDate(record.InitiatedDate),
		AccountId:            record.AccountID,
		MemberId:             record.MemberID,
		Currency:             record.Currency,
		Amount:               record.Amount.String(),
		AmountUsd:            amountUSD,
		RunningBalance:       nullableDecimalString(record.RunningBalance),
		CategoryId:           record.CategoryID,
		RecordRole:           openapi.RecordRole(record.Role),
		TagIds:               cloneInt64Slice(record.TagIDs),
		Memo:                 record.Memo,
		PendingDate:          nullableOpenAPITimestamp(record.PendingDate),
		PostedDate:           nullableOpenAPITimestamp(record.PostedDate),
		LifecycleStatus:      openapi.TransactionLifecycleStatus(record.LifecycleStatus),
		Settlement:           transactionAPISettlementStatusPtr(record.Settlement),
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

func addRemainingCreditToJournalRecordAPIResponses(
	records []transactions.JournalRecord,
	responses []openapi.JournalRecord,
	currentLimit values.Decimal,
) error {
	for i, record := range records {
		if record.RunningBalance != nil {
			remaining, err := creditlimits.RemainingCredit(currentLimit, *record.RunningBalance)
			if err != nil {
				return err
			}
			value := remaining.String()
			responses[i].RemainingCredit = &value
		}
	}

	return nil
}

func bulkRecordOperationAPIResponse(response transactions.BulkRecordOperationResponse) openapi.BulkRecordOperationResponse {
	return openapi.BulkRecordOperationResponse{
		RecordIds:    cloneInt64Slice(response.RecordIDs),
		UpdatedCount: response.UpdatedCount,
	}
}

func bulkAccountReplaceAPIResponse(response transactions.BulkAccountReplaceResponse) openapi.BulkTransactionAccountReplaceResult {
	return openapi.BulkTransactionAccountReplaceResult{
		TransactionIds:          cloneInt64Slice(response.TransactionIDs),
		SourceAccountId:         response.SourceAccountID,
		ReplacementAccountId:    response.ReplacementAccountID,
		UpdatedRecordCount:      response.UpdatedRecordCount,
		UpdatedTransactionCount: response.UpdatedTransactionCount,
	}
}

func displayAmountAPIResponse(amount transactions.DisplayAmount) openapi.DisplayAmount {
	return openapi.DisplayAmount{
		Currency:  amount.Currency,
		Amount:    amount.Amount.String(),
		AmountUsd: nullableDecimalString(amount.AmountUSD),
	}
}

func displayAmountAPIResponses(amounts []transactions.DisplayAmount) []openapi.DisplayAmount {
	responses := make([]openapi.DisplayAmount, 0, len(amounts))
	for _, amount := range amounts {
		responses = append(responses, displayAmountAPIResponse(amount))
	}

	return responses
}

func transactionShapeAPIResponse(shape transactions.TransactionShape) openapi.TransactionShape {
	var effectiveRate *openapi.ExchangeEffectiveRate
	if shape.EffectiveRate != nil {
		effectiveRate = &openapi.ExchangeEffectiveRate{
			SoldCurrency:   shape.EffectiveRate.SoldCurrency,
			BoughtCurrency: shape.EffectiveRate.BoughtCurrency,
			Rate:           shape.EffectiveRate.Rate.String(),
		}
	}
	return openapi.TransactionShape{
		Shape:         openapi.TransactionShapeType(shape.Shape),
		Amounts:       displayAmountAPIResponses(shape.Amounts),
		EffectiveRate: effectiveRate,
	}
}

func transactionShapeAPIResponses(shapes []transactions.TransactionShape) []openapi.TransactionShape {
	responses := make([]openapi.TransactionShape, 0, len(shapes))
	for _, shape := range shapes {
		responses = append(responses, transactionShapeAPIResponse(shape))
	}

	return responses
}

func cloneOptionalInt64Slice(values *[]int64) []int64 {
	if values == nil {
		return nil
	}

	return slices.Clone(*values)
}

func cloneOptionalStringSlice(values *[]string) []string {
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

func transactionAPILifecycleStatusSlice(statuses *[]openapi.TransactionLifecycleStatus) []transactions.LifecycleStatus {
	if statuses == nil {
		return nil
	}
	values := make([]transactions.LifecycleStatus, 0, len(*statuses))
	for _, status := range *statuses {
		values = append(values, transactions.LifecycleStatus(status))
	}

	return values
}

func transactionAPISettlementSummarySlice(statuses *[]openapi.TransactionSettlement) []transactions.SettlementSummary {
	if statuses == nil {
		return nil
	}
	values := make([]transactions.SettlementSummary, 0, len(*statuses))
	for _, status := range *statuses {
		values = append(values, transactions.SettlementSummary(status))
	}
	return values
}

func transactionAPIClassSlice(classes *[]openapi.TransactionClass) []transactions.TransactionClass {
	if classes == nil {
		return nil
	}
	values := make([]transactions.TransactionClass, 0, len(*classes))
	for _, class := range *classes {
		values = append(values, transactions.TransactionClass(class))
	}

	return values
}

func transactionAPIShapeSlice(shapes *[]openapi.TransactionShapeType) []transactions.TransactionShapeType {
	if shapes == nil {
		return nil
	}
	values := make([]transactions.TransactionShapeType, 0, len(*shapes))
	for _, shape := range *shapes {
		values = append(values, transactions.TransactionShapeType(shape))
	}
	return values
}

func transactionAPIRoleSlice(roles *[]openapi.RecordRole) []transactions.RecordRole {
	if roles == nil {
		return nil
	}
	values := make([]transactions.RecordRole, 0, len(*roles))
	for _, role := range *roles {
		values = append(values, transactions.RecordRole(role))
	}
	return values
}

func transactionAPIRolePtr(role *openapi.RecordRole) *transactions.RecordRole {
	if role == nil {
		return nil
	}
	value := transactions.RecordRole(*role)
	return &value
}

func transactionAPISettlementIntentPtr(intent *openapi.SettlementIntent) *transactions.SettlementIntent {
	if intent == nil {
		return nil
	}
	return &transactions.SettlementIntent{
		Status:      transactions.SettlementStatus(intent.Status),
		PendingDate: nullableTimestampFromOpenAPI(intent.PendingDate),
		PostedDate:  nullableTimestampFromOpenAPI(intent.PostedDate),
	}
}

func transactionAPISettlementStatusPtr(status *transactions.SettlementStatus) *openapi.SettlementStatus {
	if status == nil {
		return nil
	}
	value := openapi.SettlementStatus(*status)
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
