package httpapi

import (
	"context"
	"fmt"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services/operationruns"
)

func (s *strictServer) ListBackgroundOperations(
	ctx context.Context,
	_ openapi.ListBackgroundOperationsRequestObject,
) (openapi.ListBackgroundOperationsResponseObject, error) {
	operations, err := s.deps.Operations.List(ctx)
	if err != nil {
		return nil, err
	}

	response := openapi.BackgroundOperationListResponse{
		Operations: make([]openapi.BackgroundOperationSummary, 0, len(operations)),
	}
	for _, operation := range operations {
		response.Operations = append(response.Operations, openapi.BackgroundOperationSummary{
			OperationId: openapi.BackgroundOperationId(operation.ID),
			Links:       operationLinks(operation.ID),
		})
	}

	return openapi.ListBackgroundOperations200JSONResponse(response), nil
}

func (s *strictServer) ListBackgroundOperationRunEnvelopes(
	ctx context.Context,
	request openapi.ListBackgroundOperationRunEnvelopesRequestObject,
) (openapi.ListBackgroundOperationRunEnvelopesResponseObject, error) {
	var operationID *operationruns.OperationID
	if request.Params.OperationId != nil {
		value := operationruns.OperationID(*request.Params.OperationId)
		operationID = &value
	}
	runs, err := s.deps.Operations.ListRunEnvelopes(ctx, operationID, operationruns.ListRunsOptions{
		Limit:  request.Params.Limit,
		Offset: offsetParam(request.Params.Offset),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListBackgroundOperationRunEnvelopes200JSONResponse(openapi.BackgroundOperationRunListResponse{
		Runs:       backgroundOperationRunAPIResponses(runs.Items),
		TotalCount: runs.TotalCount,
	}), nil
}

func (s *strictServer) GetExchangeRateLoadingStatus(
	ctx context.Context,
	_ openapi.GetExchangeRateLoadingStatusRequestObject,
) (openapi.GetExchangeRateLoadingStatusResponseObject, error) {
	status, err := s.deps.Operations.ExchangeRateLoadingStatus(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.GetExchangeRateLoadingStatus200JSONResponse{
		OperationId:          openapi.ExchangeRateLoadingStatusResponseOperationId(status.ID),
		Enabled:              status.Enabled,
		ScheduleUtc:          status.ScheduleUTC,
		State:                openapi.ExchangeRateLoadingStatusResponseState(status.State),
		LastStartedAt:        status.LastStartedAt,
		LastCompletedAt:      status.LastCompletedAt,
		LastSuccess:          status.LastSuccess,
		LastError:            status.LastError,
		RunCount:             status.RunCount,
		CompletedRunRevision: status.CompletedRunRevision,
	}, nil
}

func (s *strictServer) GetDatabaseBackupStatus(
	ctx context.Context,
	_ openapi.GetDatabaseBackupStatusRequestObject,
) (openapi.GetDatabaseBackupStatusResponseObject, error) {
	status, err := s.deps.Operations.DatabaseBackupStatus(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.GetDatabaseBackupStatus200JSONResponse{
		OperationId:          openapi.DatabaseBackupStatusResponseOperationId(status.ID),
		Enabled:              status.Enabled,
		ScheduleUtc:          status.ScheduleUTC,
		State:                openapi.DatabaseBackupStatusResponseState(status.State),
		LastStartedAt:        status.LastStartedAt,
		LastCompletedAt:      status.LastCompletedAt,
		LastSuccess:          status.LastSuccess,
		LastError:            status.LastError,
		RunCount:             status.RunCount,
		CompletedRunRevision: status.CompletedRunRevision,
	}, nil
}

func (s *strictServer) GetAuditLogCompactionStatus(
	ctx context.Context,
	_ openapi.GetAuditLogCompactionStatusRequestObject,
) (openapi.GetAuditLogCompactionStatusResponseObject, error) {
	status, err := s.deps.Operations.AuditLogCompactionStatus(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.GetAuditLogCompactionStatus200JSONResponse{
		OperationId:          openapi.AuditLogCompactionStatusResponseOperationId(status.ID),
		Enabled:              status.Enabled,
		ScheduleUtc:          status.ScheduleUTC,
		State:                openapi.AuditLogCompactionStatusResponseState(status.State),
		LastStartedAt:        status.LastStartedAt,
		LastCompletedAt:      status.LastCompletedAt,
		LastSuccess:          status.LastSuccess,
		LastError:            status.LastError,
		RunCount:             status.RunCount,
		CompletedRunRevision: status.CompletedRunRevision,
	}, nil
}

func (s *strictServer) GetRecurringCatchUpStatus(
	ctx context.Context,
	_ openapi.GetRecurringCatchUpStatusRequestObject,
) (openapi.GetRecurringCatchUpStatusResponseObject, error) {
	status, err := s.deps.Operations.RecurringCatchUpStatus(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.GetRecurringCatchUpStatus200JSONResponse{
		OperationId:          openapi.RecurringCatchUpStatusResponseOperationId(status.ID),
		Enabled:              status.Enabled,
		ScheduleLocal:        status.ScheduleLocal,
		State:                openapi.RecurringCatchUpStatusResponseState(status.State),
		LastStartedAt:        status.LastStartedAt,
		LastCompletedAt:      status.LastCompletedAt,
		LastSuccess:          status.LastSuccess,
		LastError:            status.LastError,
		RunCount:             status.RunCount,
		CompletedRunRevision: status.CompletedRunRevision,
	}, nil
}

func (s *strictServer) StartExchangeRateLoadingRun(
	ctx context.Context,
	_ openapi.StartExchangeRateLoadingRunRequestObject,
) (openapi.StartExchangeRateLoadingRunResponseObject, error) {
	run, err := s.deps.Operations.TriggerExchangeRateLoadingOperation(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.StartExchangeRateLoadingRun202JSONResponse{
		OperationRunId: run.ID,
		OperationId:    openapi.OperationRunReferenceResponseOperationId(run.OperationID),
		StatusUrl:      exchangeRateLoadingRunURL(run.ID),
	}, nil
}

func (s *strictServer) StartDatabaseBackupRun(
	ctx context.Context,
	_ openapi.StartDatabaseBackupRunRequestObject,
) (openapi.StartDatabaseBackupRunResponseObject, error) {
	run, err := s.deps.Operations.TriggerDatabaseBackupOperation(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.StartDatabaseBackupRun202JSONResponse{
		OperationRunId: run.ID,
		OperationId:    openapi.OperationRunReferenceResponseOperationId(run.OperationID),
		StatusUrl:      databaseBackupRunURL(run.ID),
	}, nil
}

func (s *strictServer) StartAuditLogCompactionRun(
	ctx context.Context,
	_ openapi.StartAuditLogCompactionRunRequestObject,
) (openapi.StartAuditLogCompactionRunResponseObject, error) {
	run, err := s.deps.Operations.TriggerAuditLogCompactionOperation(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.StartAuditLogCompactionRun202JSONResponse{
		OperationRunId: run.ID,
		OperationId:    openapi.OperationRunReferenceResponseOperationId(run.OperationID),
		StatusUrl:      auditLogCompactionRunURL(run.ID),
	}, nil
}

func (s *strictServer) StartRecurringCatchUpRun(
	ctx context.Context,
	_ openapi.StartRecurringCatchUpRunRequestObject,
) (openapi.StartRecurringCatchUpRunResponseObject, error) {
	run, err := s.deps.Operations.TriggerRecurringCatchUpOperation(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.StartRecurringCatchUpRun202JSONResponse{
		OperationRunId: run.ID,
		OperationId:    openapi.OperationRunReferenceResponseOperationId(run.OperationID),
		StatusUrl:      recurringCatchUpRunURL(run.ID),
	}, nil
}

func (s *strictServer) GetExchangeRateLoadingRun(
	ctx context.Context,
	request openapi.GetExchangeRateLoadingRunRequestObject,
) (openapi.GetExchangeRateLoadingRunResponseObject, error) {
	run, err := s.deps.Operations.GetExchangeRateLoadingRun(ctx, request.OperationRunId)
	if err != nil {
		return nil, err
	}

	return openapi.GetExchangeRateLoadingRun200JSONResponse(exchangeRateLoadingRunAPIResponse(run)), nil
}

func (s *strictServer) GetDatabaseBackupRun(
	ctx context.Context,
	request openapi.GetDatabaseBackupRunRequestObject,
) (openapi.GetDatabaseBackupRunResponseObject, error) {
	run, err := s.deps.Operations.GetDatabaseBackupRun(ctx, request.OperationRunId)
	if err != nil {
		return nil, err
	}

	return openapi.GetDatabaseBackupRun200JSONResponse(databaseBackupRunAPIResponse(run)), nil
}

func (s *strictServer) GetAuditLogCompactionRun(
	ctx context.Context,
	request openapi.GetAuditLogCompactionRunRequestObject,
) (openapi.GetAuditLogCompactionRunResponseObject, error) {
	run, err := s.deps.Operations.GetAuditLogCompactionRun(ctx, request.OperationRunId)
	if err != nil {
		return nil, err
	}

	return openapi.GetAuditLogCompactionRun200JSONResponse(auditLogCompactionRunAPIResponse(run)), nil
}

func (s *strictServer) GetRecurringCatchUpRun(
	ctx context.Context,
	request openapi.GetRecurringCatchUpRunRequestObject,
) (openapi.GetRecurringCatchUpRunResponseObject, error) {
	run, err := s.deps.Operations.GetRecurringCatchUpRun(ctx, request.OperationRunId)
	if err != nil {
		return nil, err
	}

	return openapi.GetRecurringCatchUpRun200JSONResponse(recurringCatchUpRunAPIResponse(run)), nil
}

func backgroundOperationRunAPIResponse(run operationruns.RunEnvelope) openapi.BackgroundOperationRun {
	return openapi.BackgroundOperationRun{
		OperationRunId: run.ID,
		OperationId:    openapi.BackgroundOperationId(run.OperationID),
		Outcome:        openapi.BackgroundOperationRunOutcome(run.Status),
		Trigger:        openapi.BackgroundOperationRunTrigger(run.Trigger),
		StartedAt:      run.StartedAt,
		CompletedAt:    run.CompletedAt,
		Error:          run.Error,
	}
}

func backgroundOperationRunAPIResponses(runs []operationruns.RunEnvelope) []openapi.BackgroundOperationRun {
	responses := make([]openapi.BackgroundOperationRun, 0, len(runs))
	for _, run := range runs {
		responses = append(responses, backgroundOperationRunAPIResponse(run))
	}

	return responses
}

func exchangeRateLoadingRunAPIResponse(run operationruns.ExchangeRateLoadingRun) openapi.ExchangeRateLoadingRun {
	return openapi.ExchangeRateLoadingRun{
		OperationRunId: run.ID,
		OperationId:    openapi.ExchangeRateLoadingRunOperationId(run.OperationID),
		Outcome:        openapi.BackgroundOperationRunOutcome(run.Status),
		Trigger:        openapi.BackgroundOperationRunTrigger(run.Trigger),
		StartedAt:      run.StartedAt,
		CompletedAt:    run.CompletedAt,
		Error:          run.Error,
	}
}

func databaseBackupRunAPIResponse(run operationruns.DatabaseBackupRun) openapi.DatabaseBackupRun {
	return openapi.DatabaseBackupRun{
		OperationRunId: run.ID,
		OperationId:    openapi.DatabaseBackupRunOperationId(run.OperationID),
		Outcome:        openapi.BackgroundOperationRunOutcome(run.Status),
		Trigger:        openapi.BackgroundOperationRunTrigger(run.Trigger),
		StartedAt:      run.StartedAt,
		CompletedAt:    run.CompletedAt,
		Error:          run.Error,
	}
}

func auditLogCompactionRunAPIResponse(run operationruns.AuditLogCompactionRun) openapi.AuditLogCompactionRun {
	return openapi.AuditLogCompactionRun{
		OperationRunId: run.ID,
		OperationId:    openapi.AuditLogCompactionRunOperationId(run.OperationID),
		Outcome:        openapi.BackgroundOperationRunOutcome(run.Status),
		Trigger:        openapi.BackgroundOperationRunTrigger(run.Trigger),
		StartedAt:      run.StartedAt,
		CompletedAt:    run.CompletedAt,
		Error:          run.Error,
	}
}

func recurringCatchUpRunAPIResponse(run operationruns.RecurringCatchUpRun) openapi.RecurringCatchUpRun {
	return openapi.RecurringCatchUpRun{
		OperationRunId: run.ID,
		OperationId:    openapi.RecurringCatchUpRunOperationId(run.OperationID),
		Outcome:        openapi.BackgroundOperationRunOutcome(run.Status),
		Trigger:        openapi.BackgroundOperationRunTrigger(run.Trigger),
		StartedAt:      run.StartedAt,
		CompletedAt:    run.CompletedAt,
		Error:          run.Error,
	}
}

func exchangeRateLoadingRunURL(runID int64) string {
	return fmt.Sprintf("/api/background-operations/exchange-rate-loading/runs/%d", runID)
}

func databaseBackupRunURL(runID int64) string {
	return fmt.Sprintf("/api/background-operations/database-backup/runs/%d", runID)
}

func auditLogCompactionRunURL(runID int64) string {
	return fmt.Sprintf("/api/background-operations/audit-log-compaction/runs/%d", runID)
}

func recurringCatchUpRunURL(runID int64) string {
	return fmt.Sprintf("/api/background-operations/recurring-catch-up/runs/%d", runID)
}

func operationLinks(operationID operationruns.OperationID) openapi.BackgroundOperationLinks {
	switch operationID {
	case operationruns.ExchangeRateLoadingOperationID:
		return openapi.BackgroundOperationLinks{
			Status:   "/api/background-operations/exchange-rate-loading/status",
			StartRun: "/api/background-operations/exchange-rate-loading/runs",
			Run:      "/api/background-operations/exchange-rate-loading/runs/{operation_run_id}",
			Runs:     "/api/background-operations/runs?operation_id=exchange-rate-loading",
		}
	case operationruns.DatabaseBackupOperationID:
		return openapi.BackgroundOperationLinks{
			Status:   "/api/background-operations/database-backup/status",
			StartRun: "/api/background-operations/database-backup/runs",
			Run:      "/api/background-operations/database-backup/runs/{operation_run_id}",
			Runs:     "/api/background-operations/runs?operation_id=database-backup",
		}
	case operationruns.AuditLogCompactionOperationID:
		return openapi.BackgroundOperationLinks{
			Status:   "/api/background-operations/audit-log-compaction/status",
			StartRun: "/api/background-operations/audit-log-compaction/runs",
			Run:      "/api/background-operations/audit-log-compaction/runs/{operation_run_id}",
			Runs:     "/api/background-operations/runs?operation_id=audit-log-compaction",
		}
	case operationruns.RecurringCatchUpOperationID:
		return openapi.BackgroundOperationLinks{
			Status:   "/api/background-operations/recurring-catch-up/status",
			StartRun: "/api/background-operations/recurring-catch-up/runs",
			Run:      "/api/background-operations/recurring-catch-up/runs/{operation_run_id}",
			Runs:     "/api/background-operations/runs?operation_id=recurring-catch-up",
		}
	default:
		return openapi.BackgroundOperationLinks{}
	}
}
