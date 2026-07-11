-- +goose Up
ALTER TABLE category
ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;

DROP INDEX category_active_fqn_unique;

ALTER TABLE category
ALTER COLUMN is_featured SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS category_active_fqn_unique
ON category ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

COMMENT ON COLUMN category.is_featured IS 'Marks active rows for prominent UI/account-picker placement without changing accounting semantics.';

ALTER TABLE tag
ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;

DROP INDEX tag_active_fqn_unique;

ALTER TABLE tag
ALTER COLUMN is_featured SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tag_active_fqn_unique
ON tag ((CASE WHEN tombstoned_at IS NULL THEN fqn ELSE NULL END));

COMMENT ON COLUMN tag.is_featured IS 'Marks active rows for prominent UI/account-picker placement without changing accounting semantics.';
