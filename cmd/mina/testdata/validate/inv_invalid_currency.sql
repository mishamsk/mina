UPDATE demo.journal_record SET currency = 'ZZZ' WHERE transaction_id = (SELECT MIN(transaction_id) FROM demo.transaction WHERE tombstoned_at IS NULL);
