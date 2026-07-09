package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
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
		for _, input := range inputs {
			row := tx.QueryRowContext(
				ctx,
				`INSERT INTO `+s.db.accountingName("imported_record_metadata")+` (
	record_id, external_system, external_id, description, merchant_name, mcc_code,
	provider_category, provider_category_detailed, provider_status,
	provider_authorized_at, provider_posted_at, raw_payload
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))
RETURNING imported_record_metadata_id, record_id, external_system, external_id, description, merchant_name, mcc_code,
	provider_category, provider_category_detailed, provider_status, provider_authorized_at, provider_posted_at, CAST(raw_payload AS VARCHAR),
	created_at, updated_at, tombstoned_at`,
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
			created, err := scanImportedRecordMetadata(row)
			if err != nil {
				if isUniqueConstraintError(err) {
					return fmt.Errorf("%w: active imported record metadata already exists for journal record", ErrConflict)
				}
				return fmt.Errorf("insert imported record metadata: %w", err)
			}
			metadata = append(metadata, created)
		}

		return nil
	})
	if err != nil {
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

	return s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("imported_record_metadata")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE record_id IN (`+placeholders(len(recordIDs))+`)
  AND tombstoned_at IS NULL`,
			int64Args(recordIDs)...,
		); err != nil {
			return fmt.Errorf("tombstone imported record metadata: %w", err)
		}

		return nil
	})
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
