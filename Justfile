# Developer recipes for Mina.
# Required local tools for this stage: Go 1.25.0+, just 1.51+, and prek 0.4+.

set shell := ["sh", "-eu", "-c"]

fmt:
    go fmt ./...

lint:
    go tool golangci-lint run ./...

openapi:
    go tool oapi-codegen -config api/oapi-codegen.yaml api/openapi.yaml

test:
    go test ./...

test-boundary:
    go test ./...

pre-commit:
    if [ -f .pre-commit-config.yaml ]; then prek run --all-files; else just fmt && just test-boundary && just test; fi

test-cli:
    go test ./cmd/mina -run TestCLISmokeScripts

test-rest:
    go test ./cmd/mina -run TestRESTSmokeProcess

smoke:
    just test-cli
    just test-rest
