-- +goose Up
CREATE TABLE member (
	member_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	name TEXT NOT NULL,
	-- Excludes active rows from default lists while keeping them selectable by explicit query.
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(name, tombstoned_at)
);

COMMENT ON COLUMN member.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';

CREATE UNIQUE INDEX member_active_name_unique
ON member ((CASE WHEN tombstoned_at IS NULL THEN name ELSE NULL END));
