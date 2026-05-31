-- +goose Up
CREATE TABLE credit_limit_history (
	credit_limit_history_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	account_id INTEGER NOT NULL,
	credit_limit DECIMAL(18,8) NOT NULL,
	effective_date DATE NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(account_id, effective_date, tombstoned_at)
);

CREATE UNIQUE INDEX credit_limit_history_active_account_date_unique
ON credit_limit_history ((CASE WHEN tombstoned_at IS NULL THEN CAST(account_id AS VARCHAR) || ':' || CAST(effective_date AS VARCHAR) ELSE NULL END));
