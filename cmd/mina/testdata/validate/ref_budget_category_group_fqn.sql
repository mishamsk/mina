INSERT INTO demo.budget (budget_id, category_fqn, month, amount, created_at, updated_at, tombstoned_at)
SELECT
	(SELECT COALESCE(MAX(budget_id), 0) + 1 FROM demo.budget),
	regexp_replace(fqn, ':[^:]+$', ''),
	DATE '2099-01-01',
	1.00,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
FROM demo.category
WHERE tombstoned_at IS NULL
  AND fqn LIKE '%:%'
LIMIT 1;
