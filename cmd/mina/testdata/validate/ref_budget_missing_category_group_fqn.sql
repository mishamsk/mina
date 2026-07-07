INSERT INTO demo.budget (budget_id, category_fqn, month, amount, created_at, updated_at, tombstoned_at)
VALUES (
	(SELECT COALESCE(MAX(budget_id), 0) + 1 FROM demo.budget),
	'MissingBudgetGroup:NoActiveCategory',
	DATE '2099-02-01',
	1.00,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);
