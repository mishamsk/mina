UPDATE demo.journal_record
SET tombstoned_at = CURRENT_TIMESTAMP
WHERE transaction_id = (SELECT MIN(transaction_id) FROM demo.transaction WHERE tombstoned_at IS NULL);

UPDATE demo.transaction
SET tombstoned_at = CURRENT_TIMESTAMP
WHERE transaction_id = (SELECT MIN(transaction_id) FROM demo.transaction WHERE tombstoned_at IS NULL);

INSERT INTO demo.imported_record_metadata (record_id, external_system)
SELECT MIN(record_id), 'plaid'
FROM demo.journal_record
WHERE tombstoned_at IS NOT NULL;
