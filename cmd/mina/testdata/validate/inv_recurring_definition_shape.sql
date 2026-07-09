SET schema = 'demo';

INSERT INTO demo.recurring_definition (
	recurring_definition_id,
	fqn,
	schedule_rule,
	anchor_date,
	definition_version,
	created_at,
	updated_at,
	tombstoned_at
)
VALUES (
	(SELECT COALESCE(MAX(recurring_definition_id), 0) + 1 FROM demo.recurring_definition),
	'Validation:RecurringUnbalanced',
	CAST('{"version":1,"kind":"interval","every":1,"unit":"MONTH"}' AS JSON),
	DATE '2026-01-01',
	1,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);

INSERT INTO demo.recurring_definition_record (
	recurring_definition_record_id,
	recurring_definition_id,
	account_id,
	member_id,
	currency,
	amount,
	category_id,
	tag_ids,
	memo,
	created_at,
	updated_at,
	tombstoned_at
)
VALUES
	(
		(SELECT COALESCE(MAX(recurring_definition_record_id), 0) + 1 FROM demo.recurring_definition_record),
		(SELECT recurring_definition_id FROM demo.recurring_definition WHERE fqn = 'Validation:RecurringUnbalanced'),
		(SELECT MIN(account_id) FROM demo.account WHERE tombstoned_at IS NULL),
		NULL,
		'USD',
		-10,
		(SELECT MIN(category_id) FROM demo.category WHERE tombstoned_at IS NULL),
		[],
		NULL,
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		(SELECT COALESCE(MAX(recurring_definition_record_id), 0) + 2 FROM demo.recurring_definition_record),
		(SELECT recurring_definition_id FROM demo.recurring_definition WHERE fqn = 'Validation:RecurringUnbalanced'),
		(SELECT MIN(account_id) FROM demo.account WHERE tombstoned_at IS NULL),
		NULL,
		'USD',
		9,
		(SELECT MIN(category_id) FROM demo.category WHERE tombstoned_at IS NULL),
		[],
		NULL,
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	);

INSERT INTO demo.recurring_definition (
	recurring_definition_id,
	fqn,
	schedule_rule,
	anchor_date,
	definition_version,
	created_at,
	updated_at,
	tombstoned_at
)
VALUES (
	(SELECT COALESCE(MAX(recurring_definition_id), 0) + 1 FROM demo.recurring_definition),
	'Validation:RecurringShort',
	CAST('{"version":1,"kind":"interval","every":1,"unit":"MONTH"}' AS JSON),
	DATE '2026-01-01',
	1,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);

INSERT INTO demo.recurring_definition_record (
	recurring_definition_record_id,
	recurring_definition_id,
	account_id,
	member_id,
	currency,
	amount,
	category_id,
	tag_ids,
	memo,
	created_at,
	updated_at,
	tombstoned_at
)
VALUES (
	(SELECT COALESCE(MAX(recurring_definition_record_id), 0) + 1 FROM demo.recurring_definition_record),
	(SELECT recurring_definition_id FROM demo.recurring_definition WHERE fqn = 'Validation:RecurringShort'),
	(SELECT MIN(account_id) FROM demo.account WHERE tombstoned_at IS NULL),
	NULL,
	'USD',
	-5,
	(SELECT MIN(category_id) FROM demo.category WHERE tombstoned_at IS NULL),
	[],
	NULL,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);
