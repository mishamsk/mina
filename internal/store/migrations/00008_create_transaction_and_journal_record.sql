-- +goose Up
CREATE TABLE transaction (
	transaction_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	initiated_date DATE NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN transaction.initiated_date IS 'Calendar date the transaction happened, independent of time zone.';

CREATE TABLE journal_record (
	record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	transaction_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	member_id INTEGER,
	currency TEXT NOT NULL,
	amount DECIMAL(18,8) NOT NULL,
	amount_usd DECIMAL(18,8) NOT NULL,
	category_id INTEGER NOT NULL,
	tag_ids INTEGER[] NOT NULL DEFAULT [],
	memo TEXT,
	pending_date TIMESTAMP,
	posted_date TIMESTAMP,
	posting_status posting_status NOT NULL,
	reconciliation_status reconciliation_status NOT NULL DEFAULT 'RECONCILED',
	source source NOT NULL,
	external_id TEXT,
	external_system TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN journal_record.pending_date IS 'UTC timestamp when the record appeared as pending.';
COMMENT ON COLUMN journal_record.posted_date IS 'UTC timestamp when the record posted.';

CREATE INDEX journal_record_transaction_id_idx
ON journal_record(transaction_id);
