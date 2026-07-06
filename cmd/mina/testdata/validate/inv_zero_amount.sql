UPDATE demo.journal_record SET amount_usd = 0 WHERE record_id = (SELECT MIN(record_id) FROM demo.journal_record WHERE tombstoned_at IS NULL AND amount_usd IS NOT NULL);
INSERT INTO demo.transaction_template (transaction_template_id, fqn, created_at, updated_at, tombstoned_at)
VALUES ((SELECT COALESCE(MAX(transaction_template_id), 0) + 1 FROM demo.transaction_template), 'Validation:ZeroAmount', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);
INSERT INTO demo.transaction_template_record (
	transaction_template_record_id,
	transaction_template_id,
	category_id,
	account_id,
	member_id,
	currency,
	amount,
	tag_ids,
	memo,
	posting_status,
	reconciliation_status,
	created_at,
	updated_at,
	tombstoned_at
)
VALUES (
	(SELECT COALESCE(MAX(transaction_template_record_id), 0) + 1 FROM demo.transaction_template_record),
	(SELECT transaction_template_id FROM demo.transaction_template WHERE fqn = 'Validation:ZeroAmount'),
	(SELECT MIN(category_id) FROM demo.category WHERE tombstoned_at IS NULL),
	NULL,
	NULL,
	'USD',
	0,
	[],
	NULL,
	NULL,
	NULL,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);
