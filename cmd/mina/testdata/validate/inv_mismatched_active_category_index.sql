DROP INDEX demo.category_active_fqn_unique;
CREATE INDEX category_active_fqn_unique ON demo.category (fqn);
INSERT INTO demo.category (category_id, fqn, economic_intent, is_hidden, created_at, updated_at, tombstoned_at)
SELECT
	(SELECT MAX(category_id) + 1 FROM demo.category),
	fqn,
	economic_intent,
	is_hidden,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
FROM demo.category
WHERE tombstoned_at IS NULL
LIMIT 1;
