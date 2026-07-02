-- +goose Up
CREATE TABLE transaction_template (
	transaction_template_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Colon-separated hierarchical template path, e.g. Utilities:Electric.
	fqn TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	-- Parent template path derived from fqn, or NULL for root templates.
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	-- Leaf template name derived from fqn.
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	-- Zero-based template depth derived from fqn.
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN transaction_template.fqn IS 'Colon-separated hierarchical template path, e.g. Utilities:Electric.';
COMMENT ON COLUMN transaction_template.parent_fqn IS 'Parent template path derived from fqn, or NULL for root templates.';
COMMENT ON COLUMN transaction_template.name IS 'Leaf template name derived from fqn.';
COMMENT ON COLUMN transaction_template.level IS 'Zero-based template depth derived from fqn.';

CREATE TABLE transaction_template_record (
	transaction_template_record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	transaction_template_id INTEGER NOT NULL,
	-- Category is the minimum record default required for manual-entry templates.
	category_id INTEGER NOT NULL,
	-- Optional account default for partial manual-entry templates.
	account_id INTEGER,
	-- Optional household-member default for partial manual-entry templates.
	member_id INTEGER,
	-- Optional currency default; templates do not store converted amount_usd.
	currency TEXT,
	-- Optional signed amount default; templates do not need to balance.
	amount DECIMAL(18,8),
	tag_ids INTEGER[] NOT NULL DEFAULT [],
	memo TEXT,
	posting_status posting_status,
	reconciliation_status reconciliation_status,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN transaction_template_record.category_id IS 'Category is the minimum record default required for manual-entry templates.';
COMMENT ON COLUMN transaction_template_record.account_id IS 'Optional account default for partial manual-entry templates.';
COMMENT ON COLUMN transaction_template_record.member_id IS 'Optional household-member default for partial manual-entry templates.';
COMMENT ON COLUMN transaction_template_record.currency IS 'Optional currency default; templates do not store converted amount_usd.';
COMMENT ON COLUMN transaction_template_record.amount IS 'Optional signed amount default; templates do not need to balance.';

CREATE UNIQUE INDEX transaction_template_active_fqn_unique
ON transaction_template ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));
