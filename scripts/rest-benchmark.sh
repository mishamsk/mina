#!/usr/bin/env bash
set -euo pipefail

transactions="${TRANSACTIONS:-50000}"
years="${YEARS:-10}"
categories="${CATEGORIES:-100}"
members="${MEMBERS:-5}"
accounts="${ACCOUNTS:-50}"
tags="${TAGS:-20}"
repeats="${REPEATS:-25}"
warmup_repeats="${WARMUP_REPEATS:-1}"
jobs="${JOBS:-4}"
requested_port="${PORT:-}"

usage() {
    cat >&2 <<'EOF'
usage: scripts/rest-benchmark.sh [options]

Options:
  --transactions N  default 50000
  --years N         default 10
  --categories N    default 100
  --members N       default 5
  --accounts N      default 50
  --tags N          default 20
  --repeats N       default 25 measured Hurl sequence repetitions
  --warmup-repeats N default 1 warmup Hurl sequence repetition
  --jobs N          default 4
  --port N          default first free high port
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --transactions)
            transactions="${2:-}"; shift 2 ;;
        --years)
            years="${2:-}"; shift 2 ;;
        --categories)
            categories="${2:-}"; shift 2 ;;
        --members)
            members="${2:-}"; shift 2 ;;
        --accounts)
            accounts="${2:-}"; shift 2 ;;
        --tags)
            tags="${2:-}"; shift 2 ;;
        --repeats)
            repeats="${2:-}"; shift 2 ;;
        --warmup-repeats)
            warmup_repeats="${2:-}"; shift 2 ;;
        --jobs)
            jobs="${2:-}"; shift 2 ;;
        --port)
            requested_port="${2:-}"; shift 2 ;;
        -h|--help)
            usage; exit 0 ;;
        *)
            echo "unknown option: $1" >&2
            usage
            exit 2
            ;;
    esac
done

for tool in column curl duckdb jq mise perl; do
    command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

positive_int() {
    local name="$1"
    local value="$2"
    [[ "$value" =~ ^[1-9][0-9]*$ ]] || { echo "$name must be a positive integer" >&2; exit 2; }
}

positive_int transactions "$transactions"
positive_int years "$years"
positive_int categories "$categories"
positive_int members "$members"
positive_int accounts "$accounts"
positive_int tags "$tags"
positive_int repeats "$repeats"
positive_int warmup_repeats "$warmup_repeats"
positive_int jobs "$jobs"

if [ "$transactions" -lt 50000 ]; then echo "transactions must be at least 50000" >&2; exit 2; fi
if [ "$years" -lt 10 ]; then echo "years must be at least 10" >&2; exit 2; fi
if [ "$categories" -lt 100 ]; then echo "categories must be at least 100" >&2; exit 2; fi
if [ "$members" -lt 5 ]; then echo "members must be at least 5" >&2; exit 2; fi
if [ "$accounts" -lt 50 ]; then echo "accounts must be at least 50" >&2; exit 2; fi

port_in_use() {
    (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

select_free_port() {
    if [ -n "$requested_port" ]; then
        if port_in_use "$requested_port"; then
            echo "requested port $requested_port is already in use" >&2
            exit 2
        fi
        echo "$requested_port"
        return
    fi

    for candidate in $(seq 49152 65535); do
        if ! port_in_use "$candidate"; then
            echo "$candidate"
            return
        fi
    done

    echo "no free high port found" >&2
    exit 1
}

now_ms() {
    perl -MTime::HiRes=time -e 'printf "%.0f\n", time() * 1000'
}

elapsed_ms() {
    local start_ms="$1"
    local end_ms
    end_ms="$(now_ms)"
    echo $((end_ms - start_ms))
}

server_pid=""
stop_server() {
    if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
        kill -TERM "$server_pid" 2>/dev/null || true
        for _ in {1..100}; do
            if ! kill -0 "$server_pid" 2>/dev/null; then
                server_pid=""
                return
            fi
            sleep 0.05
        done
        kill -KILL "$server_pid" 2>/dev/null || true
        server_pid=""
    fi
}
trap stop_server EXIT

wait_for_health() {
    local base_url="$1"
    for _ in {1..200}; do
        if curl -fsS "$base_url/api/health" >/dev/null 2>&1; then
            return
        fi
        if ! kill -0 "$server_pid" 2>/dev/null; then
            echo "mina serve exited before readiness" >&2
            return 1
        fi
        sleep 0.1
    done
    echo "mina serve did not become ready" >&2
    return 1
}

start_server() {
    local db_path="$1"
    local port="$2"
    local base_url="http://127.0.0.1:$port"

    ./bin/mina serve --db "$db_path" --yes --host 127.0.0.1 --port "$port" --quiet > "$run_dir/server.stdout.log" 2> "$run_dir/server.stderr.log" &
    server_pid="$!"
    wait_for_health "$base_url" || {
        echo "server stdout: $run_dir/server.stdout.log" >&2
        echo "server stderr: $run_dir/server.stderr.log" >&2
        return 1
    }
}

run_seed_entry() {
    local entry="$1"
    shift

    local response
    response="$(mise exec -- hurl --from-entry "$entry" --to-entry "$entry" "$@" scripts/rest-benchmark-seed.hurl 2>> "$setup_output")"
    printf '%s\n' "$response" >> "$setup_output"
    printf '%s' "$response"
}

add_summary_row() {
    local scenario="$1"
    local requests="$2"
    local ok="$3"
    local errors="$4"
    local elapsed_ms_value="$5"
    local latency_file="$6"
    local rps="0.00"
    if [ "$elapsed_ms_value" -gt 0 ] && [[ "$requests" =~ ^[0-9]+$ ]]; then
        rps="$(awk -v r="$requests" -v ms="$elapsed_ms_value" 'BEGIN { printf "%.2f", r / (ms / 1000) }')"
    fi

    local min="n/a" avg="n/a" p50="n/a" p90="n/a" p95="n/a" p99="n/a" max="n/a"
    if [ -s "$latency_file" ]; then
        read -r min avg p50 p90 p95 p99 max < <(
            sort -n "$latency_file" | awk '
                { values[NR]=$1; sum+=$1 }
                END {
                    if (NR == 0) { exit }
                    printf "%.2f %.2f %.2f %.2f %.2f %.2f %.2f\n",
                        values[1],
                        sum / NR,
                        values[int((NR - 1) * 0.50) + 1],
                        values[int((NR - 1) * 0.90) + 1],
                        values[int((NR - 1) * 0.95) + 1],
                        values[int((NR - 1) * 0.99) + 1],
                        values[NR]
                }
            '
        )
    fi

    printf '%s\t%s\t%s\t%s\t%.2f\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$scenario" "$requests" "$ok" "$errors" "$(awk -v ms="$elapsed_ms_value" 'BEGIN { print ms / 1000 }')" "$rps" \
        "$min" "$avg" "$p50" "$p90" "$p95" "$p99" "$max" >> "$summary_tsv"
}

add_hurl_summary_rows() {
    local latency_tsv="$1"
    local elapsed_ms_value="$2"
    local status="$3"

    sort -k1,1 -k2,2n "$latency_tsv" | awk -v elapsed_ms="$elapsed_ms_value" -v status="$status" '
        function reset() {
            n = 0
            sum = 0
            delete values
        }
        function emit() {
            if (scenario == "" || n == 0) {
                return
            }
            ok = status == 0 ? n : 0
            errors = status == 0 ? 0 : n
            total_s = elapsed_ms / 1000
            rps = elapsed_ms > 0 ? n / (elapsed_ms / 1000) : 0
            printf "%s\t%d\t%d\t%d\t%.2f\t%.2f\t%.2f\t%.2f\t%.2f\t%.2f\t%.2f\t%.2f\t%.2f\n",
                "rest-" scenario, n, ok, errors, total_s, rps,
                values[1],
                sum / n,
                values[int((n - 1) * 0.50) + 1],
                values[int((n - 1) * 0.90) + 1],
                values[int((n - 1) * 0.95) + 1],
                values[int((n - 1) * 0.99) + 1],
                values[n]
        }
        $1 != scenario {
            emit()
            scenario = $1
            reset()
        }
        {
            n++
            values[n] = $2
            sum += $2
        }
        END {
            emit()
        }
    ' >> "$summary_tsv"
}

load_fixture_refs() {
    local refs
    refs="$(duckdb "$db_path" -csv <<'SQL' | tail -n 1
USE main;
SELECT
  (SELECT category_id FROM category WHERE fqn LIKE 'Benchmark:Expense:%' AND tombstoned_at IS NULL ORDER BY category_id LIMIT 1) AS category_id,
  (SELECT member_id FROM member WHERE name LIKE 'Benchmark Member %' AND tombstoned_at IS NULL ORDER BY member_id LIMIT 1) AS member_id,
  (SELECT account_id FROM account WHERE fqn LIKE 'Benchmark:Bank:%' AND account_type = 'BALANCE' AND tombstoned_at IS NULL ORDER BY account_id LIMIT 1) AS balance_account_id,
  (SELECT account_id FROM account WHERE fqn LIKE 'Benchmark:Merchant:%' AND account_type = 'FLOW' AND tombstoned_at IS NULL ORDER BY account_id LIMIT 1) AS flow_account_id,
  (SELECT tag_id FROM tag WHERE fqn LIKE 'Benchmark:Tag:%' AND tombstoned_at IS NULL ORDER BY tag_id LIMIT 1) AS tag_id;
SQL
)"
    IFS=, read -r category_id member_id balance_account_id flow_account_id tag_id <<< "$refs"
    for ref in "$category_id" "$member_id" "$balance_account_id" "$flow_account_id" "$tag_id"; do
        [[ "$ref" =~ ^[1-9][0-9]*$ ]] || { echo "benchmark fixture is missing required seed references" >&2; exit 1; }
    done
}

run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
run_dir="build/load-tests/rest-benchmark"
db_path="$run_dir/mina.db"
hurl_output="$run_dir/hurl.output.log"
hurl_json="$run_dir/hurl-results.jsonl"
hurl_latency="$run_dir/hurl-latency.tsv"
warmup_output="$run_dir/hurl-warmup.output.log"
validate_latency="$run_dir/validate-latency-ms.txt"
summary_tsv="$run_dir/summary.tsv"
mkdir -p "$run_dir"
rm -f "$hurl_output" "$hurl_json" "$hurl_latency" "$warmup_output" "$validate_latency" "$summary_tsv" "$run_dir/db-validate.output.log" "$run_dir/server.stdout.log" "$run_dir/server.stderr.log"
rm -f build/load-tests/latest
printf 'scenario\trequests\tok\terrors\ttotal_s\treq_per_s\tmin_ms\tavg_ms\tp50_ms\tp90_ms\tp95_ms\tp99_ms\tmax_ms\n' > "$summary_tsv"

port="$(select_free_port)"
base_url="http://127.0.0.1:$port"
echo "benchmark run: $run_id"
echo "database: $db_path"
echo "server: $base_url"

balance_accounts=$((accounts / 2))
if [ "$balance_accounts" -eq 0 ]; then balance_accounts=1; fi
flow_accounts=$((accounts - balance_accounts))
if [ "$flow_accounts" -eq 0 ]; then flow_accounts=1; fi
write_date="2026-06-30"
write_amount="42.42"
write_memo="benchmark write $run_id"

setup_output="$run_dir/setup-hurl.output.log"
if [ -f "$db_path" ]; then
    echo "using existing benchmark database fixture"
else
    echo "benchmark database fixture missing; seeding once"
    echo "initializing migrated database"
    start_server "$db_path" "$port"

    echo "generating fixture dictionaries with hurl"
    for i in $(seq 1 "$categories"); do
        category_fqn="$(printf 'Benchmark:Expense:%03d' "$i")"
        run_seed_entry 1 --variable "base_url=$base_url" --variable "category_fqn=$category_fqn" >/dev/null
    done
    for i in $(seq 1 "$members"); do
        member_name="$(printf 'Benchmark Member %02d' "$i")"
        run_seed_entry 2 --variable "base_url=$base_url" --variable "member_name=$member_name" >/dev/null
    done
    for i in $(seq 1 "$balance_accounts"); do
        account_fqn="$(printf 'Benchmark:Bank:%03d' "$i")"
        is_featured=false
        if [ "$i" -le 5 ]; then is_featured=true; fi
        run_seed_entry 3 --variable "base_url=$base_url" --variable "account_fqn=$account_fqn" --variable account_type=balance --variable "is_featured=$is_featured" >/dev/null
    done
    for i in $(seq 1 "$flow_accounts"); do
        account_fqn="$(printf 'Benchmark:Merchant:%03d' "$i")"
        run_seed_entry 3 --variable "base_url=$base_url" --variable "account_fqn=$account_fqn" --variable account_type=flow --variable is_featured=false >/dev/null
    done
    for i in $(seq 1 "$tags"); do
        tag_fqn="$(printf 'Benchmark:Tag:%03d' "$i")"
        run_seed_entry 4 --variable "base_url=$base_url" --variable "tag_fqn=$tag_fqn" >/dev/null
    done

    echo "stopping server for direct DuckDB transaction fixture seed"
    stop_server

    echo "generating $transactions benchmark transactions with duckdb; setup timing is intentionally excluded from the summary"
    scripts/rest-benchmark-seed-transactions.sh \
        --db "$db_path" \
        --transactions "$transactions" \
        --years "$years" \
        --schema main \
        --run-id "$run_id" > "$run_dir/setup-duckdb.output.log"
fi

load_fixture_refs

echo "starting server for measured workload"
start_server "$db_path" "$port"

scenario_files=(
    scripts/rest-benchmark-cases/health.hurl
    scripts/rest-benchmark-cases/accounts-list.hurl
    scripts/rest-benchmark-cases/account-get.hurl
    scripts/rest-benchmark-cases/account-balances.hurl
    scripts/rest-benchmark-cases/categories-list.hurl
    scripts/rest-benchmark-cases/category-get.hurl
    scripts/rest-benchmark-cases/members-list.hurl
    scripts/rest-benchmark-cases/member-get.hurl
    scripts/rest-benchmark-cases/transactions-paged.hurl
    scripts/rest-benchmark-cases/account-records.hurl
    scripts/rest-benchmark-cases/transactions-unpaged.hurl
    scripts/rest-benchmark-cases/write-spend.hurl
)

echo "running hurl warmup"
mise exec -- hurl --test --jobs "$jobs" --repeat "$warmup_repeats" \
    --variable "base_url=$base_url" \
    --variable "balance_account_id=$balance_account_id" \
    --variable "flow_account_id=$flow_account_id" \
    --variable "category_id=$category_id" \
    --variable "member_id=$member_id" \
    --variable "write_date=$write_date" \
    --variable "write_amount=$write_amount" \
    --variable "write_memo=warmup $run_id" \
    --variable "tag_id=$tag_id" \
    "${scenario_files[@]}" > /dev/null 2> "$warmup_output"

echo "running measured hurl workload"
echo "request mix per repeat: 10 quick reads, 1 unpaged transaction read, 1 write; repeats=$repeats, jobs=$jobs"
hurl_start="$(now_ms)"
set +e
mise exec -- hurl --test --json --jobs "$jobs" \
    --repeat "$repeats" \
    --variable "base_url=$base_url" \
    --variable "balance_account_id=$balance_account_id" \
    --variable "flow_account_id=$flow_account_id" \
    --variable "category_id=$category_id" \
    --variable "member_id=$member_id" \
    --variable "write_date=$write_date" \
    --variable "write_amount=$write_amount" \
    --variable "write_memo=$write_memo" \
    --variable "tag_id=$tag_id" \
    "${scenario_files[@]}" > "$hurl_json" 2> "$hurl_output"
hurl_status="$?"
set -e
hurl_elapsed_ms="$(elapsed_ms "$hurl_start")"
stop_server

jq -r '.filename as $filename | .entries[]?.calls[]?.timings?.total? | [$filename, .] | @tsv' "$hurl_json" 2>/dev/null |
    awk -F '\t' '{
        count = split($1, parts, "/")
        scenario = parts[count]
        sub(/\.hurl$/, "", scenario)
        printf "%s\t%.6f\n", scenario, $2 / 1000
    }' > "$hurl_latency" || true
add_hurl_summary_rows "$hurl_latency" "$hurl_elapsed_ms" "$hurl_status"

echo "running full database validation timing"
validate_start="$(now_ms)"
set +e
./bin/mina db validate --db "$db_path" > "$run_dir/db-validate.output.log" 2>&1
validate_status="$?"
set -e
validate_elapsed_ms="$(elapsed_ms "$validate_start")"
printf '%s\n' "$validate_elapsed_ms" > "$validate_latency"
if [ "$validate_status" -eq 0 ]; then
    add_summary_row "db-validate-full" 1 1 0 "$validate_elapsed_ms" "$validate_latency"
else
    add_summary_row "db-validate-full" 1 0 1 "$validate_elapsed_ms" "$validate_latency"
fi

column -t -s $'\t' "$summary_tsv"
echo "raw outputs: $run_dir"

if [ "$hurl_status" -ne 0 ]; then
    echo "hurl workload failed; see $hurl_output" >&2
    exit "$hurl_status"
fi
if [ "$validate_status" -ne 0 ]; then
    echo "db validation failed; see $run_dir/db-validate.output.log" >&2
    exit "$validate_status"
fi
