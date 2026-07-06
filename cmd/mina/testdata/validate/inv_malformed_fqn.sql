UPDATE demo.account SET fqn = 'bad::fqn' WHERE account_id = (SELECT MIN(account_id) FROM demo.account WHERE tombstoned_at IS NULL);
UPDATE demo.tag SET fqn = 'bad::tag' WHERE tag_id = (SELECT MIN(tag_id) FROM demo.tag WHERE tombstoned_at IS NULL);
