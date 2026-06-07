-- +goose Up
CREATE TABLE account (
	account_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Colon-separated hierarchical account path, e.g. checking:Chase:Primary.
	fqn TEXT NOT NULL,
	-- Excludes active rows from default lists while keeping them selectable by explicit query.
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	-- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
	currency TEXT,
	-- Identifier assigned by an external system when this account is linked outside Mina.
	external_id TEXT,
	-- External system namespace for external_id, e.g. plaid.
	external_system TEXT,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	-- Root account kind derived from the first fqn segment.
	kind TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '^[^:]+')) VIRTUAL,
	-- Parent account path derived from fqn, or NULL for root accounts.
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	-- Leaf account name derived from fqn.
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	-- Zero-based account depth derived from fqn.
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN account.fqn IS 'Colon-separated hierarchical account path, e.g. checking:Chase:Primary.';
COMMENT ON COLUMN account.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN account.currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN account.external_id IS 'Identifier assigned by an external system when this account is linked outside Mina.';
COMMENT ON COLUMN account.external_system IS 'External system namespace for external_id, e.g. plaid.';
COMMENT ON COLUMN account.kind IS 'Root account kind derived from the first fqn segment.';
COMMENT ON COLUMN account.parent_fqn IS 'Parent account path derived from fqn, or NULL for root accounts.';
COMMENT ON COLUMN account.name IS 'Leaf account name derived from fqn.';
COMMENT ON COLUMN account.level IS 'Zero-based account depth derived from fqn.';

CREATE UNIQUE INDEX account_active_fqn_unique
ON account ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));
