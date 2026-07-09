INSERT INTO demo.record_link (origin_record_id, settlement_record_id, link_type)
SELECT COALESCE(MAX(record_id), 0) + 1, MIN(record_id), 'REFUND'
FROM demo.journal_record;
