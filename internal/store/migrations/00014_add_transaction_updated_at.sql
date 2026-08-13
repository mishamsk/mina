-- +goose Up
CREATE TABLE transaction_v14 (
	transaction_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	initiated_date DATE NOT NULL,
	recurring_occurrence_id INTEGER,
	lifecycle_status transaction_lifecycle_status NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

INSERT INTO transaction_v14 (
	transaction_id,
	initiated_date,
	recurring_occurrence_id,
	lifecycle_status,
	created_at,
	updated_at,
	tombstoned_at
)
SELECT
	tx.transaction_id,
	tx.initiated_date,
	tx.recurring_occurrence_id,
	tx.lifecycle_status,
	tx.created_at,
	GREATEST(
		tx.created_at,
		(
			SELECT MAX(jr.updated_at)
			FROM journal_record AS jr
			WHERE jr.transaction_id = tx.transaction_id
		)
	),
	tx.tombstoned_at
FROM transaction AS tx;

DROP TABLE transaction;
ALTER TABLE transaction_v14 RENAME TO transaction;

COMMENT ON COLUMN transaction.initiated_date IS 'Human-facing calendar date the transaction happened, distinct from formal banking timestamps on records that may be future dated.';
COMMENT ON COLUMN transaction.recurring_occurrence_id IS 'Occurrence this transaction was generated from; NULL for non-recurring transactions; the definition is reached via the occurrence.';
COMMENT ON COLUMN transaction.lifecycle_status IS 'Transaction lifecycle, independent from balance-record settlement and tombstoning.';
