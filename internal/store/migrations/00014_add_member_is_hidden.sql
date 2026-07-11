-- +goose Up
ALTER TABLE member
ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;

DROP INDEX member_active_name_unique;

ALTER TABLE member
ALTER COLUMN is_hidden SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS member_active_name_unique
ON member ((CASE WHEN tombstoned_at IS NULL THEN name ELSE NULL END));

COMMENT ON COLUMN member.is_hidden IS 'Excludes active rows from default lists while keeping them selectable by explicit query.';
