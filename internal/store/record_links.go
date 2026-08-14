package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// RecordLinkStore persists pairwise settlement links between journal records.
type RecordLinkStore struct {
	db *AppDB
}

// RecordLinkType identifies the settlement relationship represented by a record link.
type RecordLinkType string

const (
	// RecordLinkTypeRefund links a refund settlement record to the refunded origin record.
	RecordLinkTypeRefund RecordLinkType = "REFUND"
	// RecordLinkTypeReimbursement links a reimbursement payout record to the reimbursed origin record.
	RecordLinkTypeReimbursement RecordLinkType = "REIMBURSEMENT"
)

// RecordLink is a DB-facing pairwise settlement metadata row.
type RecordLink struct {
	ID                 int64
	OriginRecordID     int64
	SettlementRecordID int64
	LinkType           RecordLinkType
	Memo               *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
	TombstonedAt       *time.Time
}

// RecordLinkCreateInput carries values for a new record link row.
type RecordLinkCreateInput struct {
	OriginRecordID     int64
	SettlementRecordID int64
	LinkType           RecordLinkType
	Memo               *string
}

// NewRecordLinkStore creates a record-link store using AppDB.
func NewRecordLinkStore(db *AppDB) *RecordLinkStore {
	return &RecordLinkStore{db: db}
}

// BatchCreate persists record links atomically.
func (s *RecordLinkStore) BatchCreate(ctx context.Context, inputs []RecordLinkCreateInput) ([]RecordLink, error) {
	links := []RecordLink{}
	if len(inputs) == 0 {
		return links, nil
	}

	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		valuesSQL, args := recordLinkInputValues(inputs)
		defer func() { _ = dropRecordLinkInputTables(ctx, tx) }()
		if _, err := tx.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE record_link_input AS
SELECT input.*,
	origin.transaction_id AS origin_transaction_id,
	settlement.transaction_id AS settlement_transaction_id,
	origin.record_id IS NOT NULL AND origin.tombstoned_at IS NULL
		AND origin_parent.transaction_id IS NOT NULL AND origin_parent.tombstoned_at IS NULL AS origin_active,
	settlement.record_id IS NOT NULL AND settlement.tombstoned_at IS NULL
		AND settlement_parent.transaction_id IS NOT NULL AND settlement_parent.tombstoned_at IS NULL AS settlement_active
FROM (`+valuesSQL+`) AS input(input_index, origin_record_id, settlement_record_id, link_type, memo)
LEFT JOIN `+s.db.accountingName("journal_record")+` AS origin ON origin.record_id = input.origin_record_id
LEFT JOIN `+s.db.accountingName("transaction")+` AS origin_parent ON origin_parent.transaction_id = origin.transaction_id
LEFT JOIN `+s.db.accountingName("journal_record")+` AS settlement ON settlement.record_id = input.settlement_record_id
LEFT JOIN `+s.db.accountingName("transaction")+` AS settlement_parent ON settlement_parent.transaction_id = settlement.transaction_id`, args...); err != nil {
			return fmt.Errorf("stage record link input: %w", err)
		}

		var duplicatePairs int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM (
	SELECT origin_record_id, settlement_record_id
	FROM record_link_input
	GROUP BY origin_record_id, settlement_record_id
	HAVING COUNT(*) > 1
)`).Scan(&duplicatePairs); err != nil {
			return fmt.Errorf("validate duplicate record link input: %w", err)
		}
		var invalidParents int
		var existingCount int
		if err := tx.QueryRowContext(ctx, `SELECT
	COUNT(*) FILTER (WHERE origin_transaction_id IS NULL OR settlement_transaction_id IS NULL OR NOT origin_active OR NOT settlement_active),
	COUNT(*) FILTER (WHERE existing.record_link_id IS NOT NULL)
FROM record_link_input AS input
LEFT JOIN `+s.db.accountingName("record_link")+` AS existing
	ON existing.origin_record_id = input.origin_record_id
	AND existing.settlement_record_id = input.settlement_record_id
	AND existing.tombstoned_at IS NULL`).Scan(&invalidParents, &existingCount); err != nil {
			return fmt.Errorf("validate record link input: %w", err)
		}
		if duplicatePairs > 0 || existingCount > 0 {
			return fmt.Errorf("%w: active record link already exists for origin and settlement records", ErrConflict)
		}
		if invalidParents > 0 {
			return ErrInvalidReference
		}

		rows, err := tx.QueryContext(ctx, `INSERT INTO `+s.db.accountingName("record_link")+` (
	origin_record_id, settlement_record_id, link_type, memo
)
SELECT origin_record_id, settlement_record_id, link_type, memo
FROM record_link_input
ORDER BY input_index
RETURNING record_link_id, origin_record_id, settlement_record_id, CAST(link_type AS VARCHAR), memo,
	created_at, updated_at, tombstoned_at`)
		if err != nil {
			return fmt.Errorf("insert record link batch: %w", err)
		}
		for rows.Next() {
			created, err := scanRecordLink(rows)
			if err != nil {
				_ = rows.Close()
				return fmt.Errorf("scan inserted record link: %w", err)
			}
			links = append(links, created)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return fmt.Errorf("iterate inserted record links: %w", err)
		}
		if err := rows.Close(); err != nil {
			return fmt.Errorf("close inserted record links: %w", err)
		}

		if err := createRecordLinkParentInput(ctx, tx); err != nil {
			return err
		}
		return touchTransactionsFromInput(ctx, tx, s.db, "record_link_parent_input")
	})
	if err != nil {
		if isDuckDBTransactionConflictError(err) {
			return nil, ErrConflict
		}
		return nil, err
	}

	return links, nil
}

// GetByRecordIDs returns active links where any requested record is origin or settlement.
func (s *RecordLinkStore) GetByRecordIDs(ctx context.Context, recordIDs []int64) ([]RecordLink, error) {
	links := []RecordLink{}
	if len(recordIDs) == 0 {
		return links, nil
	}

	args := append(int64Args(recordIDs), int64Args(recordIDs)...)
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT record_link_id, origin_record_id, settlement_record_id, CAST(link_type AS VARCHAR), memo,
	created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("record_link")+`
WHERE tombstoned_at IS NULL
  AND (
    origin_record_id IN (`+placeholders(len(recordIDs))+`)
    OR settlement_record_id IN (`+placeholders(len(recordIDs))+`)
  )
ORDER BY record_link_id`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("list record links: %w", err)
	}

	for rows.Next() {
		link, err := scanRecordLink(rows)
		if err != nil {
			return nil, fmt.Errorf("scan record link: %w", err)
		}
		links = append(links, link)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate record links: %w; close record link rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate record links: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close record link rows: %w", err)
	}

	return links, nil
}

// TombstoneByIDs tombstones active record links by row ID atomically.
func (s *RecordLinkStore) TombstoneByIDs(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}

	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		ids = uniqueSortedInt64s(ids)
		valuesSQL, args := int64InputValues(ids)
		defer func() { _ = dropRecordLinkInputTables(ctx, tx) }()
		if _, err := tx.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE record_link_input AS
SELECT link.record_link_id,
	origin.transaction_id AS origin_transaction_id,
	settlement.transaction_id AS settlement_transaction_id,
	origin_parent.transaction_id IS NOT NULL AS origin_parent_exists,
	settlement_parent.transaction_id IS NOT NULL AS settlement_parent_exists
FROM (`+valuesSQL+`) AS requested(record_link_id)
JOIN `+s.db.accountingName("record_link")+` AS link
	ON link.record_link_id = requested.record_link_id AND link.tombstoned_at IS NULL
LEFT JOIN `+s.db.accountingName("journal_record")+` AS origin ON origin.record_id = link.origin_record_id
LEFT JOIN `+s.db.accountingName("transaction")+` AS origin_parent ON origin_parent.transaction_id = origin.transaction_id
LEFT JOIN `+s.db.accountingName("journal_record")+` AS settlement ON settlement.record_id = link.settlement_record_id
LEFT JOIN `+s.db.accountingName("transaction")+` AS settlement_parent ON settlement_parent.transaction_id = settlement.transaction_id`, args...); err != nil {
			return fmt.Errorf("stage record link tombstones: %w", err)
		}
		var invalidParents int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FILTER (
	WHERE origin_transaction_id IS NULL OR settlement_transaction_id IS NULL OR NOT origin_parent_exists OR NOT settlement_parent_exists
) FROM record_link_input`).Scan(&invalidParents); err != nil {
			return fmt.Errorf("validate record link parents: %w", err)
		}
		if invalidParents > 0 {
			return ErrInvalidReference
		}
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("record_link")+` AS link
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
			FROM record_link_input AS input
WHERE link.record_link_id = input.record_link_id
  AND link.tombstoned_at IS NULL`,
		); err != nil {
			return fmt.Errorf("tombstone record links: %w", err)
		}

		if err := createRecordLinkParentInput(ctx, tx); err != nil {
			return err
		}
		return touchTransactionsFromInput(ctx, tx, s.db, "record_link_parent_input")
	})
	if isDuckDBTransactionConflictError(err) {
		return ErrConflict
	}
	return err
}

func recordLinkInputValues(inputs []RecordLinkCreateInput) (string, []any) {
	rows := make([]string, 0, len(inputs))
	args := make([]any, 0, len(inputs)*5)
	for index, input := range inputs {
		rows = append(rows, "(CAST(? AS BIGINT), CAST(? AS BIGINT), CAST(? AS BIGINT), CAST(? AS VARCHAR), CAST(? AS VARCHAR))")
		args = append(args, int64(index), input.OriginRecordID, input.SettlementRecordID, string(input.LinkType), optionalStringArg(input.Memo))
	}
	return "VALUES " + strings.Join(rows, ", "), args
}

func createRecordLinkParentInput(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE record_link_parent_input AS
SELECT DISTINCT origin_transaction_id AS transaction_id FROM record_link_input
UNION
SELECT DISTINCT settlement_transaction_id AS transaction_id FROM record_link_input`); err != nil {
		return fmt.Errorf("stage record link parent updates: %w", err)
	}
	return nil
}

func dropRecordLinkInputTables(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, "DROP TABLE IF EXISTS record_link_parent_input"); err != nil {
		return fmt.Errorf("drop record link parent input: %w", err)
	}
	if _, err := tx.ExecContext(ctx, "DROP TABLE IF EXISTS record_link_input"); err != nil {
		return fmt.Errorf("drop record link input: %w", err)
	}
	return nil
}

type recordLinkScanner interface {
	Scan(dest ...any) error
}

func scanRecordLink(scanner recordLinkScanner) (RecordLink, error) {
	var link RecordLink
	var linkType string
	var memo sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&link.ID,
		&link.OriginRecordID,
		&link.SettlementRecordID,
		&linkType,
		&memo,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return RecordLink{}, err
	}

	link.LinkType = RecordLinkType(linkType)
	link.Memo = optionalStringFromSQL(memo)
	link.CreatedAt = createdAt.UTC()
	link.UpdatedAt = updatedAt.UTC()
	link.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return link, nil
}
