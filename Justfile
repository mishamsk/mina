import? "~/.justfile"

set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["pwsh", "-NoLogo", "-Command"]

init:
    command -v mise >/dev/null || { echo "missing required tool: mise" >&2; exit 1; }
    command -v prek >/dev/null || { echo "missing required tool: prek" >&2; exit 1; }
    prek install --hook-type pre-commit

fmt:
    go fmt ./...

lint:
    go tool golangci-lint run ./...

openapi:
    go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml

tidy:
    go mod tidy

test:
    go test ./...

test-integration:
    go test -tags=integration ./cmd/mina -run TestIntegrationScripts -count=1

pre-commit:
    if [ -f .pre-commit-config.yaml ]; then prek run --all-files; else just fmt && just test; fi

# Agent-only manual smoke commands should be added temporarily when a concrete uncovered risk remains outside the testscript end-to-end suite.
