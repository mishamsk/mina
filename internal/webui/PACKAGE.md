# github.com/mishamsk/mina/internal/webui

## Purpose

- Serves the frontend build embedded in the Mina binary and provides the root browser routing fallback.

## Implicit Contracts

- Accepts only `GET` and `HEAD`; other methods return `405`.
- Missing static-looking paths return `404`, while other unknown paths serve `index.html` for client-side routing.

## Boundaries

- Owns embedding and serving the frontend build output; the `frontend` workspace owns producing `dist`.
- Runtime reserves `/api` and `/mcp` before dispatching remaining requests here, and owns the legacy `/ui` redirect.
- Does not own REST, authentication, database access, or domain behavior.
