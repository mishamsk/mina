UPDATE demo.account SET external_id = 'acct-test', external_system = NULL WHERE account_id = (SELECT MIN(account_id) FROM demo.account WHERE tombstoned_at IS NULL);
