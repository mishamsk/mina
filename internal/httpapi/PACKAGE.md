# mina.local/mina/internal/httpapi

## Purpose

- Owns generated OpenAPI route registration, generated request binding, OpenAPI request validation, response encoding, and OpenAPI DTO mapping.
- Contains the adapter-owned generated OpenAPI contract subpackage.
  REST DTO structs are generated from `api/openapi.yaml` in `internal/httpapi/openapi`.

## Implicit Contracts

- Error responses use the stable JSON error envelope defined by the REST contract.
- Request middleware supplies request IDs, real IP handling, panic recovery, local API timeout enforcement, and optional access logs.
- Generated strict-server operation methods are the HTTP adapter implementation surface.
- Generated OpenAPI route registration is the only source of REST route path/method declarations.
- `/openapi.json` is an adapter-owned discovery endpoint serving the embedded generated spec.
  API tools should use `/openapi.json`; no interactive documentation endpoint is served.
- Generated request binding owns transport parsing for OpenAPI-declared path parameters, query parameter types/cardinality, and JSON body decoding.
- OpenAPI request validation owns transport-schema validation, including declared query values, JSON schema validation, unknown JSON fields, and required non-null JSON fields.
- Unknown query parameter names are rejected by an adapter guard derived from the matched OpenAPI operation because the upstream validator ignores undeclared query names.
- Parameter validation errors preserve Mina's JSON error envelope, normalize generic transport failure categories such as duplicate values, empty values, out-of-range schema values, and missing required parameters, and keep generated parse details for malformed values without endpoint-specific field-name message tables.
- Strict-server handlers consume generated request objects and generated `request.Params`; they map DTOs to service inputs, call services, and map service outputs, errors, and statuses to generated responses.
- Direct raw query parsing in `internal/httpapi` is disallowed unless a specific transport rule cannot be expressed through OpenAPI validation or generated params; document any exception near the code.
- Generated binding errors, OpenAPI validation errors, and strict handler errors all map to Mina's stable JSON error envelope before responses leave the adapter.
- HTTP handlers call service use cases; they do not own domain validation or SQL.

## Boundaries

- Owns: HTTP status mapping, transport DTO conversion, REST query validation/mapping, router middleware, and generated OpenAPI code if colocated.
- Does not own: database opening, CLI parsing, SQL execution, or service-layer decisions.

## Testing Notes

- REST behavior should be verified through runtime-constructed boundary tests.
