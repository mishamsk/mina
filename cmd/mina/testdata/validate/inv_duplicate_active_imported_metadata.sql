DROP INDEX demo.imported_record_metadata_active_record_unique;
INSERT INTO demo.imported_record_metadata (record_id, external_system)
SELECT record_id, 'plaid'
FROM demo.journal_record
WHERE tombstoned_at IS NULL
LIMIT 1;
INSERT INTO demo.imported_record_metadata (record_id, external_system)
SELECT record_id, 'plaid'
FROM demo.journal_record
WHERE tombstoned_at IS NULL
LIMIT 1;
