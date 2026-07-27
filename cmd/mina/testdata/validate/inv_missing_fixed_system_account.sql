UPDATE demo.account
SET fqn = 'system:missing_exchange'
WHERE fqn = 'system:exchange';
