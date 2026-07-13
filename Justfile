import? "~/.justfile"

set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["pwsh", "-NoLogo", "-Command"]

default_codex_model := "gpt-5.5"
default_codex_reasoning_effort := "high"

[private]
@default:
    just --list

# Install local development hooks.
[group('dev-tooling')]
init:
    command -v mise >/dev/null || { echo "missing required tool: mise" >&2; exit 1; }
    command -v prek >/dev/null || { echo "missing required tool: prek" >&2; exit 1; }
    mise install
    just frontend-install
    prek install --hook-type pre-commit

# Format Go source files.
[group('dev-tooling')]
fmt:
    go fmt ./...

# Check Go source formatting.
[group('dev-tooling')]
fmt-check:
    files="$(git ls-files '*.go' | while IFS= read -r file; do [ -f "$file" ] && gofmt -l "$file"; done)"; if [ -n "$files" ]; then printf 'Go files need formatting:\n%s\n' "$files" >&2; exit 1; fi

# Apply Go source fixes.
[group('dev-tooling')]
fix:
    go fix ./...

# Run static analysis checks.
[group('dev-tooling')]
lint:
    go tool golangci-lint run ./...
    go run ./internal/tools/archlint

# Regenerate OpenAPI server and client code.
[group('codegen')]
openapi:
    go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml
    go tool oapi-codegen -config api/oapi-codegen-httpclient.yaml api/openapi.yaml

# Validate OpenAPI and generated code freshness.
[group('codegen')]
openapi-check:
    go run github.com/getkin/kin-openapi/cmd/validate api/openapi.yaml
    tmpdir="$(mktemp -d)"; trap 'rm -rf "$tmpdir"' EXIT; awk -v output="$tmpdir/server/openapi.gen.go" '/^output:/ { print "output: " output; next } { print }' api/oapi-codegen.yaml > "$tmpdir/oapi-codegen.yaml"; mkdir -p "$tmpdir/server"; go tool oapi-codegen -config "$tmpdir/oapi-codegen.yaml" api/openapi.yaml; cmp -s "$tmpdir/server/openapi.gen.go" internal/httpapi/openapi/openapi.gen.go || { echo 'generated OpenAPI server output is stale; run `just openapi`' >&2; diff -u internal/httpapi/openapi/openapi.gen.go "$tmpdir/server/openapi.gen.go" >&2; exit 1; }; awk -v output="$tmpdir/client/openapi.gen.go" '/^output:/ { print "output: " output; next } { print }' api/oapi-codegen-httpclient.yaml > "$tmpdir/oapi-codegen-httpclient.yaml"; mkdir -p "$tmpdir/client"; go tool oapi-codegen -config "$tmpdir/oapi-codegen-httpclient.yaml" api/openapi.yaml; cmp -s "$tmpdir/client/openapi.gen.go" internal/httpclient/openapi.gen.go || { echo 'generated OpenAPI client output is stale; run `just openapi`' >&2; diff -u internal/httpclient/openapi.gen.go "$tmpdir/client/openapi.gen.go" >&2; exit 1; }

# Tidy Go module files.
[group('dev-tooling')]
tidy:
    go mod tidy

# Install the frontend package dependencies.
[group('frontend')]
[working-directory: 'frontend']
frontend-install:
    mise exec -- pnpm install

# Format frontend source files.
[group('frontend')]
[working-directory: 'frontend']
frontend-fmt:
    mise exec -- pnpm run format

# Check frontend source formatting.
[group('frontend')]
[working-directory: 'frontend']
frontend-fmt-check:
    mise exec -- pnpm run format:check

# Run frontend static analysis checks.
[group('frontend')]
[working-directory: 'frontend']
frontend-lint:
    mise exec -- pnpm run lint

# Run frontend TypeScript compiler checks.
[group('frontend')]
[working-directory: 'frontend']
frontend-typecheck:
    mise exec -- pnpm run typecheck

# Build frontend assets.
[group('frontend')]
[working-directory: 'frontend']
frontend-build:
    mise exec -- pnpm run build

# Start the Vite dev server against a running Mina backend.
[group('frontend')]
[working-directory: 'frontend']
frontend-dev backend_url="http://127.0.0.1:8080":
    MINA_FRONTEND_BACKEND_URL={{ quote(backend_url) }} mise exec -- pnpm run dev

# Run all frontend static checks.
[group('frontend')]
frontend-check: frontend-openapi-check frontend-fmt-check frontend-lint frontend-typecheck

# Check Docker builder versions against development tool declarations.
[group('docker')]
docker-version-check:
    scripts/check-docker-versions.sh

# Run the real Docker image and Compose lifecycle test.
[group('docker')]
test-docker:
    scripts/docker-service-test.sh

# Regenerate frontend REST client code.
[group('codegen')]
[working-directory: 'frontend']
frontend-openapi:
    mise exec -- pnpm exec openapi-ts -f openapi-ts.config.ts --no-log-file

# Verify frontend REST client generated code freshness.
[group('codegen')]
frontend-openapi-check:
    tmpdir="$(mktemp -d)"; trap 'rm -rf "$tmpdir"' EXIT; cd frontend; mise exec -- pnpm exec openapi-ts -f openapi-ts.config.ts -o "$tmpdir/generated" --no-log-file >/dev/null; diff -qr src/api/generated "$tmpdir/generated" >/dev/null || { echo 'generated frontend OpenAPI client output is stale; run `just frontend-openapi`' >&2; diff -ru src/api/generated "$tmpdir/generated" >&2; exit 1; }

# Build the mina binary without rebuilding frontend assets.
[group('dev-tooling')]
build-go:
    test -f internal/webui/dist/index.html || { echo 'missing embedded frontend assets; run `just frontend-build` or `just build`' >&2; exit 1; }
    mkdir -p bin
    go build -o bin/mina ./cmd/mina

# Build frontend assets and the mina binary.
[group('dev-tooling')]
build: frontend-build build-go

[doc('''Start the REST API in the background; pass -p to persist data in build/dev/mina.db.
Pass --demo to seed deterministic demo data at startup.''')]
[group('demo')]
dev mode="" extra="": build
    #!/usr/bin/env bash
    set -euo pipefail

    dev_dir="build/dev"
    pid_file="$dev_dir/mina.pid"
    stdout_log="$dev_dir/stdout.log"
    stderr_log="$dev_dir/stderr.log"
    access_log="$dev_dir/access.log"
    db_path="$dev_dir/mina.db"
    default_port=8080
    persist=false
    demo=false

    port_in_use() {
        (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
    }

    select_dev_port() {
        if ! port_in_use "$default_port"; then
            echo "$default_port"
            return
        fi

        for port in $(seq 49152 65535); do
            if ! port_in_use "$port"; then
                echo "$port"
                return
            fi
        done

        echo "no free high port found" >&2
        exit 1
    }

    for arg in {{ quote(mode) }} {{ quote(extra) }}; do
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

    port="$(select_dev_port)"
    : > "$stdout_log"
    : > "$stderr_log"
    serve_args=(serve --host 127.0.0.1 --port "$port" --access-log "$access_log")
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
        if grep -q "listening http://127.0.0.1:$port" "$stdout_log"; then
            echo "mina listening at http://127.0.0.1:$port with pid $pid"
            if [ "$port" != "$default_port" ]; then
                echo "default port $default_port was busy; selected high port $port"
            fi
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

# Stop the REST API demo server.
[group('demo')]
dev-kill:
    #!/usr/bin/env bash
    set -euo pipefail

    pid_file="build/dev/mina.pid"

    print_detected_mina_serve() {
        detected_pids="$(pgrep -f '(^|.*/)mina serve([[:space:]]|$)' || true)"
        if [ -z "$detected_pids" ]; then
            echo "no mina serve processes detected"
            return
        fi

        echo "detected mina serve processes:"
        while IFS= read -r detected_pid; do
            command_line="$(ps -p "$detected_pid" -o command= 2>/dev/null || true)"
            listen_addrs="$(lsof -nP -a -p "$detected_pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 { print $9 }' | paste -sd, - || true)"
            if [ -n "$listen_addrs" ]; then
                echo "  pid $detected_pid listening $listen_addrs: $command_line"
            else
                echo "  pid $detected_pid: $command_line"
            fi
        done <<< "$detected_pids"
        echo "to stop all detected mina serve processes: kill -TERM $(echo "$detected_pids" | paste -sd' ' -)"
    }

    if [ ! -f "$pid_file" ]; then
        echo "no background mina pid file found"
        print_detected_mina_serve
        exit 0
    fi

    pid="$(cat "$pid_file")"
    if [ -z "$pid" ]; then
        rm -f "$pid_file"
        echo "removed empty mina pid file"
        print_detected_mina_serve
        exit 0
    fi

    if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$pid_file"
        echo "removed stale mina pid file for pid $pid"
        print_detected_mina_serve
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

# Run all Go tests.
[group('dev-tooling')]
test:
    go test ./...

# Run REST integration tests.
[group('dev-tooling')]
test-integration: frontend-build
    go test -tags=integration ./cmd/mina -run TestIntegrationScripts -count=1

# Run frontend browser end-to-end tests against the embedded UI.
[group('dev-tooling')]
[working-directory: 'frontend']
[positional-arguments]
test-frontend-e2e *playwright_args: build
    #!/usr/bin/env bash
    set -euo pipefail

    e2e_port="${MINA_FRONTEND_E2E_PORT:-18080}"
    e2e_ports=("$e2e_port" "$((e2e_port + 1))")

    command -v lsof >/dev/null || { echo "missing required tool: lsof" >&2; exit 1; }

    for port in "${e2e_ports[@]}"; do
        lsof_err="$(mktemp)"
        if ! pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>"$lsof_err")"; then
            if [[ -s "$lsof_err" ]]; then
                sed "s/^/failed to inspect e2e port $port with lsof: /" "$lsof_err" >&2
                rm -f "$lsof_err"
                exit 1
            fi
            pids=""
        fi
        rm -f "$lsof_err"

        for pid in $pids; do
            command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
            if [[ ! "$command_line" =~ (^|.*/)mina\ serve([[:space:]]|$) ]]; then
                echo "refusing to stop listener on e2e port $port: pid $pid: $command_line" >&2
                exit 1
            fi

            echo "stopping stale mina serve listener on e2e port $port: pid $pid: $command_line"
            kill -TERM "$pid"
            for _ in {1..50}; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    echo "stopped stale mina serve listener on e2e port $port: pid $pid"
                    break
                fi
                sleep 0.1
            done
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid"
                echo "force-stopped stale mina serve listener on e2e port $port: pid $pid"
            fi
        done
    done

    mise exec -- pnpm exec playwright install chromium webkit
    if [[ $# -eq 1 && $1 == "" ]]; then
        set --
    fi
    mise exec -- pnpm exec playwright test "$@"

# Run a manual local REST responsiveness benchmark with default script settings.
[group('dev-tooling')]
bench-rest: build
    scripts/rest-benchmark.sh

# Run configured pre-commit checks against all tracked files.
[group('dev-tooling')]
pre-commit:
    prek run --all-files

# Run the automated review loop.
[group('agents')]
review-loop goal branch_or_commit="" base_ref="" max_iterations="" claude_review_percent="":
    #!/usr/bin/env bash
    set -euo pipefail

    branch_or_commit={{ quote(branch_or_commit) }}
    base_ref={{ quote(base_ref) }}
    max_iterations={{ quote(max_iterations) }}
    claude_review_percent={{ quote(claude_review_percent) }}

    set -- --codex-model {{ quote(default_codex_model) }} --codex-reasoning-effort {{ quote(default_codex_reasoning_effort) }}
    if [ -n "$base_ref" ]; then
        set -- "$@" --base "$base_ref"
    fi
    if [ -n "$max_iterations" ]; then
        set -- "$@" --max-iterations "$max_iterations"
    fi
    if [ -n "$claude_review_percent" ]; then
        set -- "$@" --claude-review-percent "$claude_review_percent"
    fi

    if [ -n "$branch_or_commit" ]; then
        go run ./internal/tools/reviewloop "$@" {{ quote(goal) }} "$branch_or_commit"
    else
        go run ./internal/tools/reviewloop "$@" {{ quote(goal) }}
    fi

# Run Codex against an implementation plan.
[group('agents')]
codex-goal plan_file="":
    #!/usr/bin/env bash
    set -euo pipefail

    plan_file={{ quote(plan_file) }}
    if [ -z "$plan_file" ]; then
        command -v fzf >/dev/null || { echo "missing required tool: fzf" >&2; exit 1; }
        if ! plan_file="$(
            find docs/plans -maxdepth 1 -type f -name '*.md' | sort | fzf \
                --prompt='Plan> ' \
                --preview='sed -n "1,120p" {}'
        )"; then
            echo "no plan selected" >&2
            exit 1
        fi
        [ -n "$plan_file" ] || { echo "no plan selected" >&2; exit 1; }
    fi

    command codex -m {{ quote(default_codex_model) }} -c {{ quote("model_reasoning_effort=" + default_codex_reasoning_effort) }} --dangerously-bypass-approvals-and-sandbox "/goal implement ${plan_file}. Acceptance criteria - all checkboxes are ticked. When done - move file to docs/plans/completed folder. Make sure you go commit by commit, task by task and never jump forward or skip any item."

# Run a Codex operator against a sequential fleet plan.
[group('agents')]
codex-goal-fleet plan_file="":
    #!/usr/bin/env bash
    set -euo pipefail

    plan_file={{ quote(plan_file) }}
    command -v codex >/dev/null || { echo "missing required tool: codex" >&2; exit 1; }
    if [ -z "$plan_file" ]; then
        command -v fzf >/dev/null || { echo "missing required tool: fzf" >&2; exit 1; }
        if ! plan_file="$(
            find docs/plans -maxdepth 1 -type f -name '*-fleet.md' | \
                while IFS= read -r candidate; do
                    if [[ "$candidate" =~ ^docs/plans/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*-fleet\.md$ ]]; then
                        printf '%s\n' "$candidate"
                    fi
                done | sort | fzf \
                --prompt='Fleet plan> ' \
                --preview='sed -n "1,160p" {}'
        )"; then
            echo "no fleet plan selected" >&2
            exit 1
        fi
        [ -n "$plan_file" ] || { echo "no fleet plan selected" >&2; exit 1; }
    fi

    [[ "$plan_file" =~ ^docs/plans/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*-fleet\.md$ ]] || {
        echo "fleet plan must match docs/plans/YYYY-MM-DD-<topic>-fleet.md" >&2
        exit 1
    }
    [ -f "$plan_file" ] || { echo "fleet plan not found: $plan_file" >&2; exit 1; }

    command codex -m gpt-5.6-sol -c model_reasoning_effort=xhigh --dangerously-bypass-approvals-and-sandbox "/goal implement @${plan_file} - make sure to follow the workflow exactly as stated in that document. Remember that you are the operator and should never edit code yourself, but only manage implementation & review subagents and prepare plans."

# Start a kata plan-only worktree through Codex.
[group('agents')]
codex-kata-plan:
    #!/usr/bin/env bash
    set -euo pipefail

    command -v codex >/dev/null || { echo "missing required tool: codex" >&2; exit 1; }
    command -v fzf >/dev/null || { echo "missing required tool: fzf" >&2; exit 1; }
    command -v jq >/dev/null || { echo "missing required tool: jq" >&2; exit 1; }
    command -v kata >/dev/null || { echo "missing required tool: kata" >&2; exit 1; }

    if ! selected="$(
        jq -r -s '
            (.[1].issues
                | map(select(.parent != null) | .parent.short_id)
                | unique) as $parents
            | .[0].issues
            | map(select((.short_id as $id | $parents | index($id) | not)))
            | sort_by(.updated_at)
            | reverse[]
            | [
                .short_id,
                ("P" + (.priority | tostring)),
                .updated_at,
                .title
            ]
            | @tsv
        ' <(kata ready --json --limit 0) <(kata list --status all --limit 1000 --json) | fzf \
            --prompt='Kata> ' \
            --delimiter=$'\t' \
            --with-nth=1,2,4 \
            --preview='kata show {1} --agent'
    )"; then
        echo "no kata issue selected" >&2
        exit 1
    fi
    [ -n "$selected" ] || { echo "no kata issue selected" >&2; exit 1; }

    issue="${selected%%$'\t'*}"
    command codex exec -m {{ quote(default_codex_model) }} -c {{ quote("model_reasoning_effort=" + default_codex_reasoning_effort) }} --dangerously-bypass-approvals-and-sandbox "\$kata-plan-worktree #${issue}"

# Rebase the current branch through Codex.
[group('agents')]
rebase:
    command codex exec -m {{ quote(default_codex_model) }} -c {{ quote("model_reasoning_effort=" + default_codex_reasoning_effort) }} --dangerously-bypass-approvals-and-sandbox {{ quote("$rebase") }}

# Agent-only manual smoke commands should be added temporarily when a concrete uncovered risk remains outside the testscript end-to-end suite.
