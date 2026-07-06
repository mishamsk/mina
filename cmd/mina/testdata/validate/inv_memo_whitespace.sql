UPDATE demo.journal_record SET memo = chr(8199) || 'padded memo' WHERE record_id = (SELECT MIN(record_id) FROM demo.journal_record WHERE tombstoned_at IS NULL);
INSERT INTO demo.transaction_template (transaction_template_id, fqn, created_at, updated_at, tombstoned_at)
VALUES ((SELECT COALESCE(MAX(transaction_template_id), 0) + 1 FROM demo.transaction_template), 'Validation:MemoWhitespace', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);
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
	(SELECT transaction_template_id FROM demo.transaction_template WHERE fqn = 'Validation:MemoWhitespace'),
	(SELECT MIN(category_id) FROM demo.category WHERE tombstoned_at IS NULL),
	NULL,
	NULL,
	NULL,
	NULL,
	[],
	'template memo' || chr(12288),
	NULL,
	NULL,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);
