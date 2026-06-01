-- +goose Up
CREATE TABLE exchange_rate (
	exchange_rate_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	from_currency TEXT NOT NULL,
	to_currency TEXT NOT NULL,
	rate DECIMAL(18,8) NOT NULL,
	effective_date TIMESTAMP NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(from_currency, to_currency, effective_date, tombstoned_at)
);

COMMENT ON COLUMN exchange_rate.effective_date IS 'UTC timestamp when the exchange rate becomes effective.';

CREATE UNIQUE INDEX exchange_rate_active_pair_date_unique
ON exchange_rate ((CASE WHEN tombstoned_at IS NULL THEN from_currency || ':' || to_currency || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));
