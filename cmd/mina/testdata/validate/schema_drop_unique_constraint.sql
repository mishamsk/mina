USE demo;
DROP INDEX member_active_name_unique;
CREATE TABLE member_rebuilt (
	member_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	name TEXT NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP
);
INSERT INTO member_rebuilt (member_id, name, is_hidden, created_at, updated_at, tombstoned_at)
SELECT member_id, name, is_hidden, created_at, updated_at, tombstoned_at FROM member;
DROP TABLE member;
ALTER TABLE member_rebuilt RENAME TO member;
CREATE UNIQUE INDEX member_active_name_unique ON member ((CASE WHEN tombstoned_at IS NULL THEN name ELSE NULL END));
