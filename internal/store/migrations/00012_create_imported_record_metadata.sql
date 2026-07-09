-- +goose Up
-- Raw provider metadata captured for imported journal records
CREATE TABLE imported_record_metadata (
	imported_record_metadata_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Journal record this imported metadata belongs to.
	record_id INTEGER NOT NULL,
	-- External system namespace that produced this metadata, e.g. plaid.
	external_system TEXT NOT NULL,
	-- Transaction identifier assigned by the external system.
	external_id TEXT,
	-- Raw provider transaction description or comment text.
	description TEXT,
	-- Provider merchant or payee display text.
	merchant_name TEXT,
	-- Provider merchant category code; text to preserve leading zeros.
	mcc_code TEXT,
	-- Primary provider category label when present.
	provider_category TEXT,
	-- Detailed provider category label when present.
	provider_category_detailed TEXT,
	-- Provider record status text, e.g. pending or posted, as reported by the provider.
	provider_status TEXT,
	-- UTC timestamp when the provider authorized the underlying transaction.
	provider_authorized_at TIMESTAMP,
	-- UTC timestamp when the provider posted the underlying transaction.
	provider_posted_at TIMESTAMP,
	-- Raw provider payload for this record as received; NULL when the source provides none.
	raw_payload JSON,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(record_id, tombstoned_at)
);

COMMENT ON COLUMN imported_record_metadata.record_id IS 'Journal record this imported metadata belongs to.';
COMMENT ON COLUMN imported_record_metadata.external_system IS 'External system namespace that produced this metadata, e.g. plaid.';
COMMENT ON COLUMN imported_record_metadata.external_id IS 'Transaction identifier assigned by the external system.';
COMMENT ON COLUMN imported_record_metadata.description IS 'Raw provider transaction description or comment text.';
COMMENT ON COLUMN imported_record_metadata.merchant_name IS 'Provider merchant or payee display text.';
COMMENT ON COLUMN imported_record_metadata.mcc_code IS 'Provider merchant category code; text to preserve leading zeros.';
COMMENT ON COLUMN imported_record_metadata.provider_category IS 'Primary provider category label when present.';
COMMENT ON COLUMN imported_record_metadata.provider_category_detailed IS 'Detailed provider category label when present.';
COMMENT ON COLUMN imported_record_metadata.provider_status IS 'Provider record status text, e.g. pending or posted, as reported by the provider.';
COMMENT ON COLUMN imported_record_metadata.provider_authorized_at IS 'UTC timestamp when the provider authorized the underlying transaction.';
COMMENT ON COLUMN imported_record_metadata.provider_posted_at IS 'UTC timestamp when the provider posted the underlying transaction.';
COMMENT ON COLUMN imported_record_metadata.raw_payload IS 'Raw provider payload for this record as received; NULL when the source provides none.';

CREATE UNIQUE INDEX imported_record_metadata_active_record_unique
ON imported_record_metadata ((CASE WHEN tombstoned_at IS NULL THEN record_id ELSE NULL END));
