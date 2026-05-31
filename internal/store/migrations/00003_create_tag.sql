-- +goose Up
CREATE TABLE tag (
	tag_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	fqn TEXT NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	parent_fqn TEXT GENERATED ALWAYS AS (
		CASE WHEN instr(fqn, ':') > 0 THEN regexp_replace(fqn, ':[^:]+$', '') ELSE NULL END
	) VIRTUAL,
	name TEXT GENERATED ALWAYS AS (regexp_extract(fqn, '[^:]+$')) VIRTUAL,
	level INTEGER GENERATED ALWAYS AS (array_length(string_split(fqn, ':')) - 1) VIRTUAL,
	UNIQUE(fqn, tombstoned_at)
);

CREATE UNIQUE INDEX tag_active_fqn_unique
ON tag ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));
