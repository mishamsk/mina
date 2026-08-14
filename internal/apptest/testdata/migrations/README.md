# Migration Fixtures

- Each `vNNNNN.duckdb.gz` archive contains an immutable, minimal accounting database produced by that schema version from `main`.
- `apptest.NewFromMigrationFixture` extracts a test-owned copy, applies the real startup migration path, and completes full database validation before returning its REST client.
- Migration app-tests assert preserved data and migration-specific transformations only through the generated REST protocol.

## Producing a Fixture

1. Before adding the next migration, use a clean checkout of `main`, where `NNNNN` is the current `LatestMigrationVersion`; do not use a binary that embeds the migration under test.
2. Run `just build`, then create `/tmp/mina-vNNNNN.duckdb` with `test ! -e /tmp/mina-vNNNNN.duckdb && env -u MINA_DATABASE_ENCRYPTION_KEY -u MINA_SCHEMA ./bin/mina --config-file /dev/null migrate --db /tmp/mina-vNNNNN.duckdb --schema main --yes` so an earlier database cannot be reused and the preceding schema comes only from its real migrations with the fixture helper's unencrypted `main` configuration. If the freshness guard fails, choose a fresh path and use it consistently in the remaining steps.
3. Add the smallest production-reachable data set that distinguishes preservation and the migration-specific transformation through the source version's generated REST client: `env -u MINA_DATABASE_ENCRYPTION_KEY -u MINA_SCHEMA ./bin/mina --config-file /dev/null client --db /tmp/mina-vNNNNN.duckdb --yes ...`. Deliberately omit schema-only tables that had no REST behavior in that version; do not seed fixture data through direct DuckDB writes.
4. Run `env -u MINA_DATABASE_ENCRYPTION_KEY -u MINA_SCHEMA ./bin/mina --config-file /dev/null db validate --db /tmp/mina-vNNNNN.duckdb --schema main` with the same `main` binary and stop every process using the file.
5. Run `gzip -n -9 -c /tmp/mina-vNNNNN.duckdb > internal/apptest/testdata/migrations/vNNNNN.duckdb.gz`, then add the archive and its `NewFromMigrationFixture(t, NNNNN)` app-test on the migration branch.
