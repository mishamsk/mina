DROP INDEX demo.record_link_active_pair_unique;

INSERT INTO demo.record_link (origin_record_id, settlement_record_id, link_type)
SELECT MIN(record_id), MAX(record_id), 'REFUND'
FROM demo.journal_record
WHERE tombstoned_at IS NULL;

INSERT INTO demo.record_link (origin_record_id, settlement_record_id, link_type)
SELECT MIN(record_id), MAX(record_id), 'REFUND'
FROM demo.journal_record
WHERE tombstoned_at IS NULL;
