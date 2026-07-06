UPDATE demo.exchange_rate SET rate = 0 WHERE exchange_rate_id = (SELECT MIN(exchange_rate_id) FROM demo.exchange_rate WHERE tombstoned_at IS NULL);
