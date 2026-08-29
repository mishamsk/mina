-- +goose Up
ALTER TABLE category ADD COLUMN display_label TEXT;
ALTER TABLE tag ADD COLUMN display_label TEXT;

COMMENT ON COLUMN category.display_label IS 'Optional non-unique presentation label; NULL uses the service-derived FQN fallback.';
COMMENT ON COLUMN tag.display_label IS 'Optional non-unique presentation label; NULL uses the service-derived FQN fallback.';
