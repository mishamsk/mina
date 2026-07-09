package store

import (
	"context"
	"database/sql"
	"fmt"
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
		for _, input := range inputs {
			row := tx.QueryRowContext(
				ctx,
				`INSERT INTO `+s.db.accountingName("record_link")+` (
	origin_record_id, settlement_record_id, link_type, memo
)
VALUES (?, ?, ?, ?)
RETURNING record_link_id, origin_record_id, settlement_record_id, CAST(link_type AS VARCHAR), memo,
	created_at, updated_at, tombstoned_at`,
				input.OriginRecordID,
				input.SettlementRecordID,
				string(input.LinkType),
				optionalStringArg(input.Memo),
			)
			created, err := scanRecordLink(row)
			if err != nil {
				if isUniqueConstraintError(err) {
					return fmt.Errorf("%w: active record link already exists for origin and settlement records", ErrConflict)
				}
				return fmt.Errorf("insert record link: %w", err)
			}
			links = append(links, created)
		}

		return nil
	})
	if err != nil {
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

	return s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("record_link")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE record_link_id IN (`+placeholders(len(ids))+`)
  AND tombstoned_at IS NULL`,
			int64Args(ids)...,
		); err != nil {
			return fmt.Errorf("tombstone record links: %w", err)
		}

		return nil
	})
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
