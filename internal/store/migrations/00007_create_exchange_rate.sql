-- +goose Up
CREATE TABLE exchange_rate (
	exchange_rate_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
	from_currency TEXT NOT NULL,
	-- ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.
	to_currency TEXT NOT NULL,
	-- Multiplicative conversion rate from from_currency to to_currency.
	rate DECIMAL(18,8) NOT NULL,
	-- UTC timestamp when the exchange rate becomes effective.
	effective_date TIMESTAMP NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(from_currency, to_currency, effective_date, tombstoned_at)
);

COMMENT ON COLUMN exchange_rate.from_currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN exchange_rate.to_currency IS 'ISO 4217 code for fiat currencies; crypto token ticker prefixed with C:: for crypto.';
COMMENT ON COLUMN exchange_rate.rate IS 'Multiplicative conversion rate from from_currency to to_currency.';
COMMENT ON COLUMN exchange_rate.effective_date IS 'UTC timestamp when the exchange rate becomes effective.';

CREATE UNIQUE INDEX exchange_rate_active_pair_date_unique
ON exchange_rate ((CASE WHEN tombstoned_at IS NULL THEN from_currency || ':' || to_currency || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));
