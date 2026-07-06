CREATE TEMP TABLE __assert_behind_latest(ok BOOLEAN CHECK (ok));
INSERT INTO __assert_behind_latest
VALUES ((
	SELECT MAX(version_id)
	FROM demo.schema_version
	WHERE is_applied
) = 9);
