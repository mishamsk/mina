UPDATE demo.transaction
SET lifecycle_status = CAST('CANCELLED' AS demo.transaction_lifecycle_status)
WHERE transaction_id = (SELECT MIN(transaction_id) FROM demo.transaction WHERE tombstoned_at IS NULL);
