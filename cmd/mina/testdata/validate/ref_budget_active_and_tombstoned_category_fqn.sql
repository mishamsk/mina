INSERT INTO demo.category (category_id, fqn, economic_intent, is_hidden, created_at, updated_at, tombstoned_at)
SELECT
	(SELECT MAX(category_id) + 1 FROM demo.category),
	b.category_fqn,
	c.economic_intent,
	c.is_hidden,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP
FROM demo.budget AS b
JOIN demo.category AS c ON c.fqn = b.category_fqn AND c.tombstoned_at IS NULL
WHERE b.tombstoned_at IS NULL
LIMIT 1;
