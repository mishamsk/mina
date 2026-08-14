# github.com/mishamsk/mina/internal/apptest/runtime

## Purpose

- Verifies Mina behavior through the in-process generated REST client using isolated in-memory or test-owned file-backed accounting databases.

## Implicit Contracts

- Scenarios use `internal/apptest` fake time, schema allocation, REST-state waits, and controlled side-effect events; direct wall-clock waits, host-local time, random fixtures, and UUID fixtures are forbidden.

## Boundaries

- Owns: app-boundary REST scenarios using `internal/apptest` composition.
- Does not own: reusable test harness machinery or store, service, router, and live database-catalog assertions.
