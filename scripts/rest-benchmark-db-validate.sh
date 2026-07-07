#!/usr/bin/env bash
set -euo pipefail

db_path="${1:-build/load-tests/rest-benchmark/mina.db}"
mode="${2:-}"

[ -n "$db_path" ] || { echo "usage: scripts/rest-benchmark-db-validate.sh [db-path] [shallow]" >&2; exit 2; }
[ -f "$db_path" ] || { echo "database not found: $db_path" >&2; exit 2; }

args=(db validate --db "$db_path")
label="db-validate-full"
if [ -n "$mode" ]; then
    case "$mode" in
        shallow|--shallow)
            args+=(--shallow)
            label="db-validate-shallow"
            ;;
        *)
            echo "second argument must be shallow or --shallow" >&2
            exit 2
            ;;
    esac
fi

start_ms="$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time() * 1000')"
./bin/mina "${args[@]}"
end_ms="$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time() * 1000')"
elapsed_ms=$((end_ms - start_ms))

printf 'scenario\trequests\tok\terrors\ttotal_s\treq_per_s\tmin_ms\tavg_ms\tp50_ms\tp90_ms\tp95_ms\tp99_ms\tmax_ms\n' | column -t -s $'\t'
printf '%s\t1\t1\t0\t%.2f\t0.00\t%d\t%d\t%d\t%d\t%d\t%d\t%d\n' "$label" "$(awk -v ms="$elapsed_ms" 'BEGIN { print ms / 1000 }')" "$elapsed_ms" "$elapsed_ms" "$elapsed_ms" "$elapsed_ms" "$elapsed_ms" "$elapsed_ms" "$elapsed_ms" | column -t -s $'\t'
