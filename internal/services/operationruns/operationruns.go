package operationruns

import (
	"context"
	"errors"
	"time"

	"github.com/mishamsk/mina/internal/services"
)

// OperationID identifies a registered background operation.
type OperationID string

const (
	// ExchangeRateLoadingOperationID identifies automatic and manual exchange-rate loading.
	ExchangeRateLoadingOperationID OperationID = "exchange-rate-loading"
	// DatabaseBackupOperationID identifies automatic and manual database backups.
	DatabaseBackupOperationID OperationID = "database-backup"
)

// RunStatus is the observable lifecycle state of one operation invocation.
type RunStatus string

const (
	// RunStatusRunning means the invocation is currently executing.
	RunStatusRunning RunStatus = "running"
	// RunStatusSucceeded means the invocation finished successfully.
	RunStatusSucceeded RunStatus = "succeeded"
	// RunStatusFailed means the invocation finished with an error.
	RunStatusFailed RunStatus = "failed"
	// RunStatusSkipped means the invocation did not run because the operation was already active.
	RunStatusSkipped RunStatus = "skipped"
	// RunStatusCanceled means the invocation stopped because its context was canceled.
	RunStatusCanceled RunStatus = "canceled"
)

// OperationSummary is the list representation of a registered operation.
type OperationSummary struct {
	ID OperationID
}

// ExchangeRateLoadingStatus is the public status for exchange-rate loading.
type ExchangeRateLoadingStatus struct {
	ID                   OperationID
	Enabled              bool
	ScheduleUTC          string
	State                string
	LastStartedAt        *time.Time
	LastCompletedAt      *time.Time
	LastSuccess          *bool
	LastError            *string
	RunCount             int64
	CompletedRunRevision int64
}

// DatabaseBackupStatus is the public status for database backups.
type DatabaseBackupStatus struct {
	ID                   OperationID
	Enabled              bool
	ScheduleUTC          string
	State                string
	LastStartedAt        *time.Time
	LastCompletedAt      *time.Time
	LastSuccess          *bool
	LastError            *string
	RunCount             int64
	CompletedRunRevision int64
}

// RunTrigger identifies how one operation invocation was initiated.
type RunTrigger string

const (
	// RunTriggerManual identifies an invocation started through a concrete manual API.
	RunTriggerManual RunTrigger = "manual"
	// RunTriggerStartup identifies an invocation started during runtime startup.
	RunTriggerStartup RunTrigger = "startup"
	// RunTriggerScheduled identifies an invocation started by its configured schedule.
	RunTriggerScheduled RunTrigger = "scheduled"
)

// RunEnvelope describes fields shared by every operation invocation.
type RunEnvelope struct {
	ID          int64
	OperationID OperationID
	Status      RunStatus
	Trigger     RunTrigger
	StartedAt   time.Time
	CompletedAt *time.Time
	Error       *string
}

// ExchangeRateLoadingRun is the concrete exchange-rate loading run detail.
type ExchangeRateLoadingRun struct {
	RunEnvelope
}

// DatabaseBackupRun is the concrete database backup run detail.
type DatabaseBackupRun struct {
	RunEnvelope
}

// OperationConfig contains observable configuration for one registered operation.
type OperationConfig struct {
	Enabled     bool
	ScheduleUTC string
}

// Config contains observable configuration for registered operations.
type Config struct {
	ExchangeRateLoading OperationConfig
	DatabaseBackup      OperationConfig
}

// Repository stores background operation invocations.
type Repository interface {
	CreateRun(context.Context, RunEnvelope) (RunEnvelope, error)
	GetRun(context.Context, int64) (RunEnvelope, error)
	ListRunEnvelopes(context.Context, *OperationID, ListRunsOptions) (services.PaginatedList[RunEnvelope], error)
	FinishRun(context.Context, RunEnvelope) error
	RunStats(context.Context, OperationID) (int64, *RunEnvelope, bool, error)
}

// ListRunsOptions controls operation-run page position.
type ListRunsOptions struct {
	Limit  *int
	Offset int
}

// Trigger starts a registered operation through the background boundary.
type Trigger interface {
	// Trigger returns an already recorded run envelope.
	Trigger(context.Context, OperationID) (RunEnvelope, error)
}

// Clock returns the current process time.
type Clock interface {
	Now() time.Time
}

// Service owns operation observability use cases and run status transitions.
type Service struct {
	config  Config
	repo    Repository
	clock   Clock
	trigger Trigger
}

// NewService creates an operation-run service.
func NewService(config Config, repo Repository, clock Clock) *Service {
	return &Service{
		config: config,
		repo:   repo,
		clock:  clock,
	}
}

// SetTrigger connects manual operation starts to the background runner.
func (s *Service) SetTrigger(trigger Trigger) {
	s.trigger = trigger
}

// List returns registered operations.
func (s *Service) List(context.Context) ([]OperationSummary, error) {
	operations := s.registeredOperations()
	summaries := make([]OperationSummary, 0, len(operations))
	for _, operationID := range operations {
		summaries = append(summaries, OperationSummary{ID: operationID})
	}

	return summaries, nil
}

// ListRunEnvelopes returns one newest-first page of run envelopes, optionally filtered by operation.
func (s *Service) ListRunEnvelopes(
	ctx context.Context,
	operationID *OperationID,
	opts ListRunsOptions,
) (services.PaginatedList[RunEnvelope], error) {
	if operationID != nil && !s.registeredOperation(*operationID) {
		return services.PaginatedList[RunEnvelope]{}, services.InvalidRequest("operation_id is not registered")
	}
	if opts.Limit != nil && *opts.Limit <= 0 {
		return services.PaginatedList[RunEnvelope]{}, services.InvalidRequest("limit must be positive")
	}
	if opts.Offset < 0 {
		return services.PaginatedList[RunEnvelope]{}, services.InvalidRequest("offset must be non-negative")
	}

	return s.repo.ListRunEnvelopes(ctx, operationID, opts)
}

// ExchangeRateLoadingStatus returns exchange-rate loading operation status.
func (s *Service) ExchangeRateLoadingStatus(ctx context.Context) (ExchangeRateLoadingStatus, error) {
	count, latest, running, err := s.repo.RunStats(ctx, ExchangeRateLoadingOperationID)
	if err != nil {
		return ExchangeRateLoadingStatus{}, err
	}

	lastStartedAt, lastCompletedAt, lastSuccess, lastError := latestRunFields(latest)
	return ExchangeRateLoadingStatus{
		ID:                   ExchangeRateLoadingOperationID,
		Enabled:              s.config.ExchangeRateLoading.Enabled,
		ScheduleUTC:          s.config.ExchangeRateLoading.ScheduleUTC,
		State:                state(running),
		LastStartedAt:        lastStartedAt,
		LastCompletedAt:      lastCompletedAt,
		LastSuccess:          lastSuccess,
		LastError:            lastError,
		RunCount:             count,
		CompletedRunRevision: count,
	}, nil
}

// DatabaseBackupStatus returns database backup operation status.
func (s *Service) DatabaseBackupStatus(ctx context.Context) (DatabaseBackupStatus, error) {
	count, latest, running, err := s.repo.RunStats(ctx, DatabaseBackupOperationID)
	if err != nil {
		return DatabaseBackupStatus{}, err
	}

	lastStartedAt, lastCompletedAt, lastSuccess, lastError := latestRunFields(latest)
	return DatabaseBackupStatus{
		ID:                   DatabaseBackupOperationID,
		Enabled:              s.config.DatabaseBackup.Enabled,
		ScheduleUTC:          s.config.DatabaseBackup.ScheduleUTC,
		State:                state(running),
		LastStartedAt:        lastStartedAt,
		LastCompletedAt:      lastCompletedAt,
		LastSuccess:          lastSuccess,
		LastError:            lastError,
		RunCount:             count,
		CompletedRunRevision: count,
	}, nil
}

// TriggerExchangeRateLoadingOperation triggers one asynchronous exchange-rate loading operation.
func (s *Service) TriggerExchangeRateLoadingOperation(ctx context.Context) (RunEnvelope, error) {
	if s.trigger == nil {
		return RunEnvelope{}, services.InvalidRequest("background operation trigger is not configured")
	}

	return s.trigger.Trigger(ctx, ExchangeRateLoadingOperationID)
}

// TriggerDatabaseBackupOperation triggers one asynchronous database backup operation.
func (s *Service) TriggerDatabaseBackupOperation(ctx context.Context) (RunEnvelope, error) {
	if !s.config.DatabaseBackup.Enabled {
		return RunEnvelope{}, services.InvalidRequest("backup file directory is not configured")
	}
	if s.trigger == nil {
		return RunEnvelope{}, services.InvalidRequest("background operation trigger is not configured")
	}

	return s.trigger.Trigger(ctx, DatabaseBackupOperationID)
}

// GetExchangeRateLoadingRun returns one exchange-rate loading operation run.
func (s *Service) GetExchangeRateLoadingRun(ctx context.Context, runID int64) (ExchangeRateLoadingRun, error) {
	run, err := s.getRun(ctx, ExchangeRateLoadingOperationID, runID)
	if err != nil {
		return ExchangeRateLoadingRun{}, err
	}

	return ExchangeRateLoadingRun{RunEnvelope: run}, nil
}

// GetDatabaseBackupRun returns one database backup operation run.
func (s *Service) GetDatabaseBackupRun(ctx context.Context, runID int64) (DatabaseBackupRun, error) {
	run, err := s.getRun(ctx, DatabaseBackupOperationID, runID)
	if err != nil {
		return DatabaseBackupRun{}, err
	}

	return DatabaseBackupRun{RunEnvelope: run}, nil
}

func (s *Service) getRun(ctx context.Context, operationID OperationID, runID int64) (RunEnvelope, error) {
	run, err := s.repo.GetRun(ctx, runID)
	if err != nil {
		if errors.Is(err, services.ErrNotFound) {
			return RunEnvelope{}, services.NotFound("operation run not found")
		}
		return RunEnvelope{}, err
	}
	if run.OperationID != operationID {
		return RunEnvelope{}, services.NotFound("operation run not found")
	}

	return run, nil
}

func (s *Service) registeredOperation(operationID OperationID) bool {
	for _, registeredOperationID := range s.registeredOperations() {
		if operationID == registeredOperationID {
			return true
		}
	}

	return false
}

func (s *Service) registeredOperations() []OperationID {
	return []OperationID{
		ExchangeRateLoadingOperationID,
		DatabaseBackupOperationID,
	}
}

// RecordRunStart records one running operation attempt.
func (s *Service) RecordRunStart(ctx context.Context, operationID OperationID, trigger RunTrigger) (RunEnvelope, error) {
	run := RunEnvelope{
		OperationID: operationID,
		Status:      RunStatusRunning,
		Trigger:     trigger,
		StartedAt:   s.clock.Now().UTC(),
	}

	return s.repo.CreateRun(ctx, run)
}

// RecordRunSuccess records a successful terminal transition.
func (s *Service) RecordRunSuccess(ctx context.Context, started RunEnvelope) (RunEnvelope, error) {
	return s.finishRun(ctx, started, RunStatusSucceeded, nil)
}

// RecordRunFailure records a failed terminal transition.
func (s *Service) RecordRunFailure(ctx context.Context, started RunEnvelope, err error) (RunEnvelope, error) {
	message := errorMessage(err)
	return s.finishRun(ctx, started, RunStatusFailed, message)
}

// RecordRunSkip records a skipped terminal attempt.
func (s *Service) RecordRunSkip(ctx context.Context, operationID OperationID, trigger RunTrigger, err error) (RunEnvelope, error) {
	message := errorMessage(err)
	run := RunEnvelope{
		OperationID: operationID,
		Status:      RunStatusSkipped,
		Trigger:     trigger,
		StartedAt:   s.clock.Now().UTC(),
		CompletedAt: ptr(s.clock.Now().UTC()),
		Error:       message,
	}

	return s.repo.CreateRun(ctx, run)
}

// RecordRunCancel records a canceled terminal transition.
func (s *Service) RecordRunCancel(ctx context.Context, started RunEnvelope, err error) (RunEnvelope, error) {
	message := errorMessage(err)
	return s.finishRun(ctx, started, RunStatusCanceled, message)
}

func (s *Service) finishRun(
	ctx context.Context,
	started RunEnvelope,
	status RunStatus,
	message *string,
) (RunEnvelope, error) {
	completedAt := s.clock.Now().UTC()
	run := RunEnvelope{
		ID:          started.ID,
		OperationID: started.OperationID,
		Status:      status,
		Trigger:     started.Trigger,
		StartedAt:   started.StartedAt,
		CompletedAt: &completedAt,
		Error:       message,
	}
	if err := s.repo.FinishRun(ctx, run); err != nil {
		return RunEnvelope{}, err
	}

	return run, nil
}

func state(running bool) string {
	if running {
		return "running"
	}

	return "idle"
}

func latestRunFields(latest *RunEnvelope) (*time.Time, *time.Time, *bool, *string) {
	if latest == nil {
		return nil, nil, nil, nil
	}

	startedAt := latest.StartedAt
	success := latest.Status == RunStatusSucceeded
	return &startedAt, latest.CompletedAt, &success, latest.Error
}

func errorMessage(err error) *string {
	if err == nil {
		return nil
	}
	text := err.Error()
	return &text
}

func ptr(value time.Time) *time.Time {
	return &value
}
