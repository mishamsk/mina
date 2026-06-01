import? "~/.justfile"

set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["pwsh", "-NoLogo", "-Command"]

default:
    just --list

init:
    command -v mise >/dev/null || { echo "missing required tool: mise" >&2; exit 1; }
    command -v prek >/dev/null || { echo "missing required tool: prek" >&2; exit 1; }
    prek install --hook-type pre-commit

fmt:
    go fmt ./...

fmt-check:
    files="$(git ls-files '*.go' | while IFS= read -r file; do [ -f "$file" ] && gofmt -l "$file"; done)"; if [ -n "$files" ]; then printf 'Go files need formatting:\n%s\n' "$files" >&2; exit 1; fi

fix:
    go fix ./...

lint:
    go tool golangci-lint run ./...
    go run ./internal/tools/archlint

openapi:
    go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml
    go tool oapi-codegen -config api/oapi-codegen-httpclient.yaml api/openapi.yaml

openapi-check:
    go run github.com/getkin/kin-openapi/cmd/validate api/openapi.yaml
    tmpdir="$(mktemp -d)"; trap 'rm -rf "$tmpdir"' EXIT; awk -v output="$tmpdir/server/openapi.gen.go" '/^output:/ { print "output: " output; next } { print }' api/oapi-codegen.yaml > "$tmpdir/oapi-codegen.yaml"; mkdir -p "$tmpdir/server"; go tool oapi-codegen -config "$tmpdir/oapi-codegen.yaml" api/openapi.yaml; cmp -s "$tmpdir/server/openapi.gen.go" internal/httpapi/openapi/openapi.gen.go || { echo 'generated OpenAPI server output is stale; run `just openapi`' >&2; diff -u internal/httpapi/openapi/openapi.gen.go "$tmpdir/server/openapi.gen.go" >&2; exit 1; }; awk -v output="$tmpdir/client/openapi.gen.go" '/^output:/ { print "output: " output; next } { print }' api/oapi-codegen-httpclient.yaml > "$tmpdir/oapi-codegen-httpclient.yaml"; mkdir -p "$tmpdir/client"; go tool oapi-codegen -config "$tmpdir/oapi-codegen-httpclient.yaml" api/openapi.yaml; cmp -s "$tmpdir/client/openapi.gen.go" internal/httpclient/openapi.gen.go || { echo 'generated OpenAPI client output is stale; run `just openapi`' >&2; diff -u internal/httpclient/openapi.gen.go "$tmpdir/client/openapi.gen.go" >&2; exit 1; }

tidy:
    go mod tidy

build:
    mkdir -p bin
    go build -o bin/mina ./cmd/mina

# Start the REST API in the background; pass -p to persist data in build/dev/mina.db.
# Pass --demo to seed deterministic demo data at startup.
dev mode="" extra="": build
    #!/usr/bin/env bash
    set -euo pipefail

    dev_dir="build/dev"
    pid_file="$dev_dir/mina.pid"
    stdout_log="$dev_dir/stdout.log"
    stderr_log="$dev_dir/stderr.log"
    access_log="$dev_dir/access.log"
    db_path="$dev_dir/mina.db"
    persist=false
    demo=false
    for arg in {{quote(mode)}} {{quote(extra)}}; do
        case "$arg" in
            "")
                ;;
            "-p")
                persist=true
                ;;
            "--demo")
                demo=true
                ;;
            *)
                echo "usage: just dev [-p] [--demo]" >&2
                exit 2
                ;;
        esac
    done

    mkdir -p "$dev_dir"
    if [ -f "$pid_file" ]; then
        pid="$(cat "$pid_file")"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "mina already running at http://127.0.0.1:8080 with pid $pid" >&2
            exit 1
        fi
        rm -f "$pid_file"
    fi

    : > "$stdout_log"
    : > "$stderr_log"
    serve_args=(serve --host 127.0.0.1 --port 8080 --access-log "$access_log")
    if [ "$persist" = true ]; then
        serve_args+=(--db "$db_path" --yes)
    fi
    if [ "$demo" = true ]; then
        serve_args+=(--demo)
    fi
    nohup ./bin/mina "${serve_args[@]}" > "$stdout_log" 2> "$stderr_log" &
    pid="$!"
    echo "$pid" > "$pid_file"
    disown "$pid"

    for _ in {1..50}; do
        if grep -q 'listening http://127.0.0.1:8080' "$stdout_log"; then
            echo "mina listening at http://127.0.0.1:8080 with pid $pid"
            echo "logs: $stdout_log $stderr_log $access_log"
            exit 0
        fi
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$pid_file"
            echo "mina failed to start; see $stdout_log and $stderr_log" >&2
            exit 1
        fi
        sleep 0.1
    done

    echo "mina did not report readiness; see $stdout_log and $stderr_log" >&2
    exit 1

dev-kill:
    #!/usr/bin/env bash
    set -euo pipefail

    pid_file="build/dev/mina.pid"
    if [ ! -f "$pid_file" ]; then
        echo "no background mina pid file found"
        exit 0
    fi

    pid="$(cat "$pid_file")"
    if [ -z "$pid" ]; then
        rm -f "$pid_file"
        echo "removed empty mina pid file"
        exit 0
    fi

    if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$pid_file"
        echo "removed stale mina pid file for pid $pid"
        exit 0
    fi

    kill -TERM "$pid"
    for _ in {1..50}; do
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$pid_file"
            echo "stopped mina pid $pid"
            exit 0
        fi
        sleep 0.1
    done

    kill -KILL "$pid"
    rm -f "$pid_file"
    echo "force-stopped mina pid $pid"

test:
    go test ./...

test-integration:
    go test -tags=integration ./cmd/mina -run TestIntegrationScripts -count=1

pre-commit:
    prek run --all-files

review-loop goal branch_or_commit="":
    #!/usr/bin/env bash
    set -euo pipefail

    branch_or_commit={{quote(branch_or_commit)}}
    if [ -n "$branch_or_commit" ]; then
        go run ./internal/tools/reviewloop {{quote(goal)}} "$branch_or_commit"
    else
        go run ./internal/tools/reviewloop {{quote(goal)}}
    fi

codex-goal plan_file:
    command codex --dangerously-bypass-approvals-and-sandbox {{quote("/goal implement " + plan_file + ". Acceptance criteria - all checkboxes are ticked. When done - move file to docs/plans/completed folder. Make sure you go commit by commit, task by task and never jump forward or skip any item.")}}

rebase:
    command codex exec --dangerously-bypass-approvals-and-sandbox {{quote("$rebase")}}

# Agent-only manual smoke commands should be added temporarily when a concrete uncovered risk remains outside the testscript end-to-end suite.
