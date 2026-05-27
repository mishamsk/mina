# Developer recipes for Mina.
# Required local tools for this stage: Go 1.25+ and just 1.51+.

set shell := ["sh", "-eu", "-c"]

fmt:
    go fmt ./...

test:
    go test ./...

test-boundary:
    go test ./...

pre-commit:
    just fmt
    just test-boundary
    just test

test-cli:
    @echo "test-cli placeholder: no process CLI tests yet"

test-rest:
    @echo "test-rest placeholder: no REST process tests yet"

smoke:
    @echo "smoke placeholder: no smoke suite yet"
