-- +goose Up
CREATE TABLE budget (
	budget_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	category_fqn TEXT NOT NULL,
	month DATE NOT NULL,
	amount DECIMAL(18,8) NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(category_fqn, month, tombstoned_at)
);

COMMENT ON COLUMN budget.month IS 'Budget month, stored as the first calendar date of that month.';

CREATE UNIQUE INDEX budget_active_category_month_unique
ON budget ((CASE WHEN tombstoned_at IS NULL THEN category_fqn || ':' || CAST(month AS VARCHAR) ELSE NULL END));
