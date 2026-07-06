UPDATE demo.journal_record SET amount = amount + 1 WHERE record_id = (SELECT MIN(record_id) FROM demo.journal_record WHERE tombstoned_at IS NULL);
