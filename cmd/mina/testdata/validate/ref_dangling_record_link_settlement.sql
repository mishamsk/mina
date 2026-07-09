INSERT INTO demo.record_link (origin_record_id, settlement_record_id, link_type)
SELECT MIN(record_id), COALESCE(MAX(record_id), 0) + 1, 'REFUND'
FROM demo.journal_record;
