package httpapi

import (
	"context"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/transactiontemplates"
)

func (s *strictServer) ListTransactionTemplates(ctx context.Context, request openapi.ListTransactionTemplatesRequestObject) (openapi.ListTransactionTemplatesResponseObject, error) {
	params := request.Params
	templateList, err := s.deps.Templates.List(ctx, listOptionsFromParams(
		params.Sort,
		params.SortDir,
		params.Limit,
		params.Offset,
		services.SortKeyFQN,
	))
	if err != nil {
		return nil, err
	}

	return openapi.ListTransactionTemplates200JSONResponse{
		TransactionTemplates: transactionTemplateAPIResponses(templateList.Items),
		TotalCount:           templateList.TotalCount,
	}, nil
}

func (s *strictServer) CreateTransactionTemplate(ctx context.Context, request openapi.CreateTransactionTemplateRequestObject) (openapi.CreateTransactionTemplateResponseObject, error) {
	input, err := transactionTemplateWriteAPIInput(*request.Body)
	if err != nil {
		return nil, err
	}

	template, err := s.deps.Templates.Create(ctx, input)
	if err != nil {
		return nil, err
	}

	return openapi.CreateTransactionTemplate201JSONResponse(transactionTemplateAPIResponse(template)), nil
}

func (s *strictServer) RestructureTransactionTemplates(ctx context.Context, request openapi.RestructureTransactionTemplatesRequestObject) (openapi.RestructureTransactionTemplatesResponseObject, error) {
	movedCount, err := s.deps.Templates.Restructure(ctx, request.Body.FromFqn, request.Body.ToFqn)
	if err != nil {
		return nil, err
	}

	return openapi.RestructureTransactionTemplates200JSONResponse{MovedCount: movedCount}, nil
}

func (s *strictServer) DeleteTransactionTemplate(ctx context.Context, request openapi.DeleteTransactionTemplateRequestObject) (openapi.DeleteTransactionTemplateResponseObject, error) {
	if err := s.deps.Templates.Delete(ctx, request.TransactionTemplateId); err != nil {
		return nil, err
	}

	return openapi.DeleteTransactionTemplate204Response{}, nil
}

func (s *strictServer) GetTransactionTemplate(ctx context.Context, request openapi.GetTransactionTemplateRequestObject) (openapi.GetTransactionTemplateResponseObject, error) {
	template, err := s.deps.Templates.Get(ctx, request.TransactionTemplateId)
	if err != nil {
		return nil, err
	}

	return openapi.GetTransactionTemplate200JSONResponse(transactionTemplateAPIResponse(template)), nil
}

func (s *strictServer) ReplaceTransactionTemplate(ctx context.Context, request openapi.ReplaceTransactionTemplateRequestObject) (openapi.ReplaceTransactionTemplateResponseObject, error) {
	input, err := transactionTemplateWriteAPIInput(*request.Body)
	if err != nil {
		return nil, err
	}

	template, err := s.deps.Templates.Replace(ctx, request.TransactionTemplateId, input)
	if err != nil {
		return nil, err
	}

	return openapi.ReplaceTransactionTemplate200JSONResponse(transactionTemplateAPIResponse(template)), nil
}

func transactionTemplateWriteAPIInput(request openapi.TransactionTemplateWriteRequest) (transactiontemplates.WriteInput, error) {
	recordInputs, err := transactionTemplateRecordAPIInputs(request.Records)
	if err != nil {
		return transactiontemplates.WriteInput{}, err
	}

	return transactiontemplates.WriteInput{FQN: request.Fqn, Records: recordInputs}, nil
}

func transactionTemplateRecordAPIInputs(records []openapi.TransactionTemplateRecordRequest) ([]transactiontemplates.TemplateRecordInput, error) {
	inputs := make([]transactiontemplates.TemplateRecordInput, 0, len(records))
	for index, record := range records {
		amount, err := optionalDecimalField(recordField(index, "amount"), record.Amount)
		if err != nil {
			return nil, err
		}
		inputs = append(inputs, transactiontemplates.TemplateRecordInput{
			CategoryID:           record.CategoryId,
			AccountID:            record.AccountId,
			MemberID:             record.MemberId,
			Currency:             record.Currency,
			Amount:               amount,
			TagIDs:               cloneOptionalInt64Slice(record.TagIds),
			Memo:                 record.Memo,
			PostingStatus:        transactionAPIPostingStatusPtr(record.PostingStatus),
			ReconciliationStatus: transactionAPIReconciliationStatusPtr(record.ReconciliationStatus),
		})
	}

	return inputs, nil
}

func transactionTemplateAPIResponse(template transactiontemplates.Template) openapi.TransactionTemplate {
	return openapi.TransactionTemplate{
		TransactionTemplateId: template.ID,
		Fqn:                   template.FQN,
		ParentFqn:             template.ParentFQN,
		Name:                  template.Name,
		Level:                 template.Level,
		CreatedAt:             template.CreatedAt.UTC(),
		UpdatedAt:             template.UpdatedAt.UTC(),
		TombstonedAt:          nullableTimestampTime(template.TombstonedAt),
		Records:               transactionTemplateRecordAPIResponses(template.Records),
	}
}

func transactionTemplateAPIResponses(templates []transactiontemplates.Template) []openapi.TransactionTemplate {
	responses := make([]openapi.TransactionTemplate, 0, len(templates))
	for _, template := range templates {
		responses = append(responses, transactionTemplateAPIResponse(template))
	}

	return responses
}

func transactionTemplateRecordAPIResponse(record transactiontemplates.TemplateRecord) openapi.TransactionTemplateRecord {
	return openapi.TransactionTemplateRecord{
		TransactionTemplateRecordId: record.ID,
		TransactionTemplateId:       record.TemplateID,
		CategoryId:                  record.CategoryID,
		AccountId:                   record.AccountID,
		MemberId:                    record.MemberID,
		Currency:                    record.Currency,
		Amount:                      nullableDecimalString(record.Amount),
		TagIds:                      cloneInt64Slice(record.TagIDs),
		Memo:                        record.Memo,
		PostingStatus:               transactionTemplatePostingStatusAPIResponse(record.PostingStatus),
		ReconciliationStatus:        transactionTemplateReconciliationStatusAPIResponse(record.ReconciliationStatus),
		CreatedAt:                   record.CreatedAt.UTC(),
		UpdatedAt:                   record.UpdatedAt.UTC(),
		TombstonedAt:                nullableTimestampTime(record.TombstonedAt),
	}
}

func transactionTemplateRecordAPIResponses(records []transactiontemplates.TemplateRecord) []openapi.TransactionTemplateRecord {
	responses := make([]openapi.TransactionTemplateRecord, 0, len(records))
	for _, record := range records {
		responses = append(responses, transactionTemplateRecordAPIResponse(record))
	}

	return responses
}

func transactionTemplatePostingStatusAPIResponse(status *transactions.PostingStatus) *openapi.PostingStatus {
	if status == nil {
		return nil
	}
	value := openapi.PostingStatus(*status)

	return &value
}

func transactionTemplateReconciliationStatusAPIResponse(status *transactions.ReconciliationStatus) *openapi.ReconciliationStatus {
	if status == nil {
		return nil
	}
	value := openapi.ReconciliationStatus(*status)

	return &value
}
