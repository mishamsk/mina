-- +goose Up
CREATE TABLE category (
	category_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Colon-separated hierarchical category path, e.g. Food:Restaurants.
	fqn TEXT NOT NULL,
	-- Explicit economic meaning used for transaction classification.
	economic_intent category_economic_intent NOT NULL,
	-- Excludes active rows from default lists while keeping them selectable by explicit query.
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	-- Marks active rows for prominent UI/account-picker placement without changing accounting semantics.
	is_featured BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	-- Parent category path derived from fqn, or NULL for root categories.
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	-- Leaf category name derived from fqn.
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	-- Zero-based category depth derived from fqn.
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN category.fqn IS 'Colon-separated hierarchical category path, e.g. Food:Restaurants.';
COMMENT ON COLUMN category.economic_intent IS 'Explicit economic meaning used for transaction classification.';
COMMENT ON COLUMN category.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN category.is_featured IS 'Marks active rows for prominent UI/account-picker placement without changing accounting semantics.';
COMMENT ON COLUMN category.parent_fqn IS 'Parent category path derived from fqn, or NULL for root categories.';
COMMENT ON COLUMN category.name IS 'Leaf category name derived from fqn.';
COMMENT ON COLUMN category.level IS 'Zero-based category depth derived from fqn.';

CREATE UNIQUE INDEX category_active_fqn_unique
ON category ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));
