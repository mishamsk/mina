-- +goose Up
CREATE TABLE budget (
	budget_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	-- Category path this monthly budget applies to.
	category_fqn TEXT NOT NULL,
	-- Budget month, stored as the first calendar date of that month.
	month DATE NOT NULL,
	-- Budgeted amount for category_fqn during month.
	amount DECIMAL(18,8) NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP,
	UNIQUE(category_fqn, month, tombstoned_at)
);

COMMENT ON COLUMN budget.category_fqn IS 'Category path this monthly budget applies to.';
COMMENT ON COLUMN budget.month IS 'Budget month, stored as the first calendar date of that month.';
COMMENT ON COLUMN budget.amount IS 'Budgeted amount for category_fqn during month.';

CREATE UNIQUE INDEX budget_active_category_month_unique
ON budget ((CASE WHEN tombstoned_at IS NULL THEN category_fqn || ':' || CAST(month AS VARCHAR) ELSE NULL END));
