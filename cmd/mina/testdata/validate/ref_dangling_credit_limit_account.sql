UPDATE demo.credit_limit_history SET account_id = 999999 WHERE credit_limit_history_id = (SELECT MIN(credit_limit_history_id) FROM demo.credit_limit_history WHERE tombstoned_at IS NULL);
