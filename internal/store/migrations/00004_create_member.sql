-- +goose Up
CREATE TABLE member (
	member_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	name TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(name, tombstoned_at)
);

CREATE UNIQUE INDEX member_active_name_unique
ON member ((CASE WHEN tombstoned_at IS NULL THEN name ELSE NULL END));
