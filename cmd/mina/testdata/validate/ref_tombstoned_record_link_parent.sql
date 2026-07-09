UPDATE demo.journal_record
SET tombstoned_at = CURRENT_TIMESTAMP
WHERE record_id = (SELECT MIN(record_id) FROM demo.journal_record WHERE tombstoned_at IS NULL);

INSERT INTO demo.record_link (origin_record_id, settlement_record_id, link_type)
SELECT MIN(record_id), MAX(record_id), 'REFUND'
FROM demo.journal_record
WHERE tombstoned_at IS NOT NULL
   OR record_id <> (SELECT MIN(record_id) FROM demo.journal_record WHERE tombstoned_at IS NOT NULL);
