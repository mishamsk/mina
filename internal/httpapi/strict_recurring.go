package httpapi

import (
	"context"
	"encoding/json"

	"github.com/oapi-codegen/nullable"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/recurring"
	"github.com/mishamsk/mina/internal/services/values"
)

func (s *strictServer) ListRecurringDefinitions(ctx context.Context, request openapi.ListRecurringDefinitionsRequestObject) (openapi.ListRecurringDefinitionsResponseObject, error) {
	params := request.Params
	definitionList, err := s.deps.Recurring.List(ctx, listOptionsFromParams(
		params.Sort,
		params.SortDir,
		params.Limit,
		params.Offset,
		services.SortKeyFQN,
	))
	if err != nil {
		return nil, err
	}

	return openapi.ListRecurringDefinitions200JSONResponse{
		RecurringDefinitions: recurringDefinitionAPIResponses(definitionList.Items),
		TotalCount:           definitionList.TotalCount,
	}, nil
}

func (s *strictServer) CreateRecurringDefinition(ctx context.Context, request openapi.CreateRecurringDefinitionRequestObject) (openapi.CreateRecurringDefinitionResponseObject, error) {
	input, err := recurringDefinitionWriteAPIInput(*request.Body)
	if err != nil {
		return nil, err
	}

	definition, err := s.deps.Recurring.Create(ctx, input)
	if err != nil {
		return nil, err
	}

	return openapi.CreateRecurringDefinition201JSONResponse(recurringDefinitionAPIResponse(definition)), nil
}

func (s *strictServer) DeleteRecurringDefinition(ctx context.Context, request openapi.DeleteRecurringDefinitionRequestObject) (openapi.DeleteRecurringDefinitionResponseObject, error) {
	if err := s.deps.Recurring.Cancel(ctx, request.RecurringDefinitionId); err != nil {
		return nil, err
	}

	return openapi.DeleteRecurringDefinition204Response{}, nil
}

func (s *strictServer) ConfirmNextRecurringDefinition(ctx context.Context, request openapi.ConfirmNextRecurringDefinitionRequestObject) (openapi.ConfirmNextRecurringDefinitionResponseObject, error) {
	occurrence, err := s.deps.Recurring.ConfirmNext(
		ctx,
		request.RecurringDefinitionId,
		values.LocalCivilDateFromTime(s.deps.clock().Now()),
	)
	if err != nil {
		return nil, err
	}

	return openapi.ConfirmNextRecurringDefinition200JSONResponse(recurringOccurrenceAPIResponse(occurrence)), nil
}

func (s *strictServer) DeferRecurringDefinition(ctx context.Context, request openapi.DeferRecurringDefinitionRequestObject) (openapi.DeferRecurringDefinitionResponseObject, error) {
	occurrence, err := s.deps.Recurring.Defer(
		ctx,
		request.RecurringDefinitionId,
		values.LocalCivilDateFromTime(s.deps.clock().Now()),
		recurringDeferAPIInput(request.Body),
	)
	if err != nil {
		return nil, err
	}

	return openapi.DeferRecurringDefinition200JSONResponse(recurringOccurrenceAPIResponse(occurrence)), nil
}

func (s *strictServer) GetRecurringDefinition(ctx context.Context, request openapi.GetRecurringDefinitionRequestObject) (openapi.GetRecurringDefinitionResponseObject, error) {
	definition, err := s.deps.Recurring.Get(ctx, request.RecurringDefinitionId)
	if err != nil {
		return nil, err
	}

	return openapi.GetRecurringDefinition200JSONResponse(recurringDefinitionAPIResponse(definition)), nil
}

func (s *strictServer) ReplaceRecurringDefinition(ctx context.Context, request openapi.ReplaceRecurringDefinitionRequestObject) (openapi.ReplaceRecurringDefinitionResponseObject, error) {
	input, err := recurringDefinitionWriteAPIInput(*request.Body)
	if err != nil {
		return nil, err
	}

	definition, err := s.deps.Recurring.Replace(ctx, request.RecurringDefinitionId, input)
	if err != nil {
		return nil, err
	}

	return openapi.ReplaceRecurringDefinition200JSONResponse(recurringDefinitionAPIResponse(definition)), nil
}

func (s *strictServer) ConfirmRecurringOccurrence(ctx context.Context, request openapi.ConfirmRecurringOccurrenceRequestObject) (openapi.ConfirmRecurringOccurrenceResponseObject, error) {
	occurrence, err := s.deps.Recurring.ConfirmOccurrence(ctx, request.RecurringOccurrenceId)
	if err != nil {
		return nil, err
	}

	return openapi.ConfirmRecurringOccurrence200JSONResponse(recurringOccurrenceAPIResponse(occurrence)), nil
}

func (s *strictServer) DismissRecurringOccurrence(ctx context.Context, request openapi.DismissRecurringOccurrenceRequestObject) (openapi.DismissRecurringOccurrenceResponseObject, error) {
	occurrence, err := s.deps.Recurring.DismissOccurrence(ctx, request.RecurringOccurrenceId)
	if err != nil {
		return nil, err
	}

	return openapi.DismissRecurringOccurrence200JSONResponse(recurringOccurrenceAPIResponse(occurrence)), nil
}

func (s *strictServer) ListRecurringOccurrences(ctx context.Context, request openapi.ListRecurringOccurrencesRequestObject) (openapi.ListRecurringOccurrencesResponseObject, error) {
	params := request.Params
	occurrences, err := s.deps.Recurring.ListOccurrences(ctx, recurring.OccurrenceListOptions{
		ListOptions: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyScheduledDate,
		),
		Today:                 values.LocalCivilDateFromTime(s.deps.clock().Now()),
		RecurringDefinitionID: params.RecurringDefinitionId,
		Statuses:              recurringOccurrenceAPIStatuses(params.Status),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListRecurringOccurrences200JSONResponse{
		RecurringOccurrences: recurringOccurrenceAPIResponses(occurrences.Items),
		TotalCount:           occurrences.TotalCount,
	}, nil
}

func (s *strictServer) PauseRecurringDefinition(ctx context.Context, request openapi.PauseRecurringDefinitionRequestObject) (openapi.PauseRecurringDefinitionResponseObject, error) {
	definition, err := s.deps.Recurring.Pause(ctx, request.RecurringDefinitionId)
	if err != nil {
		return nil, err
	}

	return openapi.PauseRecurringDefinition200JSONResponse(recurringDefinitionAPIResponse(definition)), nil
}

func (s *strictServer) ResumeRecurringDefinition(ctx context.Context, request openapi.ResumeRecurringDefinitionRequestObject) (openapi.ResumeRecurringDefinitionResponseObject, error) {
	definition, err := s.deps.Recurring.Resume(
		ctx,
		request.RecurringDefinitionId,
		values.LocalCivilDateFromTime(s.deps.clock().Now()),
	)
	if err != nil {
		return nil, err
	}

	return openapi.ResumeRecurringDefinition200JSONResponse(recurringDefinitionAPIResponse(definition)), nil
}

func recurringDefinitionWriteAPIInput(request openapi.RecurringDefinitionWriteRequest) (recurring.WriteInput, error) {
	scheduleRule, err := json.Marshal(request.ScheduleRule)
	if err != nil {
		return recurring.WriteInput{}, services.InvalidRequest("schedule_rule must be a JSON object")
	}
	records, err := recurringDefinitionRecordAPIInputs(request.Records)
	if err != nil {
		return recurring.WriteInput{}, err
	}

	return recurring.WriteInput{
		FQN:          request.Fqn,
		ScheduleRule: scheduleRule,
		AnchorDate:   civilDateFromOpenAPI(request.AnchorDate),
		TemplateID:   request.TemplateId,
		Records:      records,
	}, nil
}

func recurringDeferAPIInput(request *openapi.DeferRecurringDefinitionJSONRequestBody) recurring.DeferInput {
	if request == nil {
		return recurring.DeferInput{}
	}
	input := recurring.DeferInput{Every: request.Every}
	if request.Unit != nil {
		unit := string(*request.Unit)
		input.Unit = &unit
	}

	return input
}

func recurringDefinitionRecordAPIInputs(records *[]openapi.RecurringDefinitionRecordRequest) ([]recurring.RecordInput, error) {
	if records == nil {
		return []recurring.RecordInput{}, nil
	}
	inputs := make([]recurring.RecordInput, 0, len(*records))
	for index, record := range *records {
		amount, err := optionalDecimalField(recordField(index, "amount"), record.Amount)
		if err != nil {
			return nil, err
		}
		tagIDs := recurring.OptionalInt64Slice{}
		if record.TagIds != nil {
			tagIDs = recurring.OptionalInt64Slice{
				Specified: true,
				Values:    cloneOptionalInt64Slice(record.TagIds),
			}
		}
		inputs = append(inputs, recurring.RecordInput{
			AccountID:  record.AccountId,
			MemberID:   optionalRecurringNullableInt64(record.MemberId),
			Currency:   record.Currency,
			Amount:     amount,
			CategoryID: record.CategoryId,
			TagIDs:     tagIDs,
			Memo:       optionalRecurringNullableString(record.Memo),
		})
	}

	return inputs, nil
}

func optionalRecurringNullableInt64(value nullable.Nullable[int64]) recurring.OptionalInt64 {
	if !value.IsSpecified() {
		return recurring.OptionalInt64{}
	}
	if value.IsNull() {
		return recurring.OptionalInt64{Specified: true}
	}
	intValue := value.MustGet()
	return recurring.OptionalInt64{Specified: true, Value: &intValue}
}

func optionalRecurringNullableString(value nullable.Nullable[string]) recurring.OptionalString {
	if !value.IsSpecified() {
		return recurring.OptionalString{}
	}
	if value.IsNull() {
		return recurring.OptionalString{Specified: true}
	}
	stringValue := value.MustGet()
	return recurring.OptionalString{Specified: true, Value: &stringValue}
}

func recurringDefinitionAPIResponse(definition recurring.Definition) openapi.RecurringDefinition {
	return openapi.RecurringDefinition{
		RecurringDefinitionId: definition.ID,
		Fqn:                   definition.FQN,
		ScheduleRule:          recurringScheduleRuleAPIResponse(definition.ScheduleRule),
		ScheduleClass:         openapi.RecurringScheduleClass(definition.ScheduleClass),
		AnchorDate:            openAPIDate(definition.AnchorDate),
		DefinitionVersion:     definition.DefinitionVersion,
		PausedAt:              nullableTimestampTime(definition.PausedAt),
		ParentFqn:             definition.ParentFQN,
		Name:                  definition.Name,
		Level:                 definition.Level,
		NextDueDate:           nullableOpenAPIDate(definition.NextDueDate),
		TransactionClass:      openapi.TransactionClass(definition.Class),
		DisplayAmounts:        displayAmountAPIResponses(definition.DisplayAmounts),
		CreatedAt:             definition.CreatedAt.UTC(),
		UpdatedAt:             definition.UpdatedAt.UTC(),
		TombstonedAt:          nullableTimestampTime(definition.TombstonedAt),
		Records:               recurringDefinitionRecordAPIResponses(definition.Records),
	}
}

func recurringScheduleRuleAPIResponse(raw json.RawMessage) openapi.RecurringScheduleRule {
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return openapi.RecurringScheduleRule{}
	}

	return openapi.RecurringScheduleRule(payload)
}

func recurringDefinitionAPIResponses(definitions []recurring.Definition) []openapi.RecurringDefinition {
	responses := make([]openapi.RecurringDefinition, 0, len(definitions))
	for _, definition := range definitions {
		responses = append(responses, recurringDefinitionAPIResponse(definition))
	}

	return responses
}

func recurringOccurrenceAPIStatuses(statuses *[]openapi.RecurringOccurrenceStatus) []recurring.OccurrenceStatus {
	if statuses == nil {
		return nil
	}
	values := make([]recurring.OccurrenceStatus, 0, len(*statuses))
	for _, status := range *statuses {
		values = append(values, recurring.OccurrenceStatus(status))
	}

	return values
}

func recurringOccurrenceAPIResponse(occurrence recurring.Occurrence) openapi.RecurringOccurrence {
	return openapi.RecurringOccurrence{
		RecurringOccurrenceId:         occurrence.ID,
		RecurringDefinitionId:         occurrence.RecurringDefinitionID,
		RecurringDefinitionFqn:        occurrence.RecurringDefinitionFQN,
		ScheduledDate:                 openAPIDate(occurrence.ScheduledDate),
		Status:                        openapi.RecurringOccurrenceStatus(occurrence.Status),
		MaterializedDefinitionVersion: occurrence.MaterializedDefinitionVersion,
		MaterializedAt:                occurrence.MaterializedAt.UTC(),
		ReviewedAt:                    nullableTimestampTime(occurrence.ReviewedAt),
		GeneratedTransactionId:        occurrence.GeneratedTransactionID,
		CreatedAt:                     occurrence.CreatedAt.UTC(),
		UpdatedAt:                     occurrence.UpdatedAt.UTC(),
	}
}

func recurringOccurrenceAPIResponses(occurrences []recurring.Occurrence) []openapi.RecurringOccurrence {
	responses := make([]openapi.RecurringOccurrence, 0, len(occurrences))
	for _, occurrence := range occurrences {
		responses = append(responses, recurringOccurrenceAPIResponse(occurrence))
	}

	return responses
}

func recurringDefinitionRecordAPIResponse(record recurring.DefinitionRecord) openapi.RecurringDefinitionRecord {
	return openapi.RecurringDefinitionRecord{
		RecurringDefinitionRecordId: record.ID,
		RecurringDefinitionId:       record.RecurringDefinitionID,
		AccountId:                   record.AccountID,
		MemberId:                    record.MemberID,
		Currency:                    record.Currency,
		Amount:                      record.Amount.String(),
		CategoryId:                  record.CategoryID,
		TagIds:                      cloneInt64Slice(record.TagIDs),
		Memo:                        record.Memo,
		CreatedAt:                   record.CreatedAt.UTC(),
		UpdatedAt:                   record.UpdatedAt.UTC(),
		TombstonedAt:                nullableTimestampTime(record.TombstonedAt),
	}
}

func recurringDefinitionRecordAPIResponses(records []recurring.DefinitionRecord) []openapi.RecurringDefinitionRecord {
	responses := make([]openapi.RecurringDefinitionRecord, 0, len(records))
	for _, record := range records {
		responses = append(responses, recurringDefinitionRecordAPIResponse(record))
	}

	return responses
}

func nullableOpenAPIDate(value *values.CivilDate) *openapi_types.Date {
	if value == nil {
		return nil
	}
	date := openAPIDate(*value)

	return &date
}
