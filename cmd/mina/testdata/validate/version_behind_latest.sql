DELETE FROM demo.schema_version
WHERE version_id = (
	SELECT MAX(version_id)
	FROM demo.schema_version
	WHERE is_applied
);
