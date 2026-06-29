# frontend

## Purpose

- Owns the TypeScript React app served by `mina serve`.
- Produces browser assets for the Go embed boundary.

## Implicit Contracts

- Frontend accounting state is read and written only through generated REST client operations.
- Browser storage is limited to UI preferences, UI-only caches, and draft UI state.

## Boundaries

- Owns: browser UI source, frontend toolchain configuration, shadcn/Tailwind configuration, and Vite build configuration.
- Does not own: REST handlers, backend domain behavior, database access, or local app config loading.

## Testing Notes

- Use Justfile frontend recipes for formatting, linting, typechecking, build checks, and browser e2e checks.
