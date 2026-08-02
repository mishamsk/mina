-- +goose Up
CREATE TABLE transaction (
	transaction_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Human-facing calendar date the transaction happened, distinct from formal banking timestamps on records that may be future dated.
	initiated_date DATE NOT NULL,
	-- Occurrence this transaction was generated from; NULL for non-recurring transactions; the definition is reached via the occurrence.
	recurring_occurrence_id INTEGER,
	-- Transaction lifecycle, independent from balance-record settlement and tombstoning.
	lifecycle_status transaction_lifecycle_status NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN transaction.initiated_date IS 'Human-facing calendar date the transaction happened, distinct from formal banking timestamps on records that may be future dated.';
COMMENT ON COLUMN transaction.recurring_occurrence_id IS 'Occurrence this transaction was generated from; NULL for non-recurring transactions; the definition is reached via the occurrence.';
COMMENT ON COLUMN transaction.lifecycle_status IS 'Transaction lifecycle, independent from balance-record settlement and tombstoning.';

CREATE TABLE journal_record (
	record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	transaction_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	member_id INTEGER,
	-- ISO 4217 code or C::-prefixed crypto ticker; must match account.currency when that account is single-currency.
	currency TEXT NOT NULL,
	-- Signed debit or credit amount in the record currency.
	amount DECIMAL(18,8) NOT NULL,
	-- Signed USD conversion at recording time; NULL when no exchange rate is available.
	amount_usd DECIMAL(18,8),
	-- Category for flow records; NULL on every other record.
	category_id INTEGER,
	-- Tag IDs assigned to this record for flexible grouping.
	tag_ids INTEGER[] NOT NULL DEFAULT [],
	-- Optional record note or description.
	memo TEXT,
	-- UTC timestamp when the record entered pending; NULL when the record never had a pending stage.
	pending_date TIMESTAMP,
	-- UTC timestamp when the record posted; NULL until the record reaches the posted stage.
	posted_date TIMESTAMP DEFAULT NULL,
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

COMMENT ON COLUMN journal_record.currency IS 'ISO 4217 code or C::-prefixed crypto ticker; must match account.currency when that account is single-currency.';
COMMENT ON COLUMN journal_record.amount IS 'Signed debit or credit amount in the record currency.';
COMMENT ON COLUMN journal_record.amount_usd IS 'Signed USD conversion at recording time; NULL when no exchange rate is available.';
COMMENT ON COLUMN journal_record.category_id IS 'Category for flow records; NULL on every other record.';
COMMENT ON COLUMN journal_record.tag_ids IS 'Tag IDs assigned to this record for flexible grouping.';
COMMENT ON COLUMN journal_record.memo IS 'Optional record note or description.';
COMMENT ON COLUMN journal_record.pending_date IS 'UTC timestamp when the record entered pending; NULL when the record never had a pending stage.';
COMMENT ON COLUMN journal_record.posted_date IS 'UTC timestamp when the record posted; NULL until the record reaches the posted stage.';
COMMENT ON COLUMN journal_record.reconciliation_status IS 'Import/reconciliation matching state.';
COMMENT ON COLUMN journal_record.source IS 'Origin of this record.';
COMMENT ON COLUMN journal_record.external_id IS 'Identifier assigned by an external system when this record is linked outside Mina.';
COMMENT ON COLUMN journal_record.external_system IS 'External system namespace for external_id.';

CREATE INDEX journal_record_transaction_id_idx
ON journal_record(transaction_id);
