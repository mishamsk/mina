UPDATE demo.recurring_definition_record AS rdr
SET currency = 'EUR'
FROM demo.recurring_definition AS rd
WHERE rd.recurring_definition_id = rdr.recurring_definition_id
  AND rd.fqn = 'Subscriptions:Netflix'
  AND rdr.tombstoned_at IS NULL
  AND rd.tombstoned_at IS NULL;
