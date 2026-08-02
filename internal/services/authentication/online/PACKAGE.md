# github.com/mishamsk/mina/internal/services/authentication/online

## Purpose

- Owns state-read-only online authentication over immutable startup state.

## Implicit Contracts

- Authenticates passwords, verifies API keys, and owns the validity and verification of stateless browser sessions.
- Reads only an immutable provider snapshot loaded during long-running startup; it never writes or live-reloads authentication state.
- Owns online authentication types, errors, use cases, and the immutable provider contract.
- HTTP calls this service for external REST protection, login, and authentication status behavior; HTTP owns logout cookie clearing.
- Runtime supplies this service to HTTP and keeps trusted in-process REST dispatch behind MCP's single outer authorization decision.

## Boundaries

- Owns: online credential decisions and stateless session behavior.
- Does not own: administration, files, app config, HTTP bearer/cookie parsing, public-route selection, cookie attributes, same-origin enforcement, transport errors, CLI prompting, or runtime composition.

## Testing Notes

- Exercise behavior through runtime app-tests and launched-process smokes.
