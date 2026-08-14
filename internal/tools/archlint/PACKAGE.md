# github.com/mishamsk/mina/internal/tools/archlint

## Purpose

- Enforces repository architecture rules that depend on source layout or Go syntax rather than import boundaries.

## Implicit Contracts

- App-test determinism checks are scoped to `internal/apptest/runtime` and use Go type information to reject nondeterministic APIs through aliases, fields, helper returns, and chained expressions while allowing fixed time construction and parsing.

## Boundaries

- Owns: source-layout, test-package, build-tag, and app-test determinism checks.
- Does not own: import-boundary policy, application behavior, or test execution.
