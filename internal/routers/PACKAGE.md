# mina.local/mina/internal/routers

## Purpose

- Maps REST requests and responses to controller calls.

## Implicit Contracts

- Error responses use the stable `models.ErrorResponse` JSON envelope.

## Boundaries

- Owns: HTTP status mapping, request parsing, and response encoding.
- Does not own: SQL, process configuration, or domain validation.

## Testing Notes

- Router behavior should be verified through the in-process app boundary.
