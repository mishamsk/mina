UPDATE demo.journal_record SET account_id = 999999 WHERE record_id = (SELECT MIN(record_id) FROM demo.journal_record WHERE tombstoned_at IS NULL);
