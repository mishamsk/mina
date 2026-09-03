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

// RecurringStore persists recurring definitions and generated transactions.
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
RETURNING recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), anchor_date, definition_version, paused_at, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
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

		if err := insertRecurringDefinitionRecords(ctx, tx, s.db, definition.ID, input.Records); err != nil {
			return err
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
		`SELECT recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), anchor_date, definition_version, paused_at,
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

	query := `SELECT recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), anchor_date, definition_version, paused_at,
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
	if input.ExpectedUpdatedAt == nil {
		return recurring.Definition{}, errors.New("replace recurring definition: expected updated timestamp is required")
	}
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
WHERE recurring_definition_id = ? AND tombstoned_at IS NULL AND updated_at = ?
			RETURNING recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), anchor_date, definition_version, paused_at,
		parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			string(input.ScheduleRule),
			civilDateArg(input.AnchorDate),
			id,
			timestampArg(*input.ExpectedUpdatedAt),
		)
		replaced, scanErr := scanRecurringDefinition(row)
		if errors.Is(scanErr, sql.ErrNoRows) {
			var exists bool
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+s.db.accountingName("recurring_definition")+` WHERE recurring_definition_id = ? AND tombstoned_at IS NULL)`, id).Scan(&exists); err != nil {
				return fmt.Errorf("inspect rejected recurring definition replacement: %w", err)
			}
			if !exists {
				return services.ErrNotFound
			}
			return services.ErrPreconditionFailed
		}
		if scanErr != nil {
			if isUniqueConstraintError(scanErr) {
				return fmt.Errorf("%w: active recurring definition fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("update recurring definition: %w", scanErr)
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

		if err := insertRecurringDefinitionRecords(ctx, tx, s.db, definition.ID, input.Records); err != nil {
			return err
		}
		records, err := recurringDefinitionRecordsByDefinitionIDs(ctx, tx, s.db, []int64{definition.ID})
		if err != nil {
			return err
		}
		definition.Records = records[definition.ID]

		return nil
	})
	if err != nil {
		if isDuckDBTransactionConflictError(err) {
			return recurring.Definition{}, services.ErrPreconditionFailed
		}
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

// ListMaterializationDefinitions returns active, unpaused definitions at their authoritative next anchors.
func (s *RecurringStore) ListMaterializationDefinitions(ctx context.Context) ([]recurring.Definition, error) {
	rows, err := s.db.query().QueryContext(ctx, `SELECT recurring_definition_id, fqn, CAST(schedule_rule AS VARCHAR), anchor_date, definition_version, paused_at,
	parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("recurring_definition")+`
WHERE tombstoned_at IS NULL AND paused_at IS NULL
ORDER BY recurring_definition_id ASC`)
	if err != nil {
		return nil, fmt.Errorf("list materializable recurring definitions: %w", err)
	}
	definitions := []recurring.Definition{}
	ids := []int64{}
	for rows.Next() {
		definition, err := scanRecurringDefinition(rows)
		if err != nil {
			return nil, fmt.Errorf("scan materializable recurring definition: %w", err)
		}
		definitions = append(definitions, definition)
		ids = append(ids, definition.ID)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate materializable recurring definitions: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close materializable recurring definitions: %w", err)
	}
	records, err := s.recordsByDefinitionIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	for index := range definitions {
		definitions[index].Records = records[definitions[index].ID]
	}
	return definitions, nil
}

// MaterializeExpectedTransactions atomically creates all due transactions and advances every affected anchor.
func (s *RecurringStore) MaterializeExpectedTransactions(ctx context.Context, inputs []recurring.CatchUpInput) error {
	return s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		for _, input := range inputs {
			for _, expected := range input.Transactions {
				if _, err := insertGeneratedRecurringTransaction(ctx, tx, s.db, input.Definition.ID, expected.ScheduledDate, transactions.LifecycleStatusExpected, expected.Records); err != nil {
					return err
				}
			}
			result, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("recurring_definition")+`
SET anchor_date = ?, updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND anchor_date = ? AND paused_at IS NULL AND tombstoned_at IS NULL`,
				civilDateArg(input.NextAnchor), input.Definition.ID, civilDateArg(input.Definition.AnchorDate))
			if err != nil {
				return fmt.Errorf("advance recurring definition anchor after catch-up: %w", err)
			}
			affected, err := result.RowsAffected()
			if err != nil {
				return fmt.Errorf("read recurring catch-up anchor update: %w", err)
			}
			if affected != 1 {
				return services.ErrConflict
			}
		}
		return nil
	})
}

// CreateConfirmedTransaction atomically creates an active recurring transaction and consumes the current anchor.
func (s *RecurringStore) CreateConfirmedTransaction(ctx context.Context, definition recurring.Definition, initiatedDate values.CivilDate, nextAnchor values.CivilDate, records []transactions.PersistJournalRecordInput) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("recurring_definition")+`
SET anchor_date = ?, updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND anchor_date = ? AND paused_at IS NULL AND tombstoned_at IS NULL`,
			civilDateArg(nextAnchor), definition.ID, civilDateArg(definition.AnchorDate))
		if err != nil {
			return fmt.Errorf("advance recurring definition anchor after confirmation: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read recurring confirmation anchor update: %w", err)
		}
		if affected != 1 {
			return services.ErrConflict
		}
		transaction, err = insertGeneratedRecurringTransaction(ctx, tx, s.db, definition.ID, initiatedDate, transactions.LifecycleStatusActive, records)
		if err != nil {
			return err
		}
		transaction, err = transactionByID(ctx, tx, s.db, transaction.ID, false)
		return err
	})
	return transaction, err
}

// GetExpectedConfirmation returns one transaction's scheduled date and active generated record amounts.
func (s *RecurringStore) GetExpectedConfirmation(ctx context.Context, id int64) (recurring.ExpectedConfirmation, error) {
	var confirmation recurring.ExpectedConfirmation
	var date time.Time
	var definitionID sql.NullInt64
	var lifecycle string
	var tombstonedAt sql.NullTime
	err := s.db.query().QueryRowContext(ctx, `SELECT initiated_date, recurring_definition_id, CAST(lifecycle_status AS VARCHAR), tombstoned_at
FROM `+s.db.accountingName("transaction")+`
WHERE transaction_id = ?`, id).Scan(&date, &definitionID, &lifecycle, &tombstonedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return recurring.ExpectedConfirmation{}, services.ErrNotFound
	}
	if err != nil {
		return recurring.ExpectedConfirmation{}, fmt.Errorf("get expected recurring transaction: %w", err)
	}
	if !definitionID.Valid || lifecycle != "EXPECTED" || tombstonedAt.Valid {
		return recurring.ExpectedConfirmation{}, services.ErrConflict
	}
	confirmation.ScheduledDate = values.CivilDateFromTime(date)
	rows, err := s.db.query().QueryContext(ctx, `SELECT record_id, currency, amount
FROM `+s.db.accountingName("journal_record")+`
WHERE transaction_id = ? AND tombstoned_at IS NULL AND source = CAST('RECURRING_TEMPLATE' AS `+s.db.accountingName("source")+`)
ORDER BY record_id`, id)
	if err != nil {
		return recurring.ExpectedConfirmation{}, fmt.Errorf("list expected recurring transaction records: %w", err)
	}
	for rows.Next() {
		var record recurring.ExpectedConfirmationRecord
		var amount duckdb.Decimal
		if err := rows.Scan(&record.ID, &record.Currency, &amount); err != nil {
			return recurring.ExpectedConfirmation{}, fmt.Errorf("scan expected recurring transaction record: %w", err)
		}
		parsed, err := decimalFromDuckDB(amount)
		if err != nil {
			return recurring.ExpectedConfirmation{}, err
		}
		record.Amount = parsed
		confirmation.Records = append(confirmation.Records, record)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return recurring.ExpectedConfirmation{}, fmt.Errorf("iterate expected recurring transaction records: %w", err)
	}
	if err := rows.Close(); err != nil {
		return recurring.ExpectedConfirmation{}, fmt.Errorf("close expected recurring transaction records: %w", err)
	}
	return confirmation, nil
}

// ConfirmExpectedTransaction atomically activates an expected transaction and settles its generated records.
func (s *RecurringStore) ConfirmExpectedTransaction(ctx context.Context, id int64, actualDate values.CivilDate, valuations []recurring.ExpectedRecordValuation, pendingDate *time.Time, postedDate *time.Time, updatedAt time.Time) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("transaction")+`
SET initiated_date = ?, lifecycle_status = CAST('ACTIVE' AS `+s.db.accountingName("transaction_lifecycle_status")+`), updated_at = ?
WHERE transaction_id = ? AND recurring_definition_id IS NOT NULL AND lifecycle_status = CAST('EXPECTED' AS `+s.db.accountingName("transaction_lifecycle_status")+`) AND tombstoned_at IS NULL`,
			civilDateArg(actualDate), timestampArg(updatedAt), id)
		if err != nil {
			return fmt.Errorf("activate expected recurring transaction: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read activated expected transaction count: %w", err)
		}
		if affected != 1 {
			var exists bool
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+s.db.accountingName("transaction")+` WHERE transaction_id = ?)`, id).Scan(&exists); err != nil {
				return fmt.Errorf("check recurring transaction existence: %w", err)
			}
			if !exists {
				return services.ErrNotFound
			}
			return services.ErrConflict
		}
		for _, valuation := range valuations {
			result, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("journal_record")+` SET amount_usd = ?
WHERE record_id = ? AND transaction_id = ? AND tombstoned_at IS NULL`, nullableDecimalArg(valuation.AmountUSD), valuation.ID, id)
			if err != nil {
				return fmt.Errorf("revalue expected recurring transaction record: %w", err)
			}
			affected, err := result.RowsAffected()
			if err != nil || affected != 1 {
				return services.ErrConflict
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("journal_record")+` AS r
SET pending_date = CASE WHEN a.account_type IN (CAST('OWNED' AS `+s.db.accountingName("account_type")+`), CAST('PARTY' AS `+s.db.accountingName("account_type")+`)) THEN ? ELSE NULL END,
	posted_date = CASE WHEN a.account_type IN (CAST('OWNED' AS `+s.db.accountingName("account_type")+`), CAST('PARTY' AS `+s.db.accountingName("account_type")+`)) THEN ? ELSE NULL END,
	reconciliation_status = CAST('RECONCILED' AS `+s.db.accountingName("reconciliation_status")+`), updated_at = ?
FROM `+s.db.accountingName("account")+` AS a
WHERE r.transaction_id = ? AND r.account_id = a.account_id AND r.tombstoned_at IS NULL AND r.source = CAST('RECURRING_TEMPLATE' AS `+s.db.accountingName("source")+`)`,
			nullableTimestampArg(pendingDate), nullableTimestampArg(postedDate), timestampArg(updatedAt), id); err != nil {
			return fmt.Errorf("settle expected recurring transaction records: %w", err)
		}
		transaction, err = transactionByID(ctx, tx, s.db, id, false)
		return err
	})
	return transaction, err
}

// DismissExpectedTransaction atomically tombstones an expected recurring transaction and its records.
func (s *RecurringStore) DismissExpectedTransaction(ctx context.Context, id int64, tombstonedAt time.Time) error {
	return s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("transaction")+`
SET tombstoned_at = ?, updated_at = ?
WHERE transaction_id = ? AND recurring_definition_id IS NOT NULL AND lifecycle_status = CAST('EXPECTED' AS `+s.db.accountingName("transaction_lifecycle_status")+`) AND tombstoned_at IS NULL`,
			timestampArg(tombstonedAt), timestampArg(tombstonedAt), id)
		if err != nil {
			return fmt.Errorf("dismiss expected recurring transaction: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read dismissed expected transaction count: %w", err)
		}
		if affected != 1 {
			var exists bool
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+s.db.accountingName("transaction")+` WHERE transaction_id = ?)`, id).Scan(&exists); err != nil {
				return err
			}
			if !exists {
				return services.ErrNotFound
			}
			return services.ErrConflict
		}
		if _, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("journal_record")+`
SET tombstoned_at = ?, updated_at = ? WHERE transaction_id = ? AND tombstoned_at IS NULL`,
			timestampArg(tombstonedAt), timestampArg(tombstonedAt), id); err != nil {
			return fmt.Errorf("dismiss expected recurring transaction records: %w", err)
		}
		return nil
	})
}

// ShiftAnchor consumes a virtual slot by replacing the definition's current anchor.
func (s *RecurringStore) ShiftAnchor(ctx context.Context, definition recurring.Definition, nextAnchor values.CivilDate) (recurring.Definition, error) {
	var shifted recurring.Definition
	err := s.db.WithTx(ctx, nil, func(txDB *AppDB) error {
		result, err := txDB.query().ExecContext(ctx, `UPDATE `+txDB.accountingName("recurring_definition")+`
SET anchor_date = ?, updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND anchor_date = ? AND paused_at IS NULL AND tombstoned_at IS NULL`,
			civilDateArg(nextAnchor), definition.ID, civilDateArg(definition.AnchorDate))
		if err != nil {
			return fmt.Errorf("shift recurring definition anchor: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if affected != 1 {
			return services.ErrConflict
		}
		shifted, err = NewRecurringStore(txDB).Get(ctx, definition.ID)
		return err
	})
	return shifted, err
}

// PauseDefinition records pause state without changing the next anchor.
func (s *RecurringStore) PauseDefinition(ctx context.Context, id int64) (recurring.Definition, error) {
	result, err := s.db.query().ExecContext(ctx, `UPDATE `+s.db.accountingName("recurring_definition")+`
SET paused_at = COALESCE(paused_at, CURRENT_TIMESTAMP), updated_at = CASE WHEN paused_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END
WHERE recurring_definition_id = ? AND tombstoned_at IS NULL`, id)
	if err != nil {
		return recurring.Definition{}, fmt.Errorf("pause recurring definition: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return recurring.Definition{}, services.ErrNotFound
	}
	return s.Get(ctx, id)
}

// ResumeDefinition clears pause state and establishes the supplied next anchor.
func (s *RecurringStore) ResumeDefinition(ctx context.Context, definition recurring.Definition, nextAnchor values.CivilDate) (recurring.Definition, error) {
	result, err := s.db.query().ExecContext(ctx, `UPDATE `+s.db.accountingName("recurring_definition")+`
SET paused_at = NULL, anchor_date = ?, updated_at = CURRENT_TIMESTAMP
WHERE recurring_definition_id = ? AND paused_at IS NOT NULL AND tombstoned_at IS NULL`, civilDateArg(nextAnchor), definition.ID)
	if err != nil {
		return recurring.Definition{}, fmt.Errorf("resume recurring definition: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return recurring.Definition{}, services.ErrNotFound
	}
	return s.Get(ctx, definition.ID)
}

func insertGeneratedRecurringTransaction(ctx context.Context, tx *sql.Tx, db *AppDB, definitionID int64, initiatedDate values.CivilDate, lifecycle transactions.LifecycleStatus, records []transactions.PersistJournalRecordInput) (transactions.Transaction, error) {
	transaction, err := scanTransaction(tx.QueryRowContext(ctx, `INSERT INTO `+db.accountingName("transaction")+` (initiated_date, recurring_definition_id, lifecycle_status)
VALUES (?, ?, CAST(? AS `+db.accountingName("transaction_lifecycle_status")+`))
RETURNING transaction_id, initiated_date, recurring_definition_id, CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at`,
		civilDateArg(initiatedDate), definitionID, enumValue(lifecycle)))
	if err != nil {
		return transactions.Transaction{}, fmt.Errorf("insert recurring generated transaction: %w", err)
	}
	if err := insertJournalRecords(ctx, tx, db, transaction.ID, records); err != nil {
		return transactions.Transaction{}, err
	}
	return transaction, nil
}

type recurringDefinitionScanner interface {
	Scan(dest ...any) error
}

func scanRecurringDefinition(scanner recurringDefinitionScanner) (recurring.Definition, error) {
	var definition recurring.Definition
	var scheduleRule string
	var anchorDate time.Time
	var pausedAt sql.NullTime
	var parentFQN sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&definition.ID,
		&definition.FQN,
		&scheduleRule,
		&anchorDate,
		&definition.DefinitionVersion,
		&pausedAt,
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
	scheduleClass, err := recurringScheduleClassFromRule(definition.ScheduleRule)
	if err != nil {
		return recurring.Definition{}, err
	}
	definition.ScheduleClass = scheduleClass
	definition.AnchorDate = values.CivilDateFromTime(anchorDate)
	definition.PausedAt = nullableTimeFromSQL(pausedAt)
	if parentFQN.Valid {
		definition.ParentFQN = &parentFQN.String
	}
	definition.CreatedAt = createdAt.UTC()
	definition.UpdatedAt = updatedAt.UTC()
	definition.TombstonedAt = nullableTimeFromSQL(tombstonedAt)
	definition.Records = []recurring.DefinitionRecord{}

	return definition, nil
}

func recurringScheduleClassFromRule(rule json.RawMessage) (recurring.ScheduleClass, error) {
	var payload struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(rule, &payload); err != nil {
		return "", fmt.Errorf("decode recurring schedule rule: %w", err)
	}
	if payload.Kind == "interval" {
		return recurring.ScheduleClassInterval, nil
	}
	return recurring.ScheduleClassDateRule, nil
}

func insertRecurringDefinitionRecords(
	ctx context.Context,
	tx *sql.Tx,
	db *AppDB,
	definitionID int64,
	records []recurring.DefinitionRecordInput,
) error {
	if len(records) == 0 {
		return nil
	}

	rows := make([]string, 0, len(records))
	args := make([]any, 0, len(records)*8)
	for _, record := range records {
		tagListExpr, tagListArgs := tagListExpression(record.TagIDs)
		rows = append(rows, "(?, ?, ?, ?, ?, ?, "+tagListExpr+", ?)")
		args = append(args,
			definitionID,
			record.AccountID,
			record.MemberID,
			record.Currency,
			record.Amount.LibraryDecimal(),
			record.CategoryID,
		)
		args = append(args, tagListArgs...)
		args = append(args, record.Memo)
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO `+db.accountingName("recurring_definition_record")+` (
	recurring_definition_id, account_id, member_id, currency, amount, category_id, tag_ids, memo
)
VALUES `+strings.Join(rows, ", "),
		args...,
	); err != nil {
		return fmt.Errorf("insert recurring definition records: %w", err)
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

func (s *RecurringStore) recordsByDefinitionIDs(ctx context.Context, definitionIDs []int64) (map[int64][]recurring.DefinitionRecord, error) {
	return recurringDefinitionRecordsByDefinitionIDs(ctx, s.db.query(), s.db, definitionIDs)
}

var recurringDefinitionSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyFQN:       {"fqn"},
	services.SortKeyUpdatedAt: {"updated_at"},
}
