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
			OperationId: openapi.BackgroundOperationSummaryOperationId(operation.ID),
			StatusUrl:   operationStatusURL(operation.ID),
		})
	}

	return openapi.ListBackgroundOperations200JSONResponse(response), nil
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

func (s *strictServer) GetExchangeRateLoadingRun(
	ctx context.Context,
	request openapi.GetExchangeRateLoadingRunRequestObject,
) (openapi.GetExchangeRateLoadingRunResponseObject, error) {
	run, err := s.deps.Operations.GetExchangeRateLoadingRun(ctx, request.OperationRunId)
	if err != nil {
		return nil, err
	}

	return openapi.GetExchangeRateLoadingRun200JSONResponse{
		OperationRunId: run.ID,
		OperationId:    openapi.OperationRunResponseOperationId(run.OperationID),
		Status:         operationRunStatus(run.Status),
		StartedAt:      run.StartedAt,
		CompletedAt:    run.CompletedAt,
		Error:          run.Error,
	}, nil
}

func (s *strictServer) GetDatabaseBackupRun(
	ctx context.Context,
	request openapi.GetDatabaseBackupRunRequestObject,
) (openapi.GetDatabaseBackupRunResponseObject, error) {
	run, err := s.deps.Operations.GetDatabaseBackupRun(ctx, request.OperationRunId)
	if err != nil {
		return nil, err
	}

	return openapi.GetDatabaseBackupRun200JSONResponse{
		OperationRunId: run.ID,
		OperationId:    openapi.OperationRunResponseOperationId(run.OperationID),
		Status:         operationRunStatus(run.Status),
		StartedAt:      run.StartedAt,
		CompletedAt:    run.CompletedAt,
		Error:          run.Error,
	}, nil
}

func operationRunStatus(status operationruns.RunStatus) openapi.OperationRunResponseStatus {
	return openapi.OperationRunResponseStatus(status)
}

func exchangeRateLoadingRunURL(runID int64) string {
	return fmt.Sprintf("/api/background-operations/exchange-rate-loading/runs/%d", runID)
}

func databaseBackupRunURL(runID int64) string {
	return fmt.Sprintf("/api/background-operations/database-backup/runs/%d", runID)
}

func operationStatusURL(operationID operationruns.OperationID) string {
	switch operationID {
	case operationruns.ExchangeRateLoadingOperationID:
		return "/api/background-operations/exchange-rate-loading/status"
	case operationruns.DatabaseBackupOperationID:
		return "/api/background-operations/database-backup/status"
	default:
		return ""
	}
}
