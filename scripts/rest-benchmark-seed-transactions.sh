#!/usr/bin/env bash
set -euo pipefail

db_path=""
transactions="${TRANSACTIONS:-50000}"
years="${YEARS:-10}"
schema="${SCHEMA:-main}"
run_id="${RUN_ID:-benchmark}"

usage() {
    cat >&2 <<'EOF'
usage: scripts/rest-benchmark-seed-transactions.sh --db PATH [options]

Options:
  --db PATH          required DuckDB database path
  --transactions N  default 50000
  --years N         default 10
  --schema NAME     default main
  --run-id ID       default benchmark
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --db)
            db_path="${2:-}"; shift 2 ;;
        --transactions)
            transactions="${2:-}"; shift 2 ;;
        --years)
            years="${2:-}"; shift 2 ;;
        --schema)
            schema="${2:-}"; shift 2 ;;
        --run-id)
            run_id="${2:-}"; shift 2 ;;
        -h|--help)
            usage; exit 0 ;;
        *)
            echo "unknown option: $1" >&2
            usage
            exit 2
            ;;
    esac
done

command -v duckdb >/dev/null || { echo "missing required tool: duckdb" >&2; exit 1; }

positive_int() {
    local name="$1"
    local value="$2"
    [[ "$value" =~ ^[1-9][0-9]*$ ]] || { echo "$name must be a positive integer" >&2; exit 2; }
}

if [ -z "$db_path" ]; then
    echo "--db is required" >&2
    usage
    exit 2
fi
positive_int transactions "$transactions"
positive_int years "$years"
[[ "$schema" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "schema must be a simple DuckDB identifier" >&2; exit 2; }

duckdb "$db_path" <<SQL
.bail on
PRAGMA disable_progress_bar;
USE "$schema";

BEGIN TRANSACTION;

CREATE TEMP TABLE seed_category AS
SELECT row_number() OVER (ORDER BY category_id) AS rn, category_id
FROM category
WHERE fqn LIKE 'Benchmark:Expense:%'
  AND tombstoned_at IS NULL;

CREATE TEMP TABLE seed_member AS
SELECT row_number() OVER (ORDER BY member_id) AS rn, member_id
FROM member
WHERE name LIKE 'Benchmark Member %'
  AND tombstoned_at IS NULL;

CREATE TEMP TABLE seed_balance_account AS
SELECT row_number() OVER (ORDER BY account_id) AS rn, account_id
FROM account
WHERE fqn LIKE 'Benchmark:Bank:%'
  AND account_type = 'BALANCE'
  AND tombstoned_at IS NULL;

CREATE TEMP TABLE seed_flow_account AS
SELECT row_number() OVER (ORDER BY account_id) AS rn, account_id
FROM account
WHERE fqn LIKE 'Benchmark:Merchant:%'
  AND account_type = 'FLOW'
  AND tombstoned_at IS NULL;

CREATE TEMP TABLE seed_tag AS
SELECT row_number() OVER (ORDER BY tag_id) AS rn, tag_id
FROM tag
WHERE fqn LIKE 'Benchmark:Tag:%'
  AND tombstoned_at IS NULL;

CREATE TEMP TABLE seed_counts AS
SELECT
  (SELECT count(*) FROM seed_category) AS category_count,
  (SELECT count(*) FROM seed_member) AS member_count,
  (SELECT count(*) FROM seed_balance_account) AS balance_account_count,
  (SELECT count(*) FROM seed_flow_account) AS flow_account_count,
  (SELECT count(*) FROM seed_tag) AS tag_count;

SELECT CASE
  WHEN category_count = 0 THEN error('missing Benchmark:Expense categories')
  WHEN member_count = 0 THEN error('missing Benchmark members')
  WHEN balance_account_count = 0 THEN error('missing Benchmark:Bank balance accounts')
  WHEN flow_account_count = 0 THEN error('missing Benchmark:Merchant flow accounts')
  WHEN tag_count = 0 THEN error('missing Benchmark tags')
  ELSE NULL
END
FROM seed_counts;

CREATE TEMP TABLE seed_generated AS
SELECT
  i,
  nextval('primary_key_gen_seq') AS transaction_id,
  DATE '2016-01-01' + CAST(floor(random() * ($years * 365)) AS INTEGER) AS initiated_date,
  CAST((100 + floor(random() * 20000)) / 100.0 AS DECIMAL(18,8)) AS amount,
  1 + CAST(floor(random() * category_count) AS BIGINT) AS category_rn,
  1 + CAST(floor(random() * member_count) AS BIGINT) AS member_rn,
  1 + CAST(floor(random() * balance_account_count) AS BIGINT) AS balance_account_rn,
  1 + CAST(floor(random() * flow_account_count) AS BIGINT) AS flow_account_rn,
  1 + CAST(floor(random() * tag_count) AS BIGINT) AS tag_rn
FROM generate_series(1, $transactions) AS g(i)
CROSS JOIN seed_counts;

CREATE TEMP TABLE seed_transaction_rows AS
SELECT
  g.i,
  g.transaction_id,
  g.initiated_date,
  g.amount,
  c.category_id,
  m.member_id,
  ba.account_id AS balance_account_id,
  fa.account_id AS flow_account_id,
  t.tag_id
FROM seed_generated g
JOIN seed_category c ON c.rn = g.category_rn
JOIN seed_member m ON m.rn = g.member_rn
JOIN seed_balance_account ba ON ba.rn = g.balance_account_rn
JOIN seed_flow_account fa ON fa.rn = g.flow_account_rn
JOIN seed_tag t ON t.rn = g.tag_rn;

INSERT INTO "transaction" (transaction_id, initiated_date)
SELECT transaction_id, initiated_date
FROM seed_transaction_rows
ORDER BY i;

INSERT INTO journal_record (
  transaction_id, account_id, member_id, currency, amount, amount_usd, category_id, tag_ids,
  memo, pending_date, posted_date, posting_status, reconciliation_status, source
)
SELECT
  transaction_id,
  balance_account_id,
  member_id,
  'USD',
  -amount,
  NULL,
  category_id,
  [tag_id],
  printf('benchmark transaction %06d', i),
  CAST(initiated_date AS TIMESTAMP),
  CAST(initiated_date AS TIMESTAMP),
  CAST('POSTED' AS posting_status),
  CAST('RECONCILED' AS reconciliation_status),
  CAST('MANUAL' AS source)
FROM seed_transaction_rows
UNION ALL
SELECT
  transaction_id,
  flow_account_id,
  member_id,
  'USD',
  amount,
  NULL,
  category_id,
  [tag_id],
  printf('benchmark transaction %06d', i),
  CAST(initiated_date AS TIMESTAMP),
  CAST(initiated_date AS TIMESTAMP),
  CAST('POSTED' AS posting_status),
  CAST('RECONCILED' AS reconciliation_status),
  CAST('MANUAL' AS source)
FROM seed_transaction_rows;

COMMIT;

SELECT
  'seeded ' || count(*) || ' transactions for $run_id' AS result
FROM "transaction"
WHERE tombstoned_at IS NULL
  AND transaction_id IN (SELECT transaction_id FROM seed_transaction_rows);
SQL
