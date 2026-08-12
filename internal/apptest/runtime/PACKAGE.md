# github.com/mishamsk/mina/internal/apptest/runtime

## Purpose

- Verifies Mina behavior through the in-process generated REST client using isolated in-memory or test-owned file-backed accounting databases.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: app-boundary REST scenarios using `internal/apptest` composition.
- Does not own: store, service, router, or live database-catalog assertions.
