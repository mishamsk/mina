UPDATE demo.schema_version
SET version_id = version_id + 100000
WHERE version_id = (
	SELECT MAX(version_id)
	FROM demo.schema_version
	WHERE is_applied
);
