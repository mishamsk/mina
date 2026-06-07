-- +goose Up
CREATE TABLE tag (
	tag_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Colon-separated hierarchical tag path, e.g. Trips:Vacation.
	fqn TEXT NOT NULL,
	-- Excludes active rows from default lists while keeping them selectable by explicit query.
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	-- Parent tag path derived from fqn, or NULL for root tags.
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	-- Leaf tag name derived from fqn.
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	-- Zero-based tag depth derived from fqn.
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

COMMENT ON COLUMN tag.fqn IS 'Colon-separated hierarchical tag path, e.g. Trips:Vacation.';
COMMENT ON COLUMN tag.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
COMMENT ON COLUMN tag.parent_fqn IS 'Parent tag path derived from fqn, or NULL for root tags.';
COMMENT ON COLUMN tag.name IS 'Leaf tag name derived from fqn.';
COMMENT ON COLUMN tag.level IS 'Zero-based tag depth derived from fqn.';

CREATE UNIQUE INDEX tag_active_fqn_unique
ON tag ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));
