UPDATE demo.transaction SET tombstoned_at = CURRENT_TIMESTAMP WHERE transaction_id = (SELECT MIN(transaction_id) FROM demo.transaction WHERE tombstoned_at IS NULL);
