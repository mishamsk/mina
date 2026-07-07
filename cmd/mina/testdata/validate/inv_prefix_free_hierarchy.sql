INSERT INTO demo.account (
	account_id, fqn, account_type, is_hidden, is_featured, currency,
	external_id, external_system, created_at, updated_at, tombstoned_at
)
SELECT
	(SELECT COALESCE(MAX(account_id), 0) + 1 FROM demo.account),
	'ValidateAccount:Leaf:Child',
	account_type,
	FALSE,
	FALSE,
	currency,
	NULL,
	NULL,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
FROM demo.account
WHERE tombstoned_at IS NULL
LIMIT 1;

INSERT INTO demo.account (
	account_id, fqn, account_type, is_hidden, is_featured, currency,
	external_id, external_system, created_at, updated_at, tombstoned_at
)
SELECT
	(SELECT COALESCE(MAX(account_id), 0) + 1 FROM demo.account),
	'ValidateAccount:Leaf',
	account_type,
	FALSE,
	FALSE,
	currency,
	NULL,
	NULL,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
FROM demo.account
WHERE fqn = 'ValidateAccount:Leaf:Child';

INSERT INTO demo.category (category_id, fqn, economic_intent, is_hidden, created_at, updated_at, tombstoned_at)
SELECT
	(SELECT COALESCE(MAX(category_id), 0) + 1 FROM demo.category),
	'ValidateCategory:Leaf:Child',
	economic_intent,
	FALSE,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
FROM demo.category
WHERE tombstoned_at IS NULL
LIMIT 1;

INSERT INTO demo.category (category_id, fqn, economic_intent, is_hidden, created_at, updated_at, tombstoned_at)
SELECT
	(SELECT COALESCE(MAX(category_id), 0) + 1 FROM demo.category),
	'ValidateCategory:Leaf',
	economic_intent,
	FALSE,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
FROM demo.category
WHERE fqn = 'ValidateCategory:Leaf:Child';

INSERT INTO demo.tag (tag_id, fqn, is_hidden, created_at, updated_at, tombstoned_at)
SELECT
	(SELECT COALESCE(MAX(tag_id), 0) + 1 FROM demo.tag),
	'ValidateTag:Leaf:Child',
	FALSE,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
FROM demo.tag
WHERE tombstoned_at IS NULL
LIMIT 1;

INSERT INTO demo.tag (tag_id, fqn, is_hidden, created_at, updated_at, tombstoned_at)
VALUES (
	(SELECT COALESCE(MAX(tag_id), 0) + 1 FROM demo.tag),
	'ValidateTag:Leaf',
	FALSE,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);

INSERT INTO demo.transaction_template (transaction_template_id, fqn, created_at, updated_at, tombstoned_at)
VALUES (
	(SELECT COALESCE(MAX(transaction_template_id), 0) + 1 FROM demo.transaction_template),
	'ValidateTemplate:Leaf:Child',
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);

INSERT INTO demo.transaction_template (transaction_template_id, fqn, created_at, updated_at, tombstoned_at)
VALUES (
	(SELECT COALESCE(MAX(transaction_template_id), 0) + 1 FROM demo.transaction_template),
	'ValidateTemplate:Leaf',
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP,
	NULL
);
