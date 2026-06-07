-- +goose Up
CREATE TABLE transaction (
	transaction_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Human-facing calendar date the transaction happened, distinct from formal banking timestamps on records that may be future dated.
	initiated_date DATE NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN transaction.initiated_date IS 'Human-facing calendar date the transaction happened, distinct from formal banking timestamps on records that may be future dated.';

CREATE TABLE journal_record (
	record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	transaction_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	member_id INTEGER,
	-- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
	currency TEXT NOT NULL,
	-- Signed debit or credit amount in the record currency.
	amount DECIMAL(18,8) NOT NULL,
	-- Signed USD conversion at recording time; NULL when no exchange rate is available.
	amount_usd DECIMAL(18,8),
	category_id INTEGER NOT NULL,
	-- Tag IDs assigned to this record for flexible grouping.
	tag_ids INTEGER[] NOT NULL DEFAULT [],
	-- Optional record note or description.
	memo TEXT,
	-- UTC banking transaction timestamp, such as a card hold; for non-bank records, initiated_date as a full timestamp.
	pending_date TIMESTAMP NOT NULL,
	-- UTC timestamp when the record posted; equal to pending_date for manual non-bank records and NULL until posted.
	posted_date TIMESTAMP DEFAULT NULL,
	-- Banking lifecycle state for this record.
	posting_status posting_status NOT NULL,
	-- Import/reconciliation matching state.
	reconciliation_status reconciliation_status NOT NULL DEFAULT 'RECONCILED',
	-- Origin of this record.
	source source NOT NULL,
	-- Identifier assigned by an external system when this record is linked outside Mina.
	external_id TEXT,
	-- External system namespace for external_id.
	external_system TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN journal_record.currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN journal_record.amount IS 'Signed debit or credit amount in the record currency.';
COMMENT ON COLUMN journal_record.amount_usd IS 'Signed USD conversion at recording time; NULL when no exchange rate is available.';
COMMENT ON COLUMN journal_record.tag_ids IS 'Tag IDs assigned to this record for flexible grouping.';
COMMENT ON COLUMN journal_record.memo IS 'Optional record note or description.';
COMMENT ON COLUMN journal_record.pending_date IS 'UTC banking transaction timestamp, such as a card hold; for non-bank records, initiated_date as a full timestamp.';
COMMENT ON COLUMN journal_record.posted_date IS 'UTC timestamp when the record posted; equal to pending_date for manual non-bank records and NULL until posted.';
COMMENT ON COLUMN journal_record.posting_status IS 'Banking lifecycle state for this record.';
COMMENT ON COLUMN journal_record.reconciliation_status IS 'Import/reconciliation matching state.';
COMMENT ON COLUMN journal_record.source IS 'Origin of this record.';
COMMENT ON COLUMN journal_record.external_id IS 'Identifier assigned by an external system when this record is linked outside Mina.';
COMMENT ON COLUMN journal_record.external_system IS 'External system namespace for external_id.';

CREATE INDEX journal_record_transaction_id_idx
ON journal_record(transaction_id);
