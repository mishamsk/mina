-- +goose Up
CREATE TYPE recurring_occurrence_status AS ENUM (
	'EXPECTED',
	'CONFIRMED',
	'DISMISSED',
	'DEFERRED'
);

CREATE TABLE recurring_definition (
	recurring_definition_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Colon-separated hierarchical recurring definition path, e.g. Subscriptions:Netflix.
	fqn TEXT NOT NULL,
	-- Versioned JSON schedule payload validated by the recurring service.
	schedule_rule JSON NOT NULL,
	-- Schedule anchor and generation floor used to compute due dates.
	anchor_date DATE NOT NULL,
	-- Monotonic version incremented on every schedule or record-shape edit.
	definition_version INTEGER NOT NULL DEFAULT 1,
	-- Set while paused; paused definitions do not accrue occurrences.
	paused_at TIMESTAMP,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- Soft delete timestamp; generated history is retained.
	tombstoned_at TIMESTAMP,
	-- Parent recurring definition path derived from fqn, or NULL for root definitions.
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE
			WHEN instr(fqn, ':') > 0
			THEN regexp_replace(fqn, ':[^:]+$', '')
			ELSE NULL
		END
	) VIRTUAL,
	-- Leaf recurring definition name derived from fqn.
	name TEXT GENERATED ALWAYS AS (
		regexp_extract(fqn, '[^:]+$')
	) VIRTUAL,
	-- Zero-based recurring definition depth derived from fqn.
	level INTEGER GENERATED ALWAYS AS (
		ARRAY_LENGTH(SPLIT(fqn, ':')) - 1
	) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN recurring_definition.fqn IS 'Colon-separated hierarchical recurring definition path, e.g. Subscriptions:Netflix.';
COMMENT ON COLUMN recurring_definition.schedule_rule IS 'Versioned JSON schedule payload validated by the recurring service.';
COMMENT ON COLUMN recurring_definition.anchor_date IS 'Schedule anchor and generation floor used to compute due dates.';
COMMENT ON COLUMN recurring_definition.definition_version IS 'Monotonic version incremented on every schedule or record-shape edit.';
COMMENT ON COLUMN recurring_definition.paused_at IS 'Set while paused; paused definitions do not accrue occurrences.';
COMMENT ON COLUMN recurring_definition.tombstoned_at IS 'Soft delete timestamp; generated history is retained.';
COMMENT ON COLUMN recurring_definition.parent_fqn IS 'Parent recurring definition path derived from fqn, or NULL for root definitions.';
COMMENT ON COLUMN recurring_definition.name IS 'Leaf recurring definition name derived from fqn.';
COMMENT ON COLUMN recurring_definition.level IS 'Zero-based recurring definition depth derived from fqn.';

CREATE TABLE recurring_definition_record (
	recurring_definition_record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	recurring_definition_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	member_id INTEGER,
	-- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
	currency TEXT NOT NULL,
	-- Signed debit or credit amount copied to generated transactions.
	amount DECIMAL(18,8) NOT NULL,
	category_id INTEGER NOT NULL,
	-- Tag IDs assigned to generated records for flexible grouping.
	tag_ids INTEGER[] NOT NULL DEFAULT [],
	-- Optional record note or description.
	memo TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);

COMMENT ON COLUMN recurring_definition_record.currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN recurring_definition_record.amount IS 'Signed debit or credit amount copied to generated transactions.';
COMMENT ON COLUMN recurring_definition_record.tag_ids IS 'Tag IDs assigned to generated records for flexible grouping.';
COMMENT ON COLUMN recurring_definition_record.memo IS 'Optional record note or description.';

CREATE TABLE recurring_occurrence (
	recurring_occurrence_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	recurring_definition_id INTEGER NOT NULL,
	-- Schedule-computed due date for this occurrence slot.
	scheduled_date DATE NOT NULL,
	status recurring_occurrence_status NOT NULL DEFAULT 'EXPECTED',
	-- Definition version this occurrence materialized from.
	materialized_definition_version INTEGER NOT NULL,
	-- When this occurrence row was created.
	materialized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	-- When this occurrence reached a terminal status; NULL while EXPECTED.
	reviewed_at TIMESTAMP,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(recurring_definition_id, scheduled_date)
);

COMMENT ON COLUMN recurring_occurrence.scheduled_date IS 'Schedule-computed due date for this occurrence slot.';
COMMENT ON COLUMN recurring_occurrence.status IS 'Lifecycle status for this occurrence; all statuses except EXPECTED are terminal.';
COMMENT ON COLUMN recurring_occurrence.materialized_definition_version IS 'Definition version this occurrence materialized from.';
COMMENT ON COLUMN recurring_occurrence.materialized_at IS 'When this occurrence row was created.';
COMMENT ON COLUMN recurring_occurrence.reviewed_at IS 'When this occurrence reached a terminal status; NULL while EXPECTED.';

CREATE UNIQUE INDEX recurring_definition_active_fqn_unique
ON recurring_definition ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));
