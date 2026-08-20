# frontend

## Purpose

- Boots the TypeScript React browser app served at `/` by `mina serve`.
- Builds its assets into `internal/webui/dist` for the Go embed boundary.

## Implicit Contracts

- The shell stays behind the bootstrap splash until the authentication-status request and persisted UI-state hydration complete; bootstrap failures remain outside the shell.
- Authentication state is in memory only. A `401` from the current authentication generation returns the browser to login, while stale request results cannot overwrite a newer login or logout.
- Global initial heading focus waits for bootstrap and yields to a user or feature focus target.
- Frontend lint rejects handwritten `fetch`, `XMLHttpRequest`, and `sendBeacon` throughout `src`.
- Outside `src/api`, frontend code imports generated REST runtime operations through configured API entry points; handwritten modules inside `src/api` import them through `generated-access`.

## Boundaries

- Owns the application entrypoint and frontend build/toolchain configuration.
- Does not own Go asset serving, REST or backend domain behavior, generated API setup, browser-persistence adapters, or route and feature workflows. See [frontend architecture](../docs/frontend-architecture.md).
