# CLI and MCP Architecture

## Purpose

- Expose deliberately selected REST operations through generated CLI commands and MCP tools.
- Keep REST as the only application behavior boundary used by CLI and MCP.
- Support hand-written commands and tools that compose generated REST operations.
- Keep local database access free of an internal network listener.

## Terms

- Local mode opens a selected database and invokes Mina's REST handler in-process without network traffic.
- Remote mode invokes a running Mina server over HTTP, regardless of whether that server is on the same machine.
- A client session owns one generated REST client and the transport and lifecycle resources required by its mode.

## Source Contracts

- `api/openapi.yaml` owns REST operations, request shapes, response shapes, summaries, and descriptions.
- `api/client-surfaces.yaml` owns every CLI and MCP exposure decision.
- The OpenAPI `operationId` is the stable identity joining the two files and generated code.
- OpenAPI tags may supply default CLI areas and MCP groups but never expose an operation.
- Generated files are deterministic and are never edited by hand.

## Exposure Policy

- Every OpenAPI operation must have one explicit CLI decision and one explicit MCP decision.
- Each decision is either `exposed` or `excluded`; there is no default exposure.
- A new REST operation fails generation checks until both decisions are added.
- An exposed CLI operation declares its command name and may override its area.
- An exposed MCP operation declares its tool name and behavioral annotations and may override its group.
- When an area or group override is absent, the operation's single OpenAPI tag supplies it.
- An exposed operation with zero or multiple tags must configure each otherwise unresolved area or group explicitly.
- An exclusion includes a durable reason specific to that surface.
- CLI and MCP decisions are independent; an operation may be exposed on one and excluded on the other.
- Descriptions default to OpenAPI text but may be overridden for CLI or agent use.
- Parameter and body names remain owned by OpenAPI and are not renamed by surface config.

Conceptual configuration shape:

```yaml
operations:
  <operationId>:
    cli:
      state: exposed
      area: <optional-area-override>
      name: <command>
      completion: # optional; local asynchronous triggers only
        status_operation_id: <OpenAPI-operationId>
        run_id_response_field: <trigger-response-field>
        status_path_parameter: <status-operation-path-parameter>
        terminal_field: <status-response-field>
        terminal_values: [<terminal-value>]
        failure_values: [<terminal-failure-value>]
    mcp:
      state: exposed
      group: <optional-group-override>
      name: <tool>
      annotations:
        read_only: <bool>
        destructive: <bool>
        idempotent: <bool>
        open_world: <bool>

  <anotherOperationId>:
    cli:
      state: excluded
      reason: <reason>
    mcp:
      state: excluded
      reason: <reason>
```

## Generation

- A Mina-owned build-time generator reads the OpenAPI document and surface config together.
- The generator uses `kin-openapi` for OpenAPI loading and validation.
- The existing `oapi-codegen` client remains the only generated REST client.
- The generator emits a per-surface operation catalog with typed wrapping invokers into each surface package; `internal/httpclient` receives no generated surface output.
- Each wrapping invoker calls the matching `httpclient.ClientWithResponsesInterface` method.
- Body operations use generated arbitrary-body client methods so JSON nulls and unknown fields reach REST validation unchanged.
- Generated wrapping invokers normalize status, headers, and raw response bodies into one transport-neutral result.
- Generic CLI and MCP registrars build their surfaces from their own package's generated catalog.
- A surface's catalog contains exactly its exposed operations; an operation excluded from a surface has no entry or wrapping invoker there.
- Unsupported OpenAPI shapes fail generation when the operation is exposed; they are never silently omitted.

## Package Boundaries

- `internal/httpclient`: generated REST client types and methods and remote or in-process sessions; no surface metadata, catalogs, or wrapping invokers.
- `internal/clientcli`: generated CLI operation catalog and wrapping invokers, Cobra registration, CLI rendering, and hand-written command registration.
- `internal/mcpserver`: generated MCP operation catalog and wrapping invokers, MCP registration, MCP result mapping, and hand-written tool registration.
- `internal/tools/surfacegen`: build-time generator; it contains no product behavior.
- `internal/runtime`: database lifecycle, application composition, REST handler construction, and operation execution policy.
- `cmd/mina`: Cobra parsing, process I/O, signals, and delegation to the owning packages.
- Client-facing packages do not import stores, services, SQL, or REST server implementation details.

## Client Modes and Sessions

- A remote session uses a normal `http.Client` against a configured Mina server URL.
- A local session owns one runtime app and a request doer that invokes its REST handler in-process.
- The in-process doer supplies a synthetic base URL only for generated request construction.
- Local requests execute OpenAPI binding, REST validation, DTO mapping, services, and stores exactly like remote requests.
- Closing a local session closes the runtime app and database resources.
- Local access to a database already owned by another Mina process fails with guidance to use remote mode.

## Local Runtime Policy

- Local mode uses a one-shot runtime profile that registers manual triggers but never starts startup operations, schedules, or recurring operation goroutines.
- Manual operation triggers remain available without starting automatic operations.
- A local client runs a manual operation only when its selected REST operation explicitly triggers one.
- A local client that triggers asynchronous manual work keeps the runtime open until that run is terminal.
- CLI completion config identifies the trigger response's run-ID field, generated status operation and path parameter, status response's terminal field and values, and the terminal values treated as failures.
- The CLI polls completion only through generated REST client operations.
- Canceling the command cancels any active manual run before the local session closes.
- Reading operation status or invoking unrelated commands never starts operation execution.
- Opening a local session skips every database-validation pass, including shallow validation.
- Required database opening and migrations still run; database validation remains an explicitly selected diagnostic outside the client surface.

## CLI Surface

- Generated commands live under `mina client <area> <command>`.
- `--db` selects a local session and `--server` selects a remote session.
- The two connection selectors are mutually exclusive and may be supplied by normal Mina config.
- The CLI fails instead of silently selecting ephemeral database state when neither target is configured.
- OpenAPI path parameters become required positional arguments in path-template order.
- OpenAPI query parameters become typed flags; array parameters use repeatable values.
- Every JSON request body accepts `--json` with inline JSON, `@file`, or `-` for standard input.
- After resolving `$ref`, a body also receives typed field flags when its schema is one top-level object without composition or free-form additional properties and every property is a non-null scalar, enum, or array of those types.
- Optional body properties are omitted when their flags are absent; required properties are enforced unless `--json` is used.
- `--json` and body field flags are mutually exclusive; bodies outside the simple-object rule use `--json` only.
- A body/query/reserved flag-name collision makes that body JSON-only instead of introducing implicit prefixes.
- Successful response bodies are written to stdout as JSON.
- A configured local-completion failure is the exception: its HTTP-success terminal body is written to stderr and the command exits non-zero.
- REST error envelopes are written to stderr and produce a non-zero exit status.
- Empty successful responses produce no body output.
- Base generated commands favor stable JSON over operation-specific tables.
- Friendly workflows and presentation belong in hand-written composite commands.

Examples:

```text
mina client --db ./mina.db accounts list --limit 50
mina client --server http://127.0.0.1:8080 accounts get 42
mina client --db ./mina.db transactions create --json @transaction.json
```

## MCP Surface

- The official `modelcontextprotocol/go-sdk` owns MCP protocol behavior.
- One generated registry owns tool definitions for every explicitly exposed MCP operation.
- MCP tool names are composed from the configured group and tool name.
- Tool input schemas combine OpenAPI path parameters, query parameters, and an optional nested `body` property.
- The generator converts the supported OpenAPI 3.0 schema subset into MCP-compatible JSON Schema.
- REST remains the final transport-shape and domain validation boundary.
- Results include the REST status and decoded JSON body as structured content.
- REST failures are returned as MCP tool errors with Mina's stable error envelope available to the model.
- MCP annotations are explicit config decisions and are not security enforcement.
- Hand-written tools may compose generated operations but do not bypass the generated REST client.

## MCP Transports

- `mina mcp stdio --server URL` runs a standalone stdio server against a running Mina REST server.
- Stdio reserves stdout for MCP messages and sends diagnostics to stderr.
- `mina serve` exposes Streamable HTTP on `/mcp` on the existing listener.
- The embedded MCP server uses an in-process generated REST client targeting the REST handler directly.
- The MCP handler is composed beside `/api` and the web UI; it never calls the final composed handler.
- Streamable HTTP validates origins and retains Mina's loopback listener default.
- Non-loopback REST and MCP exposure share one authentication and deployment policy.

## Hand-Written Extensions

- Hand-written CLI commands and MCP tools register after generated surfaces.
- Extensions depend only on generated REST client contracts and client session factories.
- Extensions may call multiple REST operations and provide higher-level workflow semantics.
- Extension names are checked for collisions with generated and other extension names.
- Generated REST-equivalent commands and tools remain distinct from composite extensions.

## Checks and Verification

- The surface config's operation keys must exactly match the OpenAPI operation set.
- Every operation must have exactly one CLI state and one MCP state.
- Every exposed entry must have complete naming, resolved grouping, and MCP annotation metadata.
- Every excluded entry must have a non-empty reason.
- Unknown operations, duplicate names, invalid names, and unsupported exposed shapes fail checks.
- Generated CLI registrations must equal the configured exposed CLI set.
- Generated MCP registrations must equal the configured exposed MCP set.
- Generated output freshness is verified alongside `just openapi-check`.
- Compiling generated invokers proves that configured operations still match generated REST client methods.
- REST app-tests continue to own application behavior coverage.
- Process-level tests smoke local CLI, remote CLI, stdio MCP, and Streamable HTTP MCP wiring without duplicating REST scenarios.

## Libraries

- Cobra owns the command tree, flags, help, and completion behavior.
- `oapi-codegen` owns REST client generation.
- `kin-openapi` owns OpenAPI loading and validation for generation checks.
- The official MCP Go SDK owns MCP types, tools, stdio, and Streamable HTTP.
- Go standard packages own HTTP transport, JSON, templates, and process I/O.
