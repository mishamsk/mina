UPDATE demo.journal_record
SET posting_status = CAST('CANCELLED' AS demo.posting_status)
WHERE record_id = (
	SELECT MIN(record_id)
	FROM demo.journal_record
	WHERE transaction_id = (
		SELECT MIN(transaction_id)
		FROM demo.transaction
		WHERE tombstoned_at IS NULL
	)
	AND tombstoned_at IS NULL
);
