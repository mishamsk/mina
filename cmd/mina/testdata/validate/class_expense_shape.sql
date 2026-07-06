UPDATE demo.journal_record
SET category_id = (SELECT category_id FROM demo.category WHERE fqn = 'Food:Coffee' AND tombstoned_at IS NULL)
WHERE record_id = (
	SELECT jr.record_id
	FROM demo.journal_record AS jr
	JOIN demo.category AS c ON c.category_id = jr.category_id
	WHERE c.fqn = 'Savings'
	  AND jr.amount > 0
	  AND jr.tombstoned_at IS NULL
	LIMIT 1
);
