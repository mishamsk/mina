# github.com/mishamsk/mina/internal/tools/surfacegen

## Purpose

- Validates OpenAPI client-surface decisions and generates the CLI and MCP operation catalogs.

## Implicit Contracts

- No implicit contracts.

## Boundaries

- Owns: build-time client-surface contract validation and deterministic catalog generation.
- Does not own: REST behavior, runtime composition, CLI session execution, or MCP protocol behavior.
