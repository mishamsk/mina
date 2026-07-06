DROP INDEX demo.journal_record_transaction_id_idx;
ALTER TABLE demo.journal_record DROP COLUMN memo;
CREATE INDEX journal_record_transaction_id_idx ON demo.journal_record (transaction_id);
