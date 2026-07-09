-- +goose Up
CREATE TYPE record_link_type AS ENUM (
	'REFUND',
	'REIMBURSEMENT'
);

-- Pairwise metadata link associating a settlement journal record (refund or
-- reimbursement payout) with an origin journal record (the spend or business
-- expense it settles).
CREATE TABLE record_link (
	record_link_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Journal record for the original economic event (the spend being refunded, or the business expense being reimbursed).
	origin_record_id INTEGER NOT NULL,
	-- Journal record that settles the origin record (the refund, or the reimbursement payout).
	settlement_record_id INTEGER NOT NULL,
	-- Distinguishes refund links from business-expense reimbursement links.
	link_type record_link_type NOT NULL,
	-- Optional free-text context for the link.
	memo TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,

	UNIQUE(origin_record_id, settlement_record_id, tombstoned_at)
);

COMMENT ON COLUMN record_link.origin_record_id IS 'Journal record for the original economic event (the spend being refunded, or the business expense being reimbursed).';
COMMENT ON COLUMN record_link.settlement_record_id IS 'Journal record that settles the origin record (the refund, or the reimbursement payout).';
COMMENT ON COLUMN record_link.link_type IS 'Distinguishes refund links from business-expense reimbursement links.';
COMMENT ON COLUMN record_link.memo IS 'Optional free-text context for the link.';

CREATE UNIQUE INDEX record_link_active_pair_unique
ON record_link ((CASE WHEN tombstoned_at IS NULL THEN CAST(origin_record_id AS VARCHAR) || ':' || CAST(settlement_record_id AS VARCHAR) ELSE NULL END));
