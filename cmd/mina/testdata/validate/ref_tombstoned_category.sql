UPDATE demo.category SET tombstoned_at = CURRENT_TIMESTAMP WHERE category_id = (SELECT category_id FROM demo.journal_record WHERE tombstoned_at IS NULL AND category_id IS NOT NULL LIMIT 1);
