-- +goose Up
-- Fail rather than discard provenance when a generated transaction references a missing occurrence.
SELECT CASE
	WHEN EXISTS (
		SELECT 1
		FROM "transaction" AS t
		LEFT JOIN recurring_occurrence AS o
		  ON o.recurring_occurrence_id = t.recurring_occurrence_id
		WHERE t.recurring_occurrence_id IS NOT NULL
		  AND o.recurring_occurrence_id IS NULL
	) THEN error('cannot migrate dangling recurring transaction provenance')
	ELSE true
END;

-- Convert the old schedule-floor anchor to the bounded next-slot anchor. This intentionally
-- uses only the latest occupied slot at or after the floor and one frozen successor step.
-- Successors outside Mina's civil-date range stop at its latest supported date.
WITH anchor_source AS (
	SELECT d.recurring_definition_id,
		d.anchor_date,
		d.schedule_rule,
		MAX(o.scheduled_date) FILTER (WHERE o.scheduled_date >= d.anchor_date) AS latest_scheduled_date
	FROM recurring_definition AS d
	LEFT JOIN recurring_occurrence AS o
	  ON o.recurring_definition_id = d.recurring_definition_id
	GROUP BY d.recurring_definition_id, d.anchor_date, d.schedule_rule
), converted AS (
	SELECT recurring_definition_id,
		CASE json_extract_string(schedule_rule, '$.kind')
			WHEN 'interval' THEN
				CASE
					WHEN latest_scheduled_date IS NULL THEN anchor_date
					WHEN json_extract_string(schedule_rule, '$.unit') = 'DAY' THEN
						LEAST(
							TRY(CAST(latest_scheduled_date + CAST(json_extract_string(schedule_rule, '$.every') AS BIGINT) * INTERVAL 1 DAY AS DATE)),
							DATE '9999-12-31'
						)
					WHEN json_extract_string(schedule_rule, '$.unit') = 'WEEK' THEN
						LEAST(
							TRY(CAST(latest_scheduled_date + (7 * CAST(json_extract_string(schedule_rule, '$.every') AS BIGINT)) * INTERVAL 1 DAY AS DATE)),
							DATE '9999-12-31'
						)
					WHEN json_extract_string(schedule_rule, '$.unit') = 'MONTH' THEN
						LEAST(
							TRY(CAST(
								date_trunc('month', latest_scheduled_date)
									+ CAST(json_extract_string(schedule_rule, '$.every') AS BIGINT) * INTERVAL 1 MONTH
								+ (least(
									day(latest_scheduled_date),
									day(last_day(date_trunc('month', latest_scheduled_date) + CAST(json_extract_string(schedule_rule, '$.every') AS BIGINT) * INTERVAL 1 MONTH))
								) - 1) * INTERVAL 1 DAY
							AS DATE)),
							DATE '9999-12-31'
						)
					ELSE
						LEAST(
							TRY(CAST(
								make_date(year(latest_scheduled_date) + CAST(json_extract_string(schedule_rule, '$.every') AS BIGINT), month(latest_scheduled_date), 1)
								+ (least(
									day(latest_scheduled_date),
									day(last_day(make_date(year(latest_scheduled_date) + CAST(json_extract_string(schedule_rule, '$.every') AS BIGINT), month(latest_scheduled_date), 1)))
								) - 1) * INTERVAL 1 DAY
							AS DATE)),
							DATE '9999-12-31'
						)
				END
			WHEN 'day_of_month' THEN
				LEAST(CASE
					WHEN latest_scheduled_date IS NOT NULL THEN
						CAST(
							date_trunc('month', latest_scheduled_date) + INTERVAL 1 MONTH
							+ (least(
								CAST(json_extract_string(schedule_rule, '$.day') AS INTEGER),
								day(last_day(date_trunc('month', latest_scheduled_date) + INTERVAL 1 MONTH))
							) - 1) * INTERVAL 1 DAY
						AS DATE)
					WHEN CAST(
						date_trunc('month', anchor_date)
						+ (least(CAST(json_extract_string(schedule_rule, '$.day') AS INTEGER), day(last_day(anchor_date))) - 1) * INTERVAL 1 DAY
					AS DATE) >= anchor_date THEN
						CAST(
							date_trunc('month', anchor_date)
							+ (least(CAST(json_extract_string(schedule_rule, '$.day') AS INTEGER), day(last_day(anchor_date))) - 1) * INTERVAL 1 DAY
						AS DATE)
					ELSE
						CAST(
							date_trunc('month', anchor_date) + INTERVAL 1 MONTH
							+ (least(
								CAST(json_extract_string(schedule_rule, '$.day') AS INTEGER),
								day(last_day(date_trunc('month', anchor_date) + INTERVAL 1 MONTH))
							) - 1) * INTERVAL 1 DAY
						AS DATE)
				END, DATE '9999-12-31')
			ELSE
				LEAST(CASE
					WHEN latest_scheduled_date IS NOT NULL THEN CAST(last_day(latest_scheduled_date + INTERVAL 1 MONTH) AS DATE)
					ELSE CAST(last_day(anchor_date) AS DATE)
				END, DATE '9999-12-31')
		END AS next_anchor_date
	FROM anchor_source
)
UPDATE recurring_definition AS d
SET anchor_date = converted.next_anchor_date
FROM converted
WHERE converted.recurring_definition_id = d.recurring_definition_id;

CREATE TABLE transaction_v19 (
	transaction_id INTEGER PRIMARY KEY DEFAULT nextval('primary_key_gen_seq'),
	initiated_date DATE NOT NULL,
	recurring_definition_id INTEGER,
	lifecycle_status transaction_lifecycle_status NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
	tombstoned_at TIMESTAMP WITH TIME ZONE
);

INSERT INTO transaction_v19 (
	transaction_id, initiated_date, recurring_definition_id, lifecycle_status, created_at, updated_at, tombstoned_at
)
SELECT t.transaction_id,
	t.initiated_date,
	o.recurring_definition_id,
	t.lifecycle_status,
	t.created_at,
	t.updated_at,
	t.tombstoned_at
FROM "transaction" AS t
LEFT JOIN recurring_occurrence AS o
  ON o.recurring_occurrence_id = t.recurring_occurrence_id;

DROP TABLE "transaction";
ALTER TABLE transaction_v19 RENAME TO "transaction";

COMMENT ON COLUMN "transaction".initiated_date IS 'Human-facing transaction date; no timezone conversion is applied.';
COMMENT ON COLUMN "transaction".recurring_definition_id IS 'Recurring definition that generated this transaction; NULL for non-recurring transactions.';
COMMENT ON COLUMN "transaction".lifecycle_status IS 'ACTIVE participates normally, EXPECTED awaits recurring review, CANCELLED preserves excluded history.';
COMMENT ON COLUMN "transaction".updated_at IS 'Latest material transaction or nested journal-record change time and optimistic-concurrency revision.';
COMMENT ON COLUMN "transaction".tombstoned_at IS 'Soft-delete timestamp; non-NULL transactions and their records are excluded from active behavior.';

UPDATE journal_record
SET reconciliation_status = CAST('RECONCILED' AS reconciliation_status)
WHERE source = CAST('RECURRING_TEMPLATE' AS source);

DROP TABLE recurring_occurrence;
DROP TYPE recurring_occurrence_status;
