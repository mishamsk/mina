import? "~/.justfile"

set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["pwsh", "-NoLogo", "-Command"]

init:
    command -v mise >/dev/null || { echo "missing required tool: mise" >&2; exit 1; }
    command -v prek >/dev/null || { echo "missing required tool: prek" >&2; exit 1; }
    prek install --hook-type pre-commit

fmt:
    go fmt ./...

fmt-check:
    files="$(git ls-files '*.go' | while IFS= read -r file; do [ -f "$file" ] && gofmt -l "$file"; done)"; if [ -n "$files" ]; then printf 'Go files need formatting:\n%s\n' "$files" >&2; exit 1; fi

lint:
    go tool golangci-lint run ./...

openapi:
    go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml

openapi-check:
    tmpdir="$(mktemp -d)"; trap 'rm -rf "$tmpdir"' EXIT; awk -v output="$tmpdir/openapi.gen.go" '/^output:/ { print "output: " output; next } { print }' api/oapi-codegen.yaml > "$tmpdir/oapi-codegen.yaml"; go tool oapi-codegen -config "$tmpdir/oapi-codegen.yaml" api/openapi.yaml; cmp -s "$tmpdir/openapi.gen.go" internal/httpapi/openapi/openapi.gen.go || { echo 'generated OpenAPI output is stale; run `just openapi`' >&2; diff -u internal/httpapi/openapi/openapi.gen.go "$tmpdir/openapi.gen.go" >&2; exit 1; }

tidy:
    go mod tidy

test:
    go test ./...

test-integration:
    go test -tags=integration ./cmd/mina -run TestIntegrationScripts -count=1

pre-commit:
    prek run --all-files

# Agent-only manual smoke commands should be added temporarily when a concrete uncovered risk remains outside the testscript end-to-end suite.
