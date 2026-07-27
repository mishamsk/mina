UPDATE demo.journal_record
SET category_id = (SELECT category_id FROM demo.category WHERE fqn = 'Food:Coffee' AND tombstoned_at IS NULL)
WHERE record_id = (
	SELECT jr.record_id
	FROM demo.journal_record AS jr
	JOIN demo.account AS a ON a.account_id = jr.account_id
	WHERE a.account_type = 'OWNED'
	  AND jr.category_id IS NULL
	  AND jr.tombstoned_at IS NULL
	LIMIT 1
);
