INSERT INTO demo.imported_record_metadata (record_id, external_system)
SELECT COALESCE(MAX(record_id), 0) + 1, 'plaid'
FROM demo.journal_record;
