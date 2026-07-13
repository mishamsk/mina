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
	StartedAt   time.Time
	CompletedAt *time.Time
	Error       *string
}

type operationRunRepository struct {
	db    *AppDB
	appID string
}

// NewOperationRunRepository creates operation-run persistence for one app instance.
func NewOperationRunRepository(ctx context.Context, db *AppDB) (operationruns.Repository, error) {
	repo := &operationRunRepository{
		db:    db,
		appID: newOperationAppID(db),
	}
	if err := repo.prepare(ctx); err != nil {
		return nil, err
	}

	return repo, nil
}

func (r *operationRunRepository) CreateRun(ctx context.Context, run operationruns.OperationRun) (operationruns.OperationRun, error) {
	runID, err := r.createRun(ctx, operationRunToRow(run))
	if err != nil {
		return operationruns.OperationRun{}, err
	}

	run.ID = runID

	return run, nil
}

func (r *operationRunRepository) GetRun(ctx context.Context, runID int64) (operationruns.OperationRun, error) {
	row, err := r.getRun(ctx, runID)
	if err != nil {
		return operationruns.OperationRun{}, mapOperationStoreError(err)
	}

	return operationRunFromRow(row), nil
}

func (r *operationRunRepository) ListRuns(
	ctx context.Context,
	operationID operationruns.OperationID,
	opts operationruns.ListRunsOptions,
) (services.PaginatedList[operationruns.OperationRun], error) {
	var totalCount int64
	if err := r.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM `+operationRunTable()+`
WHERE app_id = ? AND operation_id = ?`,
		r.appID,
		operationID,
	).Scan(&totalCount); err != nil {
		return services.PaginatedList[operationruns.OperationRun]{}, fmt.Errorf("count operation runs: %w", err)
	}

	query := `SELECT operation_run_id, operation_id, status, started_at, completed_at, error
FROM ` + operationRunTable() + `
WHERE app_id = ? AND operation_id = ?
ORDER BY started_at DESC, operation_run_id DESC`
	args := []any{r.appID, operationID}
	query, args = appendLimitOffset(query, args, opts.Limit, opts.Offset)

	rows, err := r.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[operationruns.OperationRun]{}, fmt.Errorf("list operation runs: %w", err)
	}

	runs := []operationruns.OperationRun{}
	for rows.Next() {
		row := operationRunRow{}
		if err := rows.Scan(
			&row.RunID,
			&row.OperationID,
			&row.Status,
			&row.StartedAt,
			&row.CompletedAt,
			&row.Error,
		); err != nil {
			return services.PaginatedList[operationruns.OperationRun]{}, fmt.Errorf("scan operation run: %w", err)
		}
		runs = append(runs, operationRunFromRow(row))
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[operationruns.OperationRun]{}, fmt.Errorf("iterate operation runs: %w; close operation run rows: %w", err, closeErr)
		}
		return services.PaginatedList[operationruns.OperationRun]{}, fmt.Errorf("iterate operation runs: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[operationruns.OperationRun]{}, fmt.Errorf("close operation run rows: %w", err)
	}

	return services.PaginatedList[operationruns.OperationRun]{
		Items:      runs,
		TotalCount: totalCount,
	}, nil
}

func (r *operationRunRepository) FinishRun(ctx context.Context, run operationruns.OperationRun) error {
	if run.CompletedAt == nil {
		return fmt.Errorf("operation run %d is missing completed_at", run.ID)
	}

	return mapOperationStoreError(r.finishRun(ctx, operationRunToRow(run)))
}

func (r *operationRunRepository) RunStats(
	ctx context.Context,
	operationID operationruns.OperationID,
) (int64, *operationruns.OperationRun, bool, error) {
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

func operationRunFromRow(row operationRunRow) operationruns.OperationRun {
	return operationruns.OperationRun{
		ID:          row.RunID,
		OperationID: operationruns.OperationID(row.OperationID),
		Status:      operationruns.RunStatus(row.Status),
		StartedAt:   row.StartedAt,
		CompletedAt: row.CompletedAt,
		Error:       row.Error,
	}
}

func operationRunToRow(run operationruns.OperationRun) operationRunRow {
	return operationRunRow{
		RunID:       run.ID,
		OperationID: string(run.OperationID),
		Status:      string(run.Status),
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

func newOperationAppID(db *AppDB) string {
	return fmt.Sprintf("%p-%d", db, time.Now().UnixNano())
}

func (r *operationRunRepository) prepare(ctx context.Context) error {
	if _, err := r.db.query().ExecContext(
		ctx,
		"CREATE SCHEMA IF NOT EXISTS "+systemSchemaQualifiedName(),
	); err != nil {
		return fmt.Errorf("create system operation schema: %w", err)
	}

	if _, err := r.db.query().ExecContext(
		ctx,
		`CREATE TYPE IF NOT EXISTS `+operationRunStatusType()+` AS ENUM (
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
		`CREATE SEQUENCE IF NOT EXISTS `+operationRunSequenceNameQualified()+` START 1`,
	); err != nil {
		return fmt.Errorf("create operation run sequence: %w", err)
	}

	if _, err := r.db.query().ExecContext(
		ctx,
		`CREATE TABLE IF NOT EXISTS `+operationRunTable()+` (
	app_id TEXT NOT NULL,
	operation_run_id BIGINT NOT NULL,
	operation_id TEXT NOT NULL,
	status `+operationRunStatusType()+` NOT NULL,
	started_at TIMESTAMP NOT NULL,
	completed_at TIMESTAMP,
	error TEXT,
	PRIMARY KEY (app_id, operation_run_id)
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
		`INSERT INTO `+operationRunTable()+` (
	app_id,
	operation_run_id,
	operation_id,
	status,
	started_at,
	completed_at,
	error
) VALUES (?, `+operationRunSequenceNextVal()+`, ?, ?, ?, ?, ?)
RETURNING operation_run_id`,
		r.appID,
		row.OperationID,
		row.Status,
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
		`SELECT operation_run_id, operation_id, status, started_at, completed_at, error
FROM `+operationRunTable()+`
WHERE app_id = ? AND operation_run_id = ?`,
		r.appID,
		runID,
	).Scan(
		&row.RunID,
		&row.OperationID,
		&row.Status,
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
		`UPDATE `+operationRunTable()+`
SET status = ?, completed_at = ?, error = ?
WHERE app_id = ? AND operation_run_id = ?`,
		row.Status,
		row.CompletedAt,
		row.Error,
		r.appID,
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
FROM `+operationRunTable()+`
WHERE app_id = ? AND operation_id = ? AND status = 'running'`,
		r.appID,
		operationID,
	).Scan(&runningCount); err != nil {
		return 0, nil, false, fmt.Errorf("count running operation runs: %w", err)
	}

	var count int64
	if err := r.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM `+operationRunTable()+`
WHERE app_id = ? AND operation_id = ? AND status != 'running'`,
		r.appID,
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
		`SELECT operation_run_id, operation_id, status, started_at, completed_at, error
FROM `+operationRunTable()+`
WHERE app_id = ? AND operation_id = ? AND status != 'running'
ORDER BY completed_at DESC, operation_run_id DESC
LIMIT 1`,
		r.appID,
		operationID,
	).Scan(
		&row.RunID,
		&row.OperationID,
		&row.Status,
		&row.StartedAt,
		&row.CompletedAt,
		&row.Error,
	); err != nil {
		return 0, nil, false, fmt.Errorf("read latest operation run: %w", err)
	}

	return count, &row, runningCount > 0, nil
}

func operationRunStatusType() string {
	return systemSchemaObjectName(operationRunStatusTypeName)
}

func operationRunSequenceNameQualified() string {
	return systemSchemaObjectName(operationRunSequenceName)
}

func operationRunSequenceNextVal() string {
	return "nextval('memory._mina_internal." + operationRunSequenceName + "')"
}

func operationRunTable() string {
	return systemSchemaObjectName(operationRunTableName)
}
