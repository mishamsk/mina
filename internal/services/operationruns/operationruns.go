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

// OperationRun describes one operation invocation.
type OperationRun struct {
	ID          int64
	OperationID OperationID
	Status      RunStatus
	StartedAt   time.Time
	CompletedAt *time.Time
	Error       *string
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
	CreateRun(context.Context, OperationRun) (OperationRun, error)
	GetRun(context.Context, int64) (OperationRun, error)
	FinishRun(context.Context, OperationRun) error
	RunStats(context.Context, OperationID) (int64, *OperationRun, bool, error)
}

// Trigger starts a registered operation through the background boundary.
type Trigger interface {
	// Trigger returns an already recorded OperationRun.
	Trigger(context.Context, OperationID) (OperationRun, error)
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
	return []OperationSummary{
		{
			ID: ExchangeRateLoadingOperationID,
		},
		{
			ID: DatabaseBackupOperationID,
		},
	}, nil
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
func (s *Service) TriggerExchangeRateLoadingOperation(ctx context.Context) (OperationRun, error) {
	if s.trigger == nil {
		return OperationRun{}, services.InvalidRequest("background operation trigger is not configured")
	}

	return s.trigger.Trigger(ctx, ExchangeRateLoadingOperationID)
}

// TriggerDatabaseBackupOperation triggers one asynchronous database backup operation.
func (s *Service) TriggerDatabaseBackupOperation(ctx context.Context) (OperationRun, error) {
	if !s.config.DatabaseBackup.Enabled {
		return OperationRun{}, services.InvalidRequest("backup file directory is not configured")
	}
	if s.trigger == nil {
		return OperationRun{}, services.InvalidRequest("background operation trigger is not configured")
	}

	return s.trigger.Trigger(ctx, DatabaseBackupOperationID)
}

// GetExchangeRateLoadingRun returns one exchange-rate loading operation run.
func (s *Service) GetExchangeRateLoadingRun(ctx context.Context, runID int64) (OperationRun, error) {
	return s.getRun(ctx, ExchangeRateLoadingOperationID, runID)
}

// GetDatabaseBackupRun returns one database backup operation run.
func (s *Service) GetDatabaseBackupRun(ctx context.Context, runID int64) (OperationRun, error) {
	return s.getRun(ctx, DatabaseBackupOperationID, runID)
}

func (s *Service) getRun(ctx context.Context, operationID OperationID, runID int64) (OperationRun, error) {
	run, err := s.repo.GetRun(ctx, runID)
	if err != nil {
		if errors.Is(err, services.ErrNotFound) {
			return OperationRun{}, services.NotFound("operation run not found")
		}
		return OperationRun{}, err
	}
	if run.OperationID != operationID {
		return OperationRun{}, services.NotFound("operation run not found")
	}

	return run, nil
}

// RecordRunStart records one running operation attempt.
func (s *Service) RecordRunStart(ctx context.Context, operationID OperationID) (OperationRun, error) {
	run := OperationRun{
		OperationID: operationID,
		Status:      RunStatusRunning,
		StartedAt:   s.clock.Now().UTC(),
	}

	return s.repo.CreateRun(ctx, run)
}

// RecordRunSuccess records a successful terminal transition.
func (s *Service) RecordRunSuccess(ctx context.Context, started OperationRun) (OperationRun, error) {
	return s.finishRun(ctx, started, RunStatusSucceeded, nil)
}

// RecordRunFailure records a failed terminal transition.
func (s *Service) RecordRunFailure(ctx context.Context, started OperationRun, err error) (OperationRun, error) {
	message := errorMessage(err)
	return s.finishRun(ctx, started, RunStatusFailed, message)
}

// RecordRunSkip records a skipped terminal attempt.
func (s *Service) RecordRunSkip(ctx context.Context, operationID OperationID, err error) (OperationRun, error) {
	message := errorMessage(err)
	run := OperationRun{
		OperationID: operationID,
		Status:      RunStatusSkipped,
		StartedAt:   s.clock.Now().UTC(),
		CompletedAt: ptr(s.clock.Now().UTC()),
		Error:       message,
	}

	return s.repo.CreateRun(ctx, run)
}

// RecordRunCancel records a canceled terminal transition.
func (s *Service) RecordRunCancel(ctx context.Context, started OperationRun, err error) (OperationRun, error) {
	message := errorMessage(err)
	return s.finishRun(ctx, started, RunStatusCanceled, message)
}

func (s *Service) finishRun(
	ctx context.Context,
	started OperationRun,
	status RunStatus,
	message *string,
) (OperationRun, error) {
	completedAt := s.clock.Now().UTC()
	run := OperationRun{
		ID:          started.ID,
		OperationID: started.OperationID,
		Status:      status,
		StartedAt:   started.StartedAt,
		CompletedAt: &completedAt,
		Error:       message,
	}
	if err := s.repo.FinishRun(ctx, run); err != nil {
		return OperationRun{}, err
	}

	return run, nil
}

func state(running bool) string {
	if running {
		return "running"
	}

	return "idle"
}

func latestRunFields(latest *OperationRun) (*time.Time, *time.Time, *bool, *string) {
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
