UPDATE demo.transaction
SET lifecycle_status = CAST('EXPECTED' AS demo.transaction_lifecycle_status)
WHERE transaction_id = (
	SELECT MIN(transaction_id)
	FROM demo.transaction
	WHERE tombstoned_at IS NULL
);

UPDATE demo.journal_record
SET pending_date = NULL,
	posted_date = NULL,
	"source" = CAST('RECURRING_TEMPLATE' AS demo."source")
WHERE transaction_id = (SELECT MIN(transaction_id) FROM demo.transaction WHERE tombstoned_at IS NULL)
	AND tombstoned_at IS NULL;
