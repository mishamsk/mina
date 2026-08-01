UPDATE demo.account
SET currency = NULL
WHERE account_id = (
	SELECT clh.account_id
	FROM demo.credit_limit_history AS clh
	JOIN demo.account AS a ON a.account_id = clh.account_id
	WHERE clh.tombstoned_at IS NULL
	  AND a.tombstoned_at IS NULL
	  AND a.currency IS NOT NULL
	LIMIT 1
);
