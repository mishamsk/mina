-- +goose Up
-- Existing naive timestamps are Mina's recorded UTC wall-clock values. Every
-- conversion therefore attaches UTC explicitly instead of consulting the
-- DuckDB session timezone.
-- DuckDB cannot alter columns covered by constraints or indexes inside this
-- migration transaction, so only those tables are rebuilt.

CREATE TABLE account_v17 (
	account_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	fqn TEXT NOT NULL,
	display_label TEXT,
	account_type account_type NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	is_featured BOOLEAN NOT NULL DEFAULT FALSE,
	currency TEXT,
	external_id TEXT,
	external_system TEXT,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

INSERT INTO account_v17 (
	account_id, fqn, display_label, account_type, is_hidden, is_featured, currency,
	external_id, external_system, created_at, updated_at, tombstoned_at
)
SELECT
	account_id, fqn, display_label, account_type, is_hidden, is_featured, currency,
	external_id, external_system, created_at AT TIME ZONE 'UTC',
	updated_at AT TIME ZONE 'UTC', tombstoned_at AT TIME ZONE 'UTC'
FROM account;

DROP TABLE account;
ALTER TABLE account_v17 RENAME TO account;

CREATE TABLE api_audit_entry_v17 (
	api_audit_entry_id BIGINT PRIMARY KEY DEFAULT nextval('api_audit_entry_id_seq'),
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
	operation_id TEXT NOT NULL,
	method TEXT NOT NULL,
	request_uri TEXT NOT NULL,
	response_status INTEGER NOT NULL,
	duration_microseconds BIGINT NOT NULL,
	client_surface api_audit_client_surface NOT NULL,
	request_json JSON,
	response_json JSON
);

INSERT INTO api_audit_entry_v17
SELECT
	api_audit_entry_id, occurred_at AT TIME ZONE 'UTC', operation_id, method,
	request_uri, response_status, duration_microseconds, client_surface,
	request_json, response_json
FROM api_audit_entry;

DROP TABLE api_audit_entry;
ALTER TABLE api_audit_entry_v17 RENAME TO api_audit_entry;

CREATE TABLE budget_v17 (
	budget_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	category_fqn TEXT NOT NULL,
	month DATE NOT NULL,
	amount DECIMAL(18,8) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE,
	UNIQUE(category_fqn, month, tombstoned_at)
);

INSERT INTO budget_v17
SELECT
	budget_id, category_fqn, month, amount, created_at AT TIME ZONE 'UTC',
	updated_at AT TIME ZONE 'UTC', tombstoned_at AT TIME ZONE 'UTC'
FROM budget;

DROP TABLE budget;
ALTER TABLE budget_v17 RENAME TO budget;

CREATE TABLE category_v17 (
	category_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	fqn TEXT NOT NULL,
	economic_intent category_economic_intent NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	is_featured BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

INSERT INTO category_v17 (
	category_id, fqn, economic_intent, is_hidden, is_featured, created_at, updated_at, tombstoned_at
)
SELECT
	category_id, fqn, economic_intent, is_hidden, is_featured,
	created_at AT TIME ZONE 'UTC', updated_at AT TIME ZONE 'UTC',
	tombstoned_at AT TIME ZONE 'UTC'
FROM category;

DROP TABLE category;
ALTER TABLE category_v17 RENAME TO category;

CREATE TABLE credit_limit_history_v17 (
	credit_limit_history_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	account_id INTEGER NOT NULL,
	credit_limit DECIMAL(18,8) NOT NULL,
	effective_date DATE NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE,
	UNIQUE(account_id, effective_date, tombstoned_at)
);

INSERT INTO credit_limit_history_v17
SELECT
	credit_limit_history_id, account_id, credit_limit, effective_date,
	created_at AT TIME ZONE 'UTC', tombstoned_at AT TIME ZONE 'UTC'
FROM credit_limit_history;

DROP TABLE credit_limit_history;
ALTER TABLE credit_limit_history_v17 RENAME TO credit_limit_history;

ALTER TABLE exchange_rate
ALTER effective_date SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING effective_date AT TIME ZONE 'UTC';
ALTER TABLE exchange_rate
ALTER created_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING created_at AT TIME ZONE 'UTC';
ALTER TABLE exchange_rate
ALTER tombstoned_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING tombstoned_at AT TIME ZONE 'UTC';

ALTER TABLE imported_record_metadata
ALTER provider_authorized_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING provider_authorized_at AT TIME ZONE 'UTC';
ALTER TABLE imported_record_metadata
ALTER provider_posted_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING provider_posted_at AT TIME ZONE 'UTC';
ALTER TABLE imported_record_metadata
ALTER created_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING created_at AT TIME ZONE 'UTC';
ALTER TABLE imported_record_metadata
ALTER updated_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE imported_record_metadata
ALTER tombstoned_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING tombstoned_at AT TIME ZONE 'UTC';

CREATE TABLE journal_record_v17 (
	record_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	transaction_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	member_id INTEGER,
	currency TEXT NOT NULL,
	amount DECIMAL(18,8) NOT NULL,
	amount_usd DECIMAL(18,8),
	category_id INTEGER,
	tag_ids INTEGER[] NOT NULL DEFAULT [],
	memo TEXT,
	pending_date TIMESTAMP WITH TIME ZONE,
	posted_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
	reconciliation_status reconciliation_status NOT NULL DEFAULT 'RECONCILED',
	source source NOT NULL,
	external_id TEXT,
	external_system TEXT,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE
);

INSERT INTO journal_record_v17
SELECT
	record_id, transaction_id, account_id, member_id, currency, amount, amount_usd,
	category_id, tag_ids, memo, pending_date AT TIME ZONE 'UTC',
	posted_date AT TIME ZONE 'UTC', reconciliation_status, source, external_id,
	external_system, created_at AT TIME ZONE 'UTC', updated_at AT TIME ZONE 'UTC',
	tombstoned_at AT TIME ZONE 'UTC'
FROM journal_record;

DROP TABLE journal_record;
ALTER TABLE journal_record_v17 RENAME TO journal_record;

CREATE TABLE member_v17 (
	member_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	name TEXT NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE,
	UNIQUE(name, tombstoned_at)
);

INSERT INTO member_v17
SELECT
	member_id, name, is_hidden, created_at AT TIME ZONE 'UTC',
	updated_at AT TIME ZONE 'UTC', tombstoned_at AT TIME ZONE 'UTC'
FROM member;

DROP TABLE member;
ALTER TABLE member_v17 RENAME TO member;

ALTER TABLE record_link
ALTER created_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING created_at AT TIME ZONE 'UTC';
ALTER TABLE record_link
ALTER updated_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE record_link
ALTER tombstoned_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING tombstoned_at AT TIME ZONE 'UTC';

CREATE TABLE recurring_definition_v17 (
	recurring_definition_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	fqn TEXT NOT NULL,
	schedule_rule JSON NOT NULL,
	anchor_date DATE NOT NULL,
	definition_version INTEGER NOT NULL DEFAULT 1,
	paused_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (ARRAY_LENGTH(SPLIT(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

INSERT INTO recurring_definition_v17 (
	recurring_definition_id, fqn, schedule_rule, anchor_date, definition_version,
	paused_at, created_at, updated_at, tombstoned_at
)
SELECT
	recurring_definition_id, fqn, schedule_rule, anchor_date, definition_version,
	paused_at AT TIME ZONE 'UTC', created_at AT TIME ZONE 'UTC',
	updated_at AT TIME ZONE 'UTC', tombstoned_at AT TIME ZONE 'UTC'
FROM recurring_definition;

DROP TABLE recurring_definition;
ALTER TABLE recurring_definition_v17 RENAME TO recurring_definition;

ALTER TABLE recurring_definition_record
ALTER created_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING created_at AT TIME ZONE 'UTC';
ALTER TABLE recurring_definition_record
ALTER updated_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE recurring_definition_record
ALTER tombstoned_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING tombstoned_at AT TIME ZONE 'UTC';

ALTER TABLE recurring_occurrence
ALTER materialized_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING materialized_at AT TIME ZONE 'UTC';
ALTER TABLE recurring_occurrence
ALTER reviewed_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING reviewed_at AT TIME ZONE 'UTC';
ALTER TABLE recurring_occurrence
ALTER created_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING created_at AT TIME ZONE 'UTC';
ALTER TABLE recurring_occurrence
ALTER updated_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING updated_at AT TIME ZONE 'UTC';

CREATE TABLE tag_v17 (
	tag_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	fqn TEXT NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	is_featured BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

INSERT INTO tag_v17 (
	tag_id, fqn, is_hidden, is_featured, created_at, updated_at, tombstoned_at
)
SELECT
	tag_id, fqn, is_hidden, is_featured, created_at AT TIME ZONE 'UTC',
	updated_at AT TIME ZONE 'UTC', tombstoned_at AT TIME ZONE 'UTC'
FROM tag;

DROP TABLE tag;
ALTER TABLE tag_v17 RENAME TO tag;

ALTER TABLE transaction
ALTER created_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING created_at AT TIME ZONE 'UTC';
ALTER TABLE transaction
ALTER updated_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE transaction
ALTER tombstoned_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING tombstoned_at AT TIME ZONE 'UTC';

CREATE TABLE transaction_template_v17 (
	transaction_template_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	fqn TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

INSERT INTO transaction_template_v17 (
	transaction_template_id, fqn, created_at, updated_at, tombstoned_at
)
SELECT
	transaction_template_id, fqn, created_at AT TIME ZONE 'UTC',
	updated_at AT TIME ZONE 'UTC', tombstoned_at AT TIME ZONE 'UTC'
FROM transaction_template;

DROP TABLE transaction_template;
ALTER TABLE transaction_template_v17 RENAME TO transaction_template;

ALTER TABLE transaction_template_record
ALTER created_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING created_at AT TIME ZONE 'UTC';
ALTER TABLE transaction_template_record
ALTER updated_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE transaction_template_record
ALTER tombstoned_at SET DATA TYPE TIMESTAMP WITH TIME ZONE
USING tombstoned_at AT TIME ZONE 'UTC';

CREATE UNIQUE INDEX account_active_fqn_unique
ON account ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

CREATE INDEX api_audit_entry_occurred_at_idx
ON api_audit_entry (occurred_at, api_audit_entry_id);

CREATE UNIQUE INDEX budget_active_category_month_unique
ON budget ((CASE WHEN tombstoned_at IS NULL THEN category_fqn || ':' || CAST(month AS VARCHAR) ELSE NULL END));

CREATE UNIQUE INDEX category_active_fqn_unique
ON category ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

CREATE UNIQUE INDEX credit_limit_history_active_account_date_unique
ON credit_limit_history ((CASE WHEN tombstoned_at IS NULL THEN CAST(account_id AS VARCHAR) || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));

CREATE INDEX journal_record_transaction_id_idx
ON journal_record(transaction_id);

CREATE UNIQUE INDEX member_active_name_unique
ON member ((CASE WHEN tombstoned_at IS NULL THEN name ELSE NULL END));

CREATE UNIQUE INDEX recurring_definition_active_fqn_unique
ON recurring_definition ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

CREATE UNIQUE INDEX tag_active_fqn_unique
ON tag ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

CREATE UNIQUE INDEX transaction_template_active_fqn_unique
ON transaction_template ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

COMMENT ON COLUMN account.fqn IS 'Colon-separated hierarchical account path, e.g. checking:Chase:Primary.';
COMMENT ON COLUMN account.display_label IS 'Optional presentation label; NULL uses the account-service fallback from the final one or two FQN segments.';
COMMENT ON COLUMN account.account_type IS 'Explicit semantic account type used for balances and transaction classification.';
COMMENT ON COLUMN account.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN account.is_featured IS 'Marks active rows for prominent UI/account-picker placement without changing accounting semantics.';
COMMENT ON COLUMN account.currency IS 'NULL means multi-currency; otherwise an ISO 4217 code or C::-prefixed crypto ticker required by every active journal and recurring-definition record.';
COMMENT ON COLUMN account.external_id IS 'Identifier assigned by an external system when this account is linked outside Mina.';
COMMENT ON COLUMN account.external_system IS 'External system namespace for external_id, e.g. plaid.';
COMMENT ON COLUMN account.parent_fqn IS 'Parent account path derived from fqn, or NULL for root accounts.';
COMMENT ON COLUMN account.name IS 'Leaf account name derived from fqn.';
COMMENT ON COLUMN account.level IS 'Zero-based account depth derived from fqn.';
COMMENT ON COLUMN budget.category_fqn IS 'Category path this monthly budget applies to.';
COMMENT ON COLUMN budget.month IS 'Budget month, stored as the first calendar date of that month.';
COMMENT ON COLUMN budget.amount IS 'Budgeted amount for category_fqn during month.';
COMMENT ON COLUMN category.fqn IS 'Colon-separated hierarchical category path, e.g. Food:Restaurants.';
COMMENT ON COLUMN category.economic_intent IS 'Explicit economic meaning used for transaction classification.';
COMMENT ON COLUMN category.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN category.is_featured IS 'Marks active rows for prominent UI/account-picker placement without changing accounting semantics.';
COMMENT ON COLUMN category.parent_fqn IS 'Parent category path derived from fqn, or NULL for root categories.';
COMMENT ON COLUMN category.name IS 'Leaf category name derived from fqn.';
COMMENT ON COLUMN category.level IS 'Zero-based category depth derived from fqn.';
COMMENT ON COLUMN credit_limit_history.credit_limit IS 'Credit limit amount denominated in the owning single-currency account''s currency.';
COMMENT ON COLUMN credit_limit_history.effective_date IS 'Calendar date when this credit limit starts applying.';
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
COMMENT ON COLUMN member.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN recurring_definition.fqn IS 'Colon-separated hierarchical recurring definition path, e.g. Subscriptions:Netflix.';
COMMENT ON COLUMN recurring_definition.schedule_rule IS 'Versioned JSON schedule payload validated by the recurring service.';
COMMENT ON COLUMN recurring_definition.anchor_date IS 'Schedule anchor and generation floor used to compute due dates.';
COMMENT ON COLUMN recurring_definition.definition_version IS 'Monotonic version incremented on every schedule or record-shape edit.';
COMMENT ON COLUMN recurring_definition.paused_at IS 'Set while paused; paused definitions do not accrue occurrences.';
COMMENT ON COLUMN recurring_definition.tombstoned_at IS 'Soft delete timestamp; generated history is retained.';
COMMENT ON COLUMN recurring_definition.parent_fqn IS 'Parent recurring definition path derived from fqn, or NULL for root definitions.';
COMMENT ON COLUMN recurring_definition.name IS 'Leaf recurring definition name derived from fqn.';
COMMENT ON COLUMN recurring_definition.level IS 'Zero-based recurring definition depth derived from fqn.';
COMMENT ON COLUMN tag.fqn IS 'Colon-separated hierarchical tag path, e.g. Trips:Vacation.';
COMMENT ON COLUMN tag.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN tag.is_featured IS 'Marks active rows for prominent UI/account-picker placement without changing accounting semantics.';
COMMENT ON COLUMN tag.parent_fqn IS 'Parent tag path derived from fqn, or NULL for root tags.';
COMMENT ON COLUMN tag.name IS 'Leaf tag name derived from fqn.';
COMMENT ON COLUMN tag.level IS 'Zero-based tag depth derived from fqn.';
COMMENT ON COLUMN transaction_template.fqn IS 'Colon-separated hierarchical template path, e.g. Utilities:Electric.';
COMMENT ON COLUMN transaction_template.parent_fqn IS 'Parent template path derived from fqn, or NULL for root templates.';
COMMENT ON COLUMN transaction_template.name IS 'Leaf template name derived from fqn.';
COMMENT ON COLUMN transaction_template.level IS 'Zero-based template depth derived from fqn.';
