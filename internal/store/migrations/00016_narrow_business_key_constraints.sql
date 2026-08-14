-- +goose Up
DROP INDEX exchange_rate_active_pair_date_unique;
DROP INDEX imported_record_metadata_active_record_unique;
DROP INDEX record_link_active_pair_unique;

CREATE TABLE exchange_rate_v16 (
	exchange_rate_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	from_currency TEXT NOT NULL,
	to_currency TEXT NOT NULL,
	rate DECIMAL(18,8) NOT NULL,
	effective_date TIMESTAMP NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

INSERT INTO exchange_rate_v16 BY NAME SELECT * FROM exchange_rate;
DROP TABLE exchange_rate;
ALTER TABLE exchange_rate_v16 RENAME TO exchange_rate;

COMMENT ON COLUMN exchange_rate.from_currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN exchange_rate.to_currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN exchange_rate.rate IS 'Multiplicative conversion rate from from_currency to to_currency.';
COMMENT ON COLUMN exchange_rate.effective_date IS 'UTC timestamp when the exchange rate becomes effective.';

CREATE TABLE imported_record_metadata_v16 (
	imported_record_metadata_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	record_id INTEGER NOT NULL,
	external_system TEXT NOT NULL,
	external_id TEXT,
	description TEXT,
	merchant_name TEXT,
	mcc_code TEXT,
	provider_category TEXT,
	provider_category_detailed TEXT,
	provider_status TEXT,
	provider_authorized_at TIMESTAMP,
	provider_posted_at TIMESTAMP,
	raw_payload JSON,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

INSERT INTO imported_record_metadata_v16 BY NAME SELECT * FROM imported_record_metadata;
DROP TABLE imported_record_metadata;
ALTER TABLE imported_record_metadata_v16 RENAME TO imported_record_metadata;

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

CREATE TABLE record_link_v16 (
	record_link_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	origin_record_id INTEGER NOT NULL,
	settlement_record_id INTEGER NOT NULL,
	link_type record_link_type NOT NULL,
	memo TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

INSERT INTO record_link_v16 BY NAME SELECT * FROM record_link;
DROP TABLE record_link;
ALTER TABLE record_link_v16 RENAME TO record_link;

COMMENT ON COLUMN record_link.origin_record_id IS 'Journal record for the original economic event (the spend being refunded, or the business expense being reimbursed).';
COMMENT ON COLUMN record_link.settlement_record_id IS 'Journal record that settles the origin record (the refund, or the reimbursement payout).';
COMMENT ON COLUMN record_link.link_type IS 'Distinguishes refund links from business-expense reimbursement links.';
COMMENT ON COLUMN record_link.memo IS 'Optional free-text context for the link.';

CREATE TABLE recurring_occurrence_v16 (
	recurring_occurrence_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	recurring_definition_id INTEGER NOT NULL,
	scheduled_date DATE NOT NULL,
	status recurring_occurrence_status NOT NULL DEFAULT 'EXPECTED',
	materialized_definition_version INTEGER NOT NULL,
	materialized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	reviewed_at TIMESTAMP,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO recurring_occurrence_v16 BY NAME SELECT * FROM recurring_occurrence;
DROP TABLE recurring_occurrence;
ALTER TABLE recurring_occurrence_v16 RENAME TO recurring_occurrence;

COMMENT ON COLUMN recurring_occurrence.scheduled_date IS 'Schedule-computed due date for this occurrence slot.';
COMMENT ON COLUMN recurring_occurrence.status IS 'Lifecycle status for this occurrence; all statuses except EXPECTED are terminal.';
COMMENT ON COLUMN recurring_occurrence.materialized_definition_version IS 'Definition version this occurrence materialized from.';
COMMENT ON COLUMN recurring_occurrence.materialized_at IS 'When this occurrence row was created.';
COMMENT ON COLUMN recurring_occurrence.reviewed_at IS 'When this occurrence reached a terminal status; NULL while EXPECTED.';
