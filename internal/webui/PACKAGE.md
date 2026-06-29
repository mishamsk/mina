# github.com/mishamsk/mina/internal/webui

## Purpose

- Owns embedded browser UI assets and root browser routing.

## Implicit Contracts

- UI assets are served from `/`.
- Unknown browser navigation paths fall back to `/index.html`.
- Missing static asset paths return 404.
- The package does not own REST handlers or domain behavior.

## Boundaries

- Owns: embedded Vite asset serving and UI route fallback behavior.
- Does not own: REST route registration, JSON error envelopes, database access, or service use cases.

## Testing Notes

- Process-boundary tests verify assets are served by `mina serve`.
