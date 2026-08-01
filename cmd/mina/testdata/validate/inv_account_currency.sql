UPDATE demo.account AS a
SET currency = (
	SELECT CASE WHEN jr.currency = 'USD' THEN 'EUR' ELSE 'USD' END
	FROM demo.journal_record AS jr
	JOIN demo.transaction AS tx ON tx.transaction_id = jr.transaction_id
	WHERE jr.account_id = a.account_id
	  AND jr.tombstoned_at IS NULL
	  AND tx.tombstoned_at IS NULL
	LIMIT 1
)
WHERE a.account_id = (
	SELECT jr.account_id
	FROM demo.journal_record AS jr
	JOIN demo.transaction AS tx ON tx.transaction_id = jr.transaction_id
	JOIN demo.account AS target ON target.account_id = jr.account_id
	WHERE jr.tombstoned_at IS NULL
	  AND tx.tombstoned_at IS NULL
	  AND target.tombstoned_at IS NULL
	  AND target.account_type <> 'SYSTEM'
	LIMIT 1
);
