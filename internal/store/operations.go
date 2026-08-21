package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/operationruns"
)

const (
	operationRunStatusTypeName = "operation_run_status"
	operationRunSequenceName   = "operation_run_id_sequence"
	operationRunTableName      = "operation_runs"
)

type operationRunRow struct {
	RunID       int64
	OperationID string
	Status      string
	Trigger     string
	StartedAt   time.Time
	CompletedAt *time.Time
	Error       *string
}

type operationRunRepository struct {
	db *AppDB
}

// NewOperationRunRepository creates operation-run persistence for one app instance.
func NewOperationRunRepository(ctx context.Context, db *AppDB) (operationruns.Repository, error) {
	repo := &operationRunRepository{db: db}
	if err := repo.prepare(ctx); err != nil {
		return nil, err
	}

	return repo, nil
}

func (r *operationRunRepository) CreateRun(ctx context.Context, run operationruns.RunEnvelope) (operationruns.RunEnvelope, error) {
	runID, err := r.createRun(ctx, operationRunToRow(run))
	if err != nil {
		return operationruns.RunEnvelope{}, err
	}

	run.ID = runID

	return run, nil
}

func (r *operationRunRepository) GetRun(ctx context.Context, runID int64) (operationruns.RunEnvelope, error) {
	row, err := r.getRun(ctx, runID)
	if err != nil {
		return operationruns.RunEnvelope{}, mapOperationStoreError(err)
	}

	return operationRunFromRow(row), nil
}

func (r *operationRunRepository) ListRunEnvelopes(
	ctx context.Context,
	operationID *operationruns.OperationID,
	opts operationruns.ListRunsOptions,
) (services.PaginatedList[operationruns.RunEnvelope], error) {
	where := ""
	args := []any{}
	if operationID != nil {
		where = "WHERE operation_id = ?"
		args = append(args, *operationID)
	}

	var totalCount int64
	if err := r.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM `+r.db.runtimeName(operationRunTableName)+`
`+where,
		args...,
	).Scan(&totalCount); err != nil {
		return services.PaginatedList[operationruns.RunEnvelope]{}, fmt.Errorf("count operation runs: %w", err)
	}

	query := `SELECT operation_run_id, operation_id, status, trigger, started_at, completed_at, error
FROM ` + r.db.runtimeName(operationRunTableName) + `
` + where + `
ORDER BY started_at DESC, operation_run_id DESC`
	query, args = appendLimitOffset(query, args, opts.Limit, opts.Offset)

	rows, err := r.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[operationruns.RunEnvelope]{}, fmt.Errorf("list operation runs: %w", err)
	}

	runs := []operationruns.RunEnvelope{}
	for rows.Next() {
		row := operationRunRow{}
		if err := rows.Scan(
			&row.RunID,
			&row.OperationID,
			&row.Status,
			&row.Trigger,
			&row.StartedAt,
			&row.CompletedAt,
			&row.Error,
		); err != nil {
			return services.PaginatedList[operationruns.RunEnvelope]{}, fmt.Errorf("scan operation run: %w", err)
		}
		runs = append(runs, operationRunFromRow(row))
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[operationruns.RunEnvelope]{}, fmt.Errorf("iterate operation runs: %w; close operation run rows: %w", err, closeErr)
		}
		return services.PaginatedList[operationruns.RunEnvelope]{}, fmt.Errorf("iterate operation runs: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[operationruns.RunEnvelope]{}, fmt.Errorf("close operation run rows: %w", err)
	}

	return services.PaginatedList[operationruns.RunEnvelope]{
		Items:      runs,
		TotalCount: totalCount,
	}, nil
}

func (r *operationRunRepository) FinishRun(ctx context.Context, run operationruns.RunEnvelope) error {
	if run.CompletedAt == nil {
		return fmt.Errorf("operation run %d is missing completed_at", run.ID)
	}

	return mapOperationStoreError(r.finishRun(ctx, operationRunToRow(run)))
}

func (r *operationRunRepository) RunStats(
	ctx context.Context,
	operationID operationruns.OperationID,
) (int64, *operationruns.RunEnvelope, bool, error) {
	count, row, running, err := r.runStats(ctx, string(operationID))
	if err != nil {
		return 0, nil, false, mapOperationStoreError(err)
	}
	if row == nil {
		return count, nil, running, nil
	}
	run := operationRunFromRow(*row)

	return count, &run, running, nil
}

func operationRunFromRow(row operationRunRow) operationruns.RunEnvelope {
	return operationruns.RunEnvelope{
		ID:          row.RunID,
		OperationID: operationruns.OperationID(row.OperationID),
		Status:      operationruns.RunStatus(row.Status),
		Trigger:     operationruns.RunTrigger(row.Trigger),
		StartedAt:   row.StartedAt,
		CompletedAt: row.CompletedAt,
		Error:       row.Error,
	}
}

func operationRunToRow(run operationruns.RunEnvelope) operationRunRow {
	return operationRunRow{
		RunID:       run.ID,
		OperationID: string(run.OperationID),
		Status:      string(run.Status),
		Trigger:     string(run.Trigger),
		StartedAt:   run.StartedAt,
		CompletedAt: run.CompletedAt,
		Error:       run.Error,
	}
}

func mapOperationStoreError(err error) error {
	if errors.Is(err, ErrNotFound) {
		return services.ErrNotFound
	}

	return err
}

func (r *operationRunRepository) prepare(ctx context.Context) error {
	if _, err := r.db.query().ExecContext(
		ctx,
		`CREATE TYPE IF NOT EXISTS `+r.db.runtimeName(operationRunStatusTypeName)+` AS ENUM (
	'running',
	'succeeded',
	'failed',
	'skipped',
	'canceled'
)`,
	); err != nil {
		return fmt.Errorf("create operation run status type: %w", err)
	}

	if _, err := r.db.query().ExecContext(
		ctx,
		`CREATE SEQUENCE IF NOT EXISTS `+r.db.runtimeName(operationRunSequenceName)+` START 1`,
	); err != nil {
		return fmt.Errorf("create operation run sequence: %w", err)
	}

	if _, err := r.db.query().ExecContext(
		ctx,
		`CREATE TABLE IF NOT EXISTS `+r.db.runtimeName(operationRunTableName)+` (
	operation_run_id BIGINT NOT NULL,
	operation_id TEXT NOT NULL,
	status `+r.db.runtimeName(operationRunStatusTypeName)+` NOT NULL,
	trigger TEXT NOT NULL,
	started_at TIMESTAMP WITH TIME ZONE NOT NULL,
	completed_at TIMESTAMP WITH TIME ZONE,
	error TEXT,
	PRIMARY KEY (operation_run_id)
)`,
	); err != nil {
		return fmt.Errorf("create operation run table: %w", err)
	}

	return nil
}

func (r *operationRunRepository) createRun(ctx context.Context, row operationRunRow) (int64, error) {
	var runID int64
	if err := r.db.query().QueryRowContext(
		ctx,
		`INSERT INTO `+r.db.runtimeName(operationRunTableName)+` (
	operation_run_id,
	operation_id,
	status,
	trigger,
	started_at,
	completed_at,
	error
) VALUES (`+r.db.runtimeSequenceNextVal(operationRunSequenceName)+`, ?, ?, ?, ?, ?, ?)
RETURNING operation_run_id`,
		row.OperationID,
		row.Status,
		row.Trigger,
		row.StartedAt,
		row.CompletedAt,
		row.Error,
	).Scan(&runID); err != nil {
		return 0, fmt.Errorf("create operation run: %w", err)
	}

	return runID, nil
}

func (r *operationRunRepository) getRun(ctx context.Context, runID int64) (operationRunRow, error) {
	row := operationRunRow{}
	if err := r.db.query().QueryRowContext(
		ctx,
		`SELECT operation_run_id, operation_id, status, trigger, started_at, completed_at, error
FROM `+r.db.runtimeName(operationRunTableName)+`
WHERE operation_run_id = ?`,
		runID,
	).Scan(
		&row.RunID,
		&row.OperationID,
		&row.Status,
		&row.Trigger,
		&row.StartedAt,
		&row.CompletedAt,
		&row.Error,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return operationRunRow{}, ErrNotFound
		}
		return operationRunRow{}, fmt.Errorf("get operation run: %w", err)
	}

	return row, nil
}

func (r *operationRunRepository) finishRun(ctx context.Context, row operationRunRow) error {
	result, err := r.db.query().ExecContext(
		ctx,
		`UPDATE `+r.db.runtimeName(operationRunTableName)+`
SET status = ?, completed_at = ?, error = ?
WHERE operation_run_id = ?`,
		row.Status,
		row.CompletedAt,
		row.Error,
		row.RunID,
	)
	if err != nil {
		return fmt.Errorf("finish operation run: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("finish operation run affected rows: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *operationRunRepository) runStats(ctx context.Context, operationID string) (int64, *operationRunRow, bool, error) {
	var runningCount int64
	if err := r.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM `+r.db.runtimeName(operationRunTableName)+`
WHERE operation_id = ? AND status = 'running'`,
		operationID,
	).Scan(&runningCount); err != nil {
		return 0, nil, false, fmt.Errorf("count running operation runs: %w", err)
	}

	var count int64
	if err := r.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM `+r.db.runtimeName(operationRunTableName)+`
WHERE operation_id = ? AND status != 'running'`,
		operationID,
	).Scan(&count); err != nil {
		return 0, nil, false, fmt.Errorf("count operation runs: %w", err)
	}
	if count == 0 {
		return 0, nil, runningCount > 0, nil
	}

	row := operationRunRow{}
	if err := r.db.query().QueryRowContext(
		ctx,
		`SELECT operation_run_id, operation_id, status, trigger, started_at, completed_at, error
FROM `+r.db.runtimeName(operationRunTableName)+`
WHERE operation_id = ? AND status != 'running'
ORDER BY completed_at DESC, operation_run_id DESC
LIMIT 1`,
		operationID,
	).Scan(
		&row.RunID,
		&row.OperationID,
		&row.Status,
		&row.Trigger,
		&row.StartedAt,
		&row.CompletedAt,
		&row.Error,
	); err != nil {
		return 0, nil, false, fmt.Errorf("read latest operation run: %w", err)
	}

	return count, &row, runningCount > 0, nil
}
