package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// ImportedRecordMetadataStore persists raw imported metadata for journal records.
type ImportedRecordMetadataStore struct {
	db *AppDB
}

// ImportedRecordMetadata is a DB-facing imported-record metadata row.
type ImportedRecordMetadata struct {
	ID                       int64
	RecordID                 int64
	ExternalSystem           string
	ExternalID               *string
	Description              *string
	MerchantName             *string
	MCCCode                  *string
	ProviderCategory         *string
	ProviderCategoryDetailed *string
	ProviderStatus           *string
	ProviderAuthorizedAt     *time.Time
	ProviderPostedAt         *time.Time
	RawPayload               json.RawMessage
	CreatedAt                time.Time
	UpdatedAt                time.Time
	TombstonedAt             *time.Time
}

// ImportedRecordMetadataCreateInput carries values for a new imported metadata row.
type ImportedRecordMetadataCreateInput struct {
	RecordID                 int64
	ExternalSystem           string
	ExternalID               *string
	Description              *string
	MerchantName             *string
	MCCCode                  *string
	ProviderCategory         *string
	ProviderCategoryDetailed *string
	ProviderStatus           *string
	ProviderAuthorizedAt     *time.Time
	ProviderPostedAt         *time.Time
	RawPayload               json.RawMessage
}

// NewImportedRecordMetadataStore creates an imported-record metadata store using AppDB.
func NewImportedRecordMetadataStore(db *AppDB) *ImportedRecordMetadataStore {
	return &ImportedRecordMetadataStore{db: db}
}

// BatchCreate persists imported metadata rows atomically.
func (s *ImportedRecordMetadataStore) BatchCreate(ctx context.Context, inputs []ImportedRecordMetadataCreateInput) ([]ImportedRecordMetadata, error) {
	metadata := []ImportedRecordMetadata{}
	if len(inputs) == 0 {
		return metadata, nil
	}

	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		valuesSQL, args := importedMetadataInputValues(inputs)
		defer func() { _, _ = tx.ExecContext(ctx, "DROP TABLE IF EXISTS imported_metadata_input") }()
		if _, err := tx.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE imported_metadata_input AS
SELECT input.*, jr.transaction_id, jr.record_id IS NOT NULL AND jr.tombstoned_at IS NULL AS record_active,
	parent.transaction_id IS NOT NULL AND parent.tombstoned_at IS NULL AS parent_active
FROM (`+valuesSQL+`) AS input(
	input_index, record_id, external_system, external_id, description, merchant_name, mcc_code,
	provider_category, provider_category_detailed, provider_status,
	provider_authorized_at, provider_posted_at, raw_payload
)
LEFT JOIN `+s.db.accountingName("journal_record")+` AS jr ON jr.record_id = input.record_id
LEFT JOIN `+s.db.accountingName("transaction")+` AS parent ON parent.transaction_id = jr.transaction_id`, args...); err != nil {
			return fmt.Errorf("stage imported metadata input: %w", err)
		}

		var inputCount int
		var distinctRecordCount int
		var invalidParentCount int
		var existingCount int
		if err := tx.QueryRowContext(ctx, `SELECT
	COUNT(*),
	COUNT(DISTINCT input.record_id),
	COUNT(*) FILTER (WHERE input.transaction_id IS NULL OR NOT input.record_active OR NOT input.parent_active),
	COUNT(*) FILTER (WHERE existing.imported_record_metadata_id IS NOT NULL)
FROM imported_metadata_input AS input
LEFT JOIN `+s.db.accountingName("imported_record_metadata")+` AS existing
	ON existing.record_id = input.record_id AND existing.tombstoned_at IS NULL`).Scan(
			&inputCount,
			&distinctRecordCount,
			&invalidParentCount,
			&existingCount,
		); err != nil {
			return fmt.Errorf("validate imported metadata input: %w", err)
		}
		if inputCount != distinctRecordCount || existingCount > 0 {
			return fmt.Errorf("%w: active imported record metadata already exists for journal record", ErrConflict)
		}
		if invalidParentCount > 0 {
			return ErrInvalidReference
		}

		rows, err := tx.QueryContext(ctx, `INSERT INTO `+s.db.accountingName("imported_record_metadata")+` (
	record_id, external_system, external_id, description, merchant_name, mcc_code,
	provider_category, provider_category_detailed, provider_status,
	provider_authorized_at, provider_posted_at, raw_payload
)
SELECT record_id, external_system, external_id, description, merchant_name, mcc_code,
	provider_category, provider_category_detailed, provider_status,
	provider_authorized_at, provider_posted_at, raw_payload
FROM imported_metadata_input
ORDER BY input_index
RETURNING imported_record_metadata_id, record_id, external_system, external_id, description, merchant_name, mcc_code,
	provider_category, provider_category_detailed, provider_status, provider_authorized_at, provider_posted_at, CAST(raw_payload AS VARCHAR),
	created_at, updated_at, tombstoned_at`)
		if err != nil {
			return fmt.Errorf("insert imported metadata batch: %w", err)
		}
		for rows.Next() {
			created, err := scanImportedRecordMetadata(rows)
			if err != nil {
				_ = rows.Close()
				return fmt.Errorf("scan inserted imported metadata: %w", err)
			}
			metadata = append(metadata, created)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return fmt.Errorf("iterate inserted imported metadata: %w", err)
		}
		if err := rows.Close(); err != nil {
			return fmt.Errorf("close inserted imported metadata: %w", err)
		}

		return touchTransactionsFromInput(ctx, tx, s.db, "imported_metadata_input")
	})
	if err != nil {
		if isDuckDBTransactionConflictError(err) {
			return nil, ErrConflict
		}
		return nil, err
	}

	return metadata, nil
}

// GetByRecordIDs returns active imported metadata keyed by journal record ID.
func (s *ImportedRecordMetadataStore) GetByRecordIDs(ctx context.Context, recordIDs []int64) (map[int64]ImportedRecordMetadata, error) {
	metadataByRecordID := map[int64]ImportedRecordMetadata{}
	if len(recordIDs) == 0 {
		return metadataByRecordID, nil
	}

	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT imported_record_metadata_id, record_id, external_system, external_id, description, merchant_name, mcc_code,
	provider_category, provider_category_detailed, provider_status, provider_authorized_at, provider_posted_at, CAST(raw_payload AS VARCHAR),
	created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("imported_record_metadata")+`
WHERE record_id IN (`+placeholders(len(recordIDs))+`)
  AND tombstoned_at IS NULL`,
		int64Args(recordIDs)...,
	)
	if err != nil {
		return nil, fmt.Errorf("list imported record metadata: %w", err)
	}

	for rows.Next() {
		metadata, err := scanImportedRecordMetadata(rows)
		if err != nil {
			return nil, fmt.Errorf("scan imported record metadata: %w", err)
		}
		metadataByRecordID[metadata.RecordID] = metadata
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate imported record metadata: %w; close imported record metadata rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate imported record metadata: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close imported record metadata rows: %w", err)
	}

	return metadataByRecordID, nil
}

// TombstoneByRecordIDs tombstones active imported metadata for journal records atomically.
func (s *ImportedRecordMetadataStore) TombstoneByRecordIDs(ctx context.Context, recordIDs []int64) error {
	if len(recordIDs) == 0 {
		return nil
	}

	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		recordIDs = uniqueSortedInt64s(recordIDs)
		valuesSQL, args := int64InputValues(recordIDs)
		defer func() { _, _ = tx.ExecContext(ctx, "DROP TABLE IF EXISTS imported_metadata_input") }()
		if _, err := tx.ExecContext(ctx, `CREATE OR REPLACE TEMP TABLE imported_metadata_input AS
SELECT DISTINCT metadata.record_id, jr.transaction_id, parent.transaction_id IS NOT NULL AS parent_exists
FROM (`+valuesSQL+`) AS requested(record_id)
JOIN `+s.db.accountingName("imported_record_metadata")+` AS metadata
	ON metadata.record_id = requested.record_id AND metadata.tombstoned_at IS NULL
LEFT JOIN `+s.db.accountingName("journal_record")+` AS jr ON jr.record_id = metadata.record_id
LEFT JOIN `+s.db.accountingName("transaction")+` AS parent ON parent.transaction_id = jr.transaction_id`, args...); err != nil {
			return fmt.Errorf("stage imported metadata tombstones: %w", err)
		}
		var invalidParents int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FILTER (WHERE transaction_id IS NULL OR NOT parent_exists)
FROM imported_metadata_input`).Scan(&invalidParents); err != nil {
			return fmt.Errorf("validate imported metadata parents: %w", err)
		}
		if invalidParents > 0 {
			return ErrInvalidReference
		}
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("imported_record_metadata")+` AS metadata
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
			FROM imported_metadata_input AS input
WHERE metadata.record_id = input.record_id
  AND metadata.tombstoned_at IS NULL`,
		); err != nil {
			return fmt.Errorf("tombstone imported record metadata: %w", err)
		}

		return touchTransactionsFromInput(ctx, tx, s.db, "imported_metadata_input")
	})
	if isDuckDBTransactionConflictError(err) {
		return ErrConflict
	}
	return err
}

func importedMetadataInputValues(inputs []ImportedRecordMetadataCreateInput) (string, []any) {
	rows := make([]string, 0, len(inputs))
	args := make([]any, 0, len(inputs)*13)
	for index, input := range inputs {
		rows = append(rows, `(CAST(? AS BIGINT), CAST(? AS BIGINT), CAST(? AS VARCHAR), CAST(? AS VARCHAR), CAST(? AS VARCHAR),
	CAST(? AS VARCHAR), CAST(? AS VARCHAR), CAST(? AS VARCHAR), CAST(? AS VARCHAR), CAST(? AS VARCHAR),
	CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP), CAST(? AS JSON))`)
		args = append(args,
			int64(index),
			input.RecordID,
			input.ExternalSystem,
			optionalStringArg(input.ExternalID),
			optionalStringArg(input.Description),
			optionalStringArg(input.MerchantName),
			optionalStringArg(input.MCCCode),
			optionalStringArg(input.ProviderCategory),
			optionalStringArg(input.ProviderCategoryDetailed),
			optionalStringArg(input.ProviderStatus),
			nullableTimestampArg(input.ProviderAuthorizedAt),
			nullableTimestampArg(input.ProviderPostedAt),
			rawJSONArg(input.RawPayload),
		)
	}
	return "VALUES " + strings.Join(rows, ", "), args
}

type importedRecordMetadataScanner interface {
	Scan(dest ...any) error
}

func scanImportedRecordMetadata(scanner importedRecordMetadataScanner) (ImportedRecordMetadata, error) {
	var metadata ImportedRecordMetadata
	var externalID sql.NullString
	var description sql.NullString
	var merchantName sql.NullString
	var mccCode sql.NullString
	var providerCategory sql.NullString
	var providerCategoryDetailed sql.NullString
	var providerStatus sql.NullString
	var providerAuthorizedAt sql.NullTime
	var providerPostedAt sql.NullTime
	var rawPayload sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&metadata.ID,
		&metadata.RecordID,
		&metadata.ExternalSystem,
		&externalID,
		&description,
		&merchantName,
		&mccCode,
		&providerCategory,
		&providerCategoryDetailed,
		&providerStatus,
		&providerAuthorizedAt,
		&providerPostedAt,
		&rawPayload,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return ImportedRecordMetadata{}, err
	}

	metadata.ExternalID = optionalStringFromSQL(externalID)
	metadata.Description = optionalStringFromSQL(description)
	metadata.MerchantName = optionalStringFromSQL(merchantName)
	metadata.MCCCode = optionalStringFromSQL(mccCode)
	metadata.ProviderCategory = optionalStringFromSQL(providerCategory)
	metadata.ProviderCategoryDetailed = optionalStringFromSQL(providerCategoryDetailed)
	metadata.ProviderStatus = optionalStringFromSQL(providerStatus)
	metadata.ProviderAuthorizedAt = nullableTimeFromSQL(providerAuthorizedAt)
	metadata.ProviderPostedAt = nullableTimeFromSQL(providerPostedAt)
	if rawPayload.Valid {
		metadata.RawPayload = json.RawMessage(rawPayload.String)
	}
	metadata.CreatedAt = createdAt.UTC()
	metadata.UpdatedAt = updatedAt.UTC()
	metadata.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return metadata, nil
}

func optionalStringArg(value *string) any {
	if value == nil {
		return nil
	}

	return *value
}

func optionalStringFromSQL(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}

	return &value.String
}

func rawJSONArg(value json.RawMessage) any {
	if len(value) == 0 {
		return nil
	}

	return string(value)
}
