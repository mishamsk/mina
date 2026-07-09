package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/recurring"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/values"
)

// RecurringStore persists recurring definitions and occurrences.
type RecurringStore struct {
	db *AppDB
}

var _ recurring.Repository = (*RecurringStore)(nil)

// NewRecurringStore creates a recurring store using AppDB.
func NewRecurringStore(db *AppDB) *RecurringStore {
	return &RecurringStore{db: db}
}

// Create persists a recurring definition and its complete record shape atomically.
func (s *RecurringStore) Create(ctx context.Context, input recurring.SaveInput) (recurring.Definition, error) {
	var definition recurring.Definition
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("recurring_definition")+` (fqn, schedule_rule, anchor_date)
VALUES (?, CAST(? AS JSON), ?)
RETURNING recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), CAST(schedule_class AS VARCHAR), anchor_date, definition_version, paused_at, CAST(NULL AS DATE), parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			string(input.ScheduleRule),
			civilDateArg(input.AnchorDate),
		)
		created, scanErr := scanRecurringDefinition(row)
		if scanErr != nil {
			if isUniqueConstraintError(scanErr) {
				return fmt.Errorf("%w: active recurring definition fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("insert recurring definition: %w", scanErr)
		}
		definition = created

		for _, record := range input.Records {
			if err := insertRecurringDefinitionRecord(ctx, tx, s.db, definition.ID, record); err != nil {
				return err
			}
		}
		records, err := recurringDefinitionRecordsByDefinitionIDs(ctx, tx, s.db, []int64{definition.ID})
		if err != nil {
			return err
		}
		definition.Records = records[definition.ID]

		return nil
	})
	if err != nil {
		return recurring.Definition{}, err
	}

	return definition, nil
}

// Get returns an active recurring definition with nested active records.
func (s *RecurringStore) Get(ctx context.Context, id int64) (recurring.Definition, error) {
	definition, err := scanRecurringDefinition(s.db.query().QueryRowContext(
		ctx,
		`SELECT recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), CAST(schedule_class AS VARCHAR), anchor_date, definition_version, paused_at,
	(SELECT MAX(o.scheduled_date) FROM `+s.db.accountingName("recurring_occurrence")+` AS o WHERE o.recurring_definition_id = d.recurring_definition_id),
	parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("recurring_definition")+` AS d
WHERE d.recurring_definition_id = ? AND d.tombstoned_at IS NULL`,
		id,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return recurring.Definition{}, services.ErrNotFound
	}
	if err != nil {
		return recurring.Definition{}, fmt.Errorf("get recurring definition: %w", err)
	}

	records, err := s.recordsByDefinitionIDs(ctx, []int64{id})
	if err != nil {
		return recurring.Definition{}, err
	}
	definition.Records = records[id]

	return definition, nil
}

// List returns active recurring definitions with nested active records.
func (s *RecurringStore) List(ctx context.Context, opts services.ListOptions) (services.PaginatedList[recurring.Definition], error) {
	filterQuery := `FROM ` + s.db.accountingName("recurring_definition") + `
WHERE tombstoned_at IS NULL`
	args := []any{}
	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+filterQuery, args, "recurring definitions", opts.IncludeTotalCount)
	if err != nil {
		return services.PaginatedList[recurring.Definition]{}, err
	}

	query := `SELECT recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), CAST(schedule_class AS VARCHAR), anchor_date, definition_version, paused_at,
	(SELECT MAX(o.scheduled_date) FROM ` + s.db.accountingName("recurring_occurrence") + ` AS o WHERE o.recurring_definition_id = recurring_definition.recurring_definition_id),
	parent_fqn, name, level, created_at, updated_at, tombstoned_at
` + filterQuery
	query, args = appendServiceListOrderAndPage(query, args, opts, recurringDefinitionSortColumns, services.SortKeyFQN, "recurring_definition_id")

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[recurring.Definition]{}, fmt.Errorf("list recurring definitions: %w", err)
	}

	definitions := []recurring.Definition{}
	definitionIDs := []int64{}
	for rows.Next() {
		definition, err := scanRecurringDefinition(rows)
		if err != nil {
			return services.PaginatedList[recurring.Definition]{}, fmt.Errorf("scan recurring definition: %w", err)
		}
		definitions = append(definitions, definition)
		definitionIDs = append(definitionIDs, definition.ID)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[recurring.Definition]{}, fmt.Errorf("iterate recurring definitions: %w; close recurring definition rows: %w", err, closeErr)
		}
		return services.PaginatedList[recurring.Definition]{}, fmt.Errorf("iterate recurring definitions: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[recurring.Definition]{}, fmt.Errorf("close recurring definition rows: %w", err)
	}

	records, err := s.recordsByDefinitionIDs(ctx, definitionIDs)
	if err != nil {
		return services.PaginatedList[recurring.Definition]{}, err
	}
	for index := range definitions {
		definitions[index].Records = records[definitions[index].ID]
	}

	return services.PaginatedList[recurring.Definition]{
		Items:      definitions,
		TotalCount: totalCount,
	}, nil
}

// ListActiveFQNs returns active recurring definition IDs and FQNs in deterministic FQN order.
func (s *RecurringStore) ListActiveFQNs(ctx context.Context) ([]recurring.ActiveFQN, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT recurring_definition_id, fqn
FROM `+s.db.accountingName("recurring_definition")+`
WHERE tombstoned_at IS NULL
ORDER BY fqn ASC, recurring_definition_id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list active recurring definition fqns: %w", err)
	}

	refs := []recurring.ActiveFQN{}
	for rows.Next() {
		var ref recurring.ActiveFQN
		if err := rows.Scan(&ref.ID, &ref.FQN); err != nil {
			return nil, fmt.Errorf("scan active recurring definition fqn: %w", err)
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate active recurring definition fqns: %w; close active recurring definition fqn rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate active recurring definition fqns: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close active recurring definition fqn rows: %w", err)
	}

	return refs, nil
}

// Replace atomically updates a recurring definition and replaces active record shapes.
func (s *RecurringStore) Replace(ctx context.Context, id int64, input recurring.SaveInput) (recurring.Definition, error) {
	var definition recurring.Definition
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`UPDATE `+s.db.accountingName("recurring_definition")+`
SET fqn = ?,
    schedule_rule = CAST(? AS JSON),
    anchor_date = ?,
    definition_version = definition_version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND tombstoned_at IS NULL
RETURNING recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), CAST(schedule_class AS VARCHAR), anchor_date, definition_version, paused_at,
	CAST(NULL AS DATE),
	parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			string(input.ScheduleRule),
			civilDateArg(input.AnchorDate),
			id,
		)
		replaced, scanErr := scanRecurringDefinition(row)
		if errors.Is(scanErr, sql.ErrNoRows) {
			return services.ErrNotFound
		}
		if scanErr != nil {
			if isUniqueConstraintError(scanErr) {
				return fmt.Errorf("%w: active recurring definition fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("update recurring definition: %w", scanErr)
		}
		var lastOccurrenceDate sql.NullTime
		if err := tx.QueryRowContext(
			ctx,
			`SELECT MAX(scheduled_date)
FROM `+s.db.accountingName("recurring_occurrence")+`
WHERE recurring_definition_id = ?`,
			id,
		).Scan(&lastOccurrenceDate); err != nil {
			return fmt.Errorf("read recurring definition last occurrence date: %w", err)
		}
		if lastOccurrenceDate.Valid {
			date := values.CivilDateFromTime(lastOccurrenceDate.Time)
			replaced.LastOccurrenceDate = &date
		}
		definition = replaced

		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("recurring_definition_record")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND tombstoned_at IS NULL`,
			id,
		); err != nil {
			return fmt.Errorf("tombstone replaced recurring definition records: %w", err)
		}

		for _, record := range input.Records {
			if err := insertRecurringDefinitionRecord(ctx, tx, s.db, definition.ID, record); err != nil {
				return err
			}
		}
		records, err := recurringDefinitionRecordsByDefinitionIDs(ctx, tx, s.db, []int64{definition.ID})
		if err != nil {
			return err
		}
		definition.Records = records[definition.ID]

		return nil
	})
	if err != nil {
		return recurring.Definition{}, err
	}

	return definition, nil
}

// Tombstone marks a recurring definition deleted. Record shapes are retained for history.
func (s *RecurringStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.query().ExecContext(
		ctx,
		`UPDATE `+s.db.accountingName("recurring_definition")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND tombstoned_at IS NULL`,
		id,
	)
	if err != nil {
		return fmt.Errorf("tombstone recurring definition: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read tombstone recurring definition affected rows: %w", err)
	}
	if affected == 0 {
		return services.ErrNotFound
	}

	return nil
}

// ListMaterializationDefinitions returns active non-paused definitions with their existing occurrence slots through today.
func (s *RecurringStore) ListMaterializationDefinitions(ctx context.Context, today values.CivilDate) ([]recurring.MaterializationDefinition, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), CAST(schedule_class AS VARCHAR), anchor_date, definition_version, paused_at,
	(SELECT MAX(o.scheduled_date) FROM `+s.db.accountingName("recurring_occurrence")+` AS o WHERE o.recurring_definition_id = d.recurring_definition_id),
	parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("recurring_definition")+` AS d
WHERE tombstoned_at IS NULL AND paused_at IS NULL
ORDER BY recurring_definition_id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list materializable recurring definitions: %w", err)
	}

	definitions := []recurring.MaterializationDefinition{}
	definitionIDs := []int64{}
	for rows.Next() {
		definition, err := scanRecurringDefinition(rows)
		if err != nil {
			return nil, fmt.Errorf("scan materializable recurring definition: %w", err)
		}
		definitions = append(definitions, recurring.MaterializationDefinition{Definition: definition})
		definitionIDs = append(definitionIDs, definition.ID)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate materializable recurring definitions: %w; close recurring definition rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate materializable recurring definitions: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close materializable recurring definition rows: %w", err)
	}

	records, err := s.recordsByDefinitionIDs(ctx, definitionIDs)
	if err != nil {
		return nil, err
	}
	occurrences, err := recurringOccurrenceDatesByDefinitionIDs(ctx, s.db.query(), s.db, definitionIDs, today)
	if err != nil {
		return nil, err
	}
	for index := range definitions {
		definitions[index].Records = records[definitions[index].ID]
		definitions[index].OccurrenceDates = occurrences[definitions[index].ID]
	}

	return definitions, nil
}

// CreateExpectedOccurrences atomically inserts a catch-up batch of EXPECTED occurrences and generated transactions.
func (s *RecurringStore) CreateExpectedOccurrences(ctx context.Context, inputs []recurring.ExpectedOccurrenceInput) error {
	return s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		for _, input := range inputs {
			if _, err := createOccurrenceWithTransactionTx(
				ctx,
				tx,
				s.db,
				input.Definition,
				input.ScheduledDate,
				input.ScheduledDate,
				recurring.OccurrenceStatusExpected,
				input.Records,
			); err != nil {
				if errors.Is(err, services.ErrConflict) || errors.Is(err, services.ErrNotFound) {
					continue
				}
				return err
			}
		}

		return nil
	})
}

// CreateConfirmedOccurrence atomically inserts a CONFIRMED occurrence and generated posted transaction.
func (s *RecurringStore) CreateConfirmedOccurrence(
	ctx context.Context,
	definition recurring.Definition,
	scheduledDate values.CivilDate,
	initiatedDate values.CivilDate,
	records []transactions.JournalRecordInput,
) (recurring.Occurrence, error) {
	posted := postedJournalRecords(records)
	return s.createOccurrenceWithTransaction(ctx, definition, scheduledDate, initiatedDate, recurring.OccurrenceStatusConfirmed, posted)
}

func (s *RecurringStore) createOccurrenceWithTransaction(
	ctx context.Context,
	definition recurring.Definition,
	scheduledDate values.CivilDate,
	initiatedDate values.CivilDate,
	status recurring.OccurrenceStatus,
	records []transactions.JournalRecordInput,
) (recurring.Occurrence, error) {
	var occurrence recurring.Occurrence
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		created, err := createOccurrenceWithTransactionTx(ctx, tx, s.db, definition, scheduledDate, initiatedDate, status, records)
		if err != nil {
			return err
		}
		occurrence = created

		return nil
	})
	if err != nil {
		return recurring.Occurrence{}, err
	}

	return occurrence, nil
}

func createOccurrenceWithTransactionTx(
	ctx context.Context,
	tx *sql.Tx,
	db *AppDB,
	definition recurring.Definition,
	scheduledDate values.CivilDate,
	initiatedDate values.CivilDate,
	status recurring.OccurrenceStatus,
	records []transactions.JournalRecordInput,
) (recurring.Occurrence, error) {
	occurrence, err := scanRecurringOccurrence(tx.QueryRowContext(
		ctx,
		`INSERT INTO `+db.accountingName("recurring_occurrence")+` (
	recurring_definition_id, scheduled_date, status, materialized_definition_version, reviewed_at
)
SELECT ?, ?, CAST(? AS `+db.accountingName("recurring_occurrence_status")+`), ?, CASE WHEN ? = 'EXPECTED' THEN NULL ELSE CURRENT_TIMESTAMP END
WHERE EXISTS (
	SELECT 1
	FROM `+db.accountingName("recurring_definition")+`
	WHERE recurring_definition_id = ?
	  AND tombstoned_at IS NULL
	  AND paused_at IS NULL
)
RETURNING recurring_occurrence_id, recurring_definition_id, scheduled_date, CAST(status AS VARCHAR), materialized_definition_version,
	materialized_at, reviewed_at, CAST(NULL AS BIGINT), created_at, updated_at`,
		definition.ID,
		civilDateArg(scheduledDate),
		enumValue(status),
		definition.DefinitionVersion,
		enumValue(status),
		definition.ID,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return recurring.Occurrence{}, services.ErrNotFound
	}
	if err != nil {
		if isUniqueConstraintError(err) {
			return recurring.Occurrence{}, services.ErrConflict
		}
		return recurring.Occurrence{}, fmt.Errorf("insert recurring occurrence: %w", err)
	}

	transaction, err := insertGeneratedRecurringTransaction(ctx, tx, db, occurrence.ID, initiatedDate, records)
	if err != nil {
		return recurring.Occurrence{}, err
	}
	occurrence.GeneratedTransactionID = &transaction.ID

	return occurrence, nil
}

// ListOccurrences returns recurring occurrence rows with generated transaction IDs.
func (s *RecurringStore) ListOccurrences(ctx context.Context, opts recurring.OccurrenceListOptions) (services.PaginatedList[recurring.Occurrence], error) {
	filterQuery := `FROM ` + s.db.accountingName("recurring_occurrence") + ` AS o
LEFT JOIN ` + s.db.accountingName("transaction") + ` AS t
  ON t.recurring_occurrence_id = o.recurring_occurrence_id
WHERE 1 = 1`
	args := []any{}
	if opts.RecurringDefinitionID != nil {
		filterQuery += " AND o.recurring_definition_id = ?"
		args = append(args, *opts.RecurringDefinitionID)
	}
	if len(opts.Statuses) > 0 {
		filterQuery += " AND o.status IN ("
		for index, status := range opts.Statuses {
			if index > 0 {
				filterQuery += ", "
			}
			filterQuery += "CAST(? AS " + s.db.accountingName("recurring_occurrence_status") + ")"
			args = append(args, enumValue(status))
		}
		filterQuery += ")"
	}

	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+filterQuery, args, "recurring occurrences", opts.IncludeTotalCount)
	if err != nil {
		return services.PaginatedList[recurring.Occurrence]{}, err
	}

	query := `SELECT o.recurring_occurrence_id, o.recurring_definition_id, o.scheduled_date, CAST(o.status AS VARCHAR), o.materialized_definition_version,
	o.materialized_at, o.reviewed_at, t.transaction_id, o.created_at, o.updated_at
` + filterQuery
	query, args = appendServiceListOrderAndPage(query, args, opts.ListOptions, recurringOccurrenceSortColumns, services.SortKeyScheduledDate, "o.recurring_occurrence_id")

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[recurring.Occurrence]{}, fmt.Errorf("list recurring occurrences: %w", err)
	}
	occurrences := []recurring.Occurrence{}
	for rows.Next() {
		occurrence, err := scanRecurringOccurrence(rows)
		if err != nil {
			return services.PaginatedList[recurring.Occurrence]{}, fmt.Errorf("scan recurring occurrence: %w", err)
		}
		occurrences = append(occurrences, occurrence)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[recurring.Occurrence]{}, fmt.Errorf("iterate recurring occurrences: %w; close recurring occurrence rows: %w", err, closeErr)
		}
		return services.PaginatedList[recurring.Occurrence]{}, fmt.Errorf("iterate recurring occurrences: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[recurring.Occurrence]{}, fmt.Errorf("close recurring occurrence rows: %w", err)
	}

	return services.PaginatedList[recurring.Occurrence]{
		Items:      occurrences,
		TotalCount: totalCount,
	}, nil
}

// ConfirmOccurrence posts an EXPECTED occurrence's generated transaction records.
func (s *RecurringStore) ConfirmOccurrence(ctx context.Context, id int64) (recurring.Occurrence, error) {
	var occurrence recurring.Occurrence
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		current, err := selectRecurringOccurrenceByID(ctx, tx, s.db, id)
		if err != nil {
			return err
		}
		if current.Status != recurring.OccurrenceStatusExpected {
			return services.ErrConflict
		}
		if current.GeneratedTransactionID == nil {
			return services.ErrConflict
		}
		result, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("journal_record")+`
SET posting_status = CAST(? AS `+s.db.accountingName("posting_status")+`),
    posted_date = pending_date,
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_id = ?
  AND tombstoned_at IS NULL
  AND posting_status = CAST(? AS `+s.db.accountingName("posting_status")+`)
  AND source = CAST(? AS `+s.db.accountingName("source")+`)`,
			enumValue(transactions.PostingStatusPosted),
			*current.GeneratedTransactionID,
			enumValue(transactions.PostingStatusExpected),
			enumValue(transactions.SourceRecurringTemplate),
		)
		if err != nil {
			return fmt.Errorf("confirm recurring occurrence journal records: %w", err)
		}
		updated, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("confirm recurring occurrence journal records affected rows: %w", err)
		}
		if updated == 0 {
			return services.ErrConflict
		}
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("recurring_occurrence")+`
SET status = CAST(? AS `+s.db.accountingName("recurring_occurrence_status")+`),
    reviewed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE recurring_occurrence_id = ?`,
			enumValue(recurring.OccurrenceStatusConfirmed),
			id,
		); err != nil {
			return fmt.Errorf("confirm recurring occurrence: %w", err)
		}
		confirmed, err := selectRecurringOccurrenceByID(ctx, tx, s.db, id)
		if err != nil {
			return err
		}
		occurrence = confirmed

		return nil
	})
	if err != nil {
		return recurring.Occurrence{}, err
	}

	return occurrence, nil
}

// DismissOccurrence tombstones an EXPECTED occurrence's generated transaction and marks the slot dismissed.
func (s *RecurringStore) DismissOccurrence(ctx context.Context, id int64) (recurring.Occurrence, error) {
	var occurrence recurring.Occurrence
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		current, err := selectRecurringOccurrenceByID(ctx, tx, s.db, id)
		if err != nil {
			return err
		}
		if current.Status != recurring.OccurrenceStatusExpected {
			return services.ErrConflict
		}
		if current.GeneratedTransactionID == nil {
			return services.ErrConflict
		}
		result, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("journal_record")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_id = ?
  AND tombstoned_at IS NULL
  AND source = CAST(? AS `+s.db.accountingName("source")+`)`,
			*current.GeneratedTransactionID,
			enumValue(transactions.SourceRecurringTemplate),
		)
		if err != nil {
			return fmt.Errorf("dismiss recurring occurrence journal records: %w", err)
		}
		updated, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("dismiss recurring occurrence journal records affected rows: %w", err)
		}
		if updated == 0 {
			return services.ErrConflict
		}
		result, err = tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction")+`
SET tombstoned_at = CURRENT_TIMESTAMP
WHERE transaction_id = ? AND tombstoned_at IS NULL`,
			*current.GeneratedTransactionID,
		)
		if err != nil {
			return fmt.Errorf("dismiss recurring occurrence transaction: %w", err)
		}
		updated, err = result.RowsAffected()
		if err != nil {
			return fmt.Errorf("dismiss recurring occurrence transaction affected rows: %w", err)
		}
		if updated == 0 {
			return services.ErrConflict
		}
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("recurring_occurrence")+`
SET status = CAST(? AS `+s.db.accountingName("recurring_occurrence_status")+`),
    reviewed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE recurring_occurrence_id = ?`,
			enumValue(recurring.OccurrenceStatusDismissed),
			id,
		); err != nil {
			return fmt.Errorf("dismiss recurring occurrence: %w", err)
		}
		dismissed, err := selectRecurringOccurrenceByID(ctx, tx, s.db, id)
		if err != nil {
			return err
		}
		occurrence = dismissed

		return nil
	})
	if err != nil {
		return recurring.Occurrence{}, err
	}

	return occurrence, nil
}

// ListOccurrenceDates returns occurrence slots for one definition through the supplied date.
func (s *RecurringStore) ListOccurrenceDates(ctx context.Context, definitionID int64, through values.CivilDate) ([]values.CivilDate, error) {
	dates, err := recurringOccurrenceDatesByDefinitionIDs(ctx, s.db.query(), s.db, []int64{definitionID}, through)
	if err != nil {
		return nil, err
	}

	return dates[definitionID], nil
}

// DeferOccurrenceAndShiftAnchor inserts a DEFERRED audit row and shifts the definition anchor.
func (s *RecurringStore) DeferOccurrenceAndShiftAnchor(
	ctx context.Context,
	definition recurring.Definition,
	scheduledDate values.CivilDate,
	newAnchor values.CivilDate,
) (recurring.Occurrence, error) {
	var occurrence recurring.Occurrence
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		created, err := insertDeferredOccurrence(ctx, tx, s.db, definition.ID, scheduledDate, definition.DefinitionVersion)
		if err != nil {
			return err
		}
		result, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("recurring_definition")+`
SET anchor_date = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ?
  AND tombstoned_at IS NULL
  AND paused_at IS NULL`,
			civilDateArg(newAnchor),
			definition.ID,
		)
		if err != nil {
			return fmt.Errorf("shift deferred recurring definition anchor: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read deferred recurring definition affected rows: %w", err)
		}
		if affected == 0 {
			return services.ErrNotFound
		}
		occurrence = created

		return nil
	})
	if err != nil {
		return recurring.Occurrence{}, err
	}

	return occurrence, nil
}

// PauseDefinition marks an active definition paused.
func (s *RecurringStore) PauseDefinition(ctx context.Context, id int64) (recurring.Definition, error) {
	result, err := s.db.query().ExecContext(
		ctx,
		`UPDATE `+s.db.accountingName("recurring_definition")+`
SET paused_at = COALESCE(paused_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND tombstoned_at IS NULL`,
		id,
	)
	if err != nil {
		return recurring.Definition{}, fmt.Errorf("pause recurring definition: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return recurring.Definition{}, fmt.Errorf("read pause recurring definition affected rows: %w", err)
	}
	if affected == 0 {
		return recurring.Definition{}, services.ErrNotFound
	}

	return s.Get(ctx, id)
}

// ResumeDefinition clears paused state, optionally recording skipped date-rule slots.
func (s *RecurringStore) ResumeDefinition(
	ctx context.Context,
	definition recurring.Definition,
	newAnchor values.CivilDate,
	skippedSlots []values.CivilDate,
) (recurring.Definition, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("recurring_definition")+`
SET paused_at = NULL,
    anchor_date = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND tombstoned_at IS NULL`,
			civilDateArg(newAnchor),
			definition.ID,
		)
		if err != nil {
			return fmt.Errorf("resume recurring definition: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read resume recurring definition affected rows: %w", err)
		}
		if affected == 0 {
			return services.ErrNotFound
		}
		for _, slot := range skippedSlots {
			if _, err := insertDeferredOccurrence(ctx, tx, s.db, definition.ID, slot, definition.DefinitionVersion); err != nil {
				if errors.Is(err, services.ErrConflict) {
					continue
				}
				return err
			}
		}

		return nil
	})
	if err != nil {
		return recurring.Definition{}, err
	}

	return s.Get(ctx, definition.ID)
}

type recurringDefinitionScanner interface {
	Scan(dest ...any) error
}

func scanRecurringDefinition(scanner recurringDefinitionScanner) (recurring.Definition, error) {
	var definition recurring.Definition
	var scheduleRule string
	var scheduleClass string
	var anchorDate time.Time
	var pausedAt sql.NullTime
	var lastOccurrenceDate sql.NullTime
	var parentFQN sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&definition.ID,
		&definition.FQN,
		&scheduleRule,
		&scheduleClass,
		&anchorDate,
		&definition.DefinitionVersion,
		&pausedAt,
		&lastOccurrenceDate,
		&parentFQN,
		&definition.Name,
		&definition.Level,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return recurring.Definition{}, err
	}
	definition.ScheduleRule = json.RawMessage(scheduleRule)
	definition.ScheduleClass = recurring.ScheduleClass(strings.ToLower(scheduleClass))
	if definition.ScheduleClass == "date_rule" {
		definition.ScheduleClass = recurring.ScheduleClassDateRule
	}
	definition.AnchorDate = values.CivilDateFromTime(anchorDate)
	definition.PausedAt = nullableTimeFromSQL(pausedAt)
	if lastOccurrenceDate.Valid {
		date := values.CivilDateFromTime(lastOccurrenceDate.Time)
		definition.LastOccurrenceDate = &date
	}
	if parentFQN.Valid {
		definition.ParentFQN = &parentFQN.String
	}
	definition.CreatedAt = createdAt.UTC()
	definition.UpdatedAt = updatedAt.UTC()
	definition.TombstonedAt = nullableTimeFromSQL(tombstonedAt)
	definition.Records = []recurring.DefinitionRecord{}

	return definition, nil
}

func insertGeneratedRecurringTransaction(
	ctx context.Context,
	tx *sql.Tx,
	db *AppDB,
	occurrenceID int64,
	initiatedDate values.CivilDate,
	records []transactions.JournalRecordInput,
) (transactions.Transaction, error) {
	transaction, err := scanTransaction(tx.QueryRowContext(
		ctx,
		`INSERT INTO `+db.accountingName("transaction")+` (initiated_date, recurring_occurrence_id)
VALUES (?, ?)
RETURNING transaction_id, initiated_date, recurring_occurrence_id, created_at, tombstoned_at`,
		civilDateArg(initiatedDate),
		occurrenceID,
	))
	if err != nil {
		return transactions.Transaction{}, fmt.Errorf("insert recurring generated transaction: %w", err)
	}
	for _, record := range records {
		if err := insertJournalRecord(ctx, tx, db, transaction.ID, record); err != nil {
			return transactions.Transaction{}, err
		}
	}

	return transaction, nil
}

func insertDeferredOccurrence(
	ctx context.Context,
	tx *sql.Tx,
	db *AppDB,
	definitionID int64,
	scheduledDate values.CivilDate,
	definitionVersion int64,
) (recurring.Occurrence, error) {
	occurrence, err := scanRecurringOccurrence(tx.QueryRowContext(
		ctx,
		`INSERT INTO `+db.accountingName("recurring_occurrence")+` (
	recurring_definition_id, scheduled_date, status, materialized_definition_version, reviewed_at
)
VALUES (?, ?, CAST(? AS `+db.accountingName("recurring_occurrence_status")+`), ?, CURRENT_TIMESTAMP)
RETURNING recurring_occurrence_id, recurring_definition_id, scheduled_date, CAST(status AS VARCHAR), materialized_definition_version,
	materialized_at, reviewed_at, CAST(NULL AS BIGINT), created_at, updated_at`,
		definitionID,
		civilDateArg(scheduledDate),
		enumValue(recurring.OccurrenceStatusDeferred),
		definitionVersion,
	))
	if err != nil {
		if isUniqueConstraintError(err) {
			return recurring.Occurrence{}, services.ErrConflict
		}
		return recurring.Occurrence{}, fmt.Errorf("insert deferred recurring occurrence: %w", err)
	}

	return occurrence, nil
}

type recurringOccurrenceScanner interface {
	Scan(dest ...any) error
}

func scanRecurringOccurrence(scanner recurringOccurrenceScanner) (recurring.Occurrence, error) {
	var occurrence recurring.Occurrence
	var scheduledDate time.Time
	var status string
	var reviewedAt sql.NullTime
	var transactionID sql.NullInt64
	var materializedAt time.Time
	var createdAt time.Time
	var updatedAt time.Time
	if err := scanner.Scan(
		&occurrence.ID,
		&occurrence.RecurringDefinitionID,
		&scheduledDate,
		&status,
		&occurrence.MaterializedDefinitionVersion,
		&materializedAt,
		&reviewedAt,
		&transactionID,
		&createdAt,
		&updatedAt,
	); err != nil {
		return recurring.Occurrence{}, err
	}
	occurrence.ScheduledDate = values.CivilDateFromTime(scheduledDate)
	occurrence.Status = recurring.OccurrenceStatus(strings.ToLower(status))
	occurrence.MaterializedAt = materializedAt.UTC()
	occurrence.ReviewedAt = nullableTimeFromSQL(reviewedAt)
	if transactionID.Valid {
		occurrence.GeneratedTransactionID = &transactionID.Int64
	}
	occurrence.CreatedAt = createdAt.UTC()
	occurrence.UpdatedAt = updatedAt.UTC()

	return occurrence, nil
}

func selectRecurringOccurrenceByID(ctx context.Context, queryer rowQuerier, db *AppDB, id int64) (recurring.Occurrence, error) {
	occurrence, err := scanRecurringOccurrence(queryer.QueryRowContext(
		ctx,
		`SELECT o.recurring_occurrence_id, o.recurring_definition_id, o.scheduled_date, CAST(o.status AS VARCHAR), o.materialized_definition_version,
	o.materialized_at, o.reviewed_at, t.transaction_id, o.created_at, o.updated_at
FROM `+db.accountingName("recurring_occurrence")+` AS o
LEFT JOIN `+db.accountingName("transaction")+` AS t
  ON t.recurring_occurrence_id = o.recurring_occurrence_id
WHERE o.recurring_occurrence_id = ?`,
		id,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return recurring.Occurrence{}, services.ErrNotFound
	}
	if err != nil {
		return recurring.Occurrence{}, fmt.Errorf("get recurring occurrence: %w", err)
	}

	return occurrence, nil
}

func postedJournalRecords(records []transactions.JournalRecordInput) []transactions.JournalRecordInput {
	posted := make([]transactions.JournalRecordInput, 0, len(records))
	for _, record := range records {
		next := record
		next.TagIDs = slices.Clone(record.TagIDs)
		next.PostingStatus = transactions.PostingStatusPosted
		if record.PendingDate != nil {
			postedDate := *record.PendingDate
			next.PostedDate = &postedDate
		}
		posted = append(posted, next)
	}

	return posted
}

func insertRecurringDefinitionRecord(
	ctx context.Context,
	tx *sql.Tx,
	db *AppDB,
	definitionID int64,
	record recurring.DefinitionRecordInput,
) error {
	tagListExpr, tagListArgs := tagListExpression(record.TagIDs)
	args := []any{
		definitionID,
		record.AccountID,
		record.MemberID,
		record.Currency,
		record.Amount.LibraryDecimal(),
		record.CategoryID,
	}
	args = append(args, tagListArgs...)
	args = append(args, record.Memo)

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO `+db.accountingName("recurring_definition_record")+` (
	recurring_definition_id, account_id, member_id, currency, amount, category_id, tag_ids, memo
)
VALUES (?, ?, ?, ?, ?, ?, `+tagListExpr+`, ?)`,
		args...,
	); err != nil {
		return fmt.Errorf("insert recurring definition record: %w", err)
	}

	return nil
}

type recurringDefinitionRecordScanner interface {
	Scan(dest ...any) error
}

func scanRecurringDefinitionRecord(scanner recurringDefinitionRecordScanner) (recurring.DefinitionRecord, error) {
	var record recurring.DefinitionRecord
	var memberID sql.NullInt64
	var amount sql.Null[duckdb.Decimal]
	var tagIDs []any
	var memo sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&record.ID,
		&record.RecurringDefinitionID,
		&record.AccountID,
		&memberID,
		&record.Currency,
		&amount,
		&record.CategoryID,
		&tagIDs,
		&memo,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return recurring.DefinitionRecord{}, err
	}
	if memberID.Valid {
		record.MemberID = &memberID.Int64
	}
	if amount.Valid {
		parsed, err := decimalFromDuckDB(amount.V)
		if err != nil {
			return recurring.DefinitionRecord{}, fmt.Errorf("scan recurring definition record amount: %w", err)
		}
		record.Amount = parsed
	}
	parsedTagIDs, err := int64ListFromDuckDB(tagIDs)
	if err != nil {
		return recurring.DefinitionRecord{}, fmt.Errorf("scan recurring definition record tag_ids: %w", err)
	}
	slices.Sort(parsedTagIDs)
	record.TagIDs = parsedTagIDs
	if memo.Valid {
		record.Memo = &memo.String
	}
	record.CreatedAt = createdAt.UTC()
	record.UpdatedAt = updatedAt.UTC()
	record.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return record, nil
}

func recurringDefinitionRecordsByDefinitionIDs(
	ctx context.Context,
	queryer rowsQuerier,
	db *AppDB,
	definitionIDs []int64,
) (map[int64][]recurring.DefinitionRecord, error) {
	recordsByDefinitionID := map[int64][]recurring.DefinitionRecord{}
	for _, id := range definitionIDs {
		recordsByDefinitionID[id] = []recurring.DefinitionRecord{}
	}
	if len(definitionIDs) == 0 {
		return recordsByDefinitionID, nil
	}

	rows, err := queryer.QueryContext(
		ctx,
		`SELECT recurring_definition_record_id, recurring_definition_id, account_id, member_id, currency, amount,
	category_id, tag_ids, memo, created_at, updated_at, tombstoned_at
FROM `+db.accountingName("recurring_definition_record")+`
WHERE recurring_definition_id IN (`+placeholders(len(definitionIDs))+`) AND tombstoned_at IS NULL
ORDER BY recurring_definition_id ASC, recurring_definition_record_id ASC`,
		int64Args(definitionIDs)...,
	)
	if err != nil {
		return nil, fmt.Errorf("list recurring definition records: %w", err)
	}

	for rows.Next() {
		record, err := scanRecurringDefinitionRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("scan recurring definition record: %w", err)
		}
		recordsByDefinitionID[record.RecurringDefinitionID] = append(recordsByDefinitionID[record.RecurringDefinitionID], record)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate recurring definition records: %w; close recurring definition record rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate recurring definition records: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close recurring definition record rows: %w", err)
	}

	return recordsByDefinitionID, nil
}

func recurringOccurrenceDatesByDefinitionIDs(
	ctx context.Context,
	queryer rowsQuerier,
	db *AppDB,
	definitionIDs []int64,
	through values.CivilDate,
) (map[int64][]values.CivilDate, error) {
	datesByDefinitionID := map[int64][]values.CivilDate{}
	for _, id := range definitionIDs {
		datesByDefinitionID[id] = []values.CivilDate{}
	}
	if len(definitionIDs) == 0 {
		return datesByDefinitionID, nil
	}

	args := int64Args(definitionIDs)
	args = append(args, civilDateArg(through))
	rows, err := queryer.QueryContext(
		ctx,
		`SELECT recurring_definition_id, scheduled_date
FROM `+db.accountingName("recurring_occurrence")+`
WHERE recurring_definition_id IN (`+placeholders(len(definitionIDs))+`) AND scheduled_date <= ?
ORDER BY recurring_definition_id ASC, scheduled_date ASC`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("list recurring occurrence dates: %w", err)
	}
	for rows.Next() {
		var definitionID int64
		var scheduledDate time.Time
		if err := rows.Scan(&definitionID, &scheduledDate); err != nil {
			return nil, fmt.Errorf("scan recurring occurrence date: %w", err)
		}
		datesByDefinitionID[definitionID] = append(datesByDefinitionID[definitionID], values.CivilDateFromTime(scheduledDate))
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate recurring occurrence dates: %w; close recurring occurrence date rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate recurring occurrence dates: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close recurring occurrence date rows: %w", err)
	}

	return datesByDefinitionID, nil
}

func (s *RecurringStore) recordsByDefinitionIDs(ctx context.Context, definitionIDs []int64) (map[int64][]recurring.DefinitionRecord, error) {
	return recurringDefinitionRecordsByDefinitionIDs(ctx, s.db.query(), s.db, definitionIDs)
}

var recurringDefinitionSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyFQN:       {"fqn"},
	services.SortKeyUpdatedAt: {"updated_at"},
}

var recurringOccurrenceSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt:     {"o.created_at"},
	services.SortKeyScheduledDate: {"o.scheduled_date"},
	services.SortKeyUpdatedAt:     {"o.updated_at"},
}
