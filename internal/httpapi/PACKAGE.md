# mina.local/mina/internal/httpapi

## Purpose

- Owns Chi route registration, HTTP request parsing, response encoding, and OpenAPI DTO mapping.
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
- The local strict JSON body validator owns Mina's unknown-field rejection and required-null checks until an OpenAPI validation middleware can preserve the same route, method, and error-message semantics.
- HTTP handlers call service use cases; they do not own domain validation or SQL.

## Boundaries

- Owns: HTTP status mapping, transport DTO conversion, REST query parsing, router middleware, and generated OpenAPI code if colocated.
- Does not own: database opening, CLI parsing, SQL execution, or service-layer decisions.

## Testing Notes

- REST behavior should be verified through runtime-constructed boundary tests.
