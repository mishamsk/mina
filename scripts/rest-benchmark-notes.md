# REST Benchmark Notes

- The benchmark is a mixed local workload, not an isolated endpoint profiler.
- Each repeat runs quick reads, one unpaged transaction read, and one write through the same Hurl job pool.
- Slow tails on `rest-health`, `rest-accounts-list`, and `rest-write-spend` can be accidental overlap artifacts when they queue behind genuinely slow work.
- The consistently slow operations are `rest-transactions-unpaged` and full `db validate`; `db validate` runs after the REST workload.
- Clean runs without request concurrency show `rest-health` and `rest-accounts-list` are sub-millisecond to low-millisecond operations.
- DuckDB connection parallelism helps under mixed read/write activity by avoiding head-of-line blocking between independent requests.
- Mina currently fixes DuckDB runtime parallelism at `2`: enough to protect ordinary user activity from coinciding with a slow read or write, without adding user-facing pool configuration.
