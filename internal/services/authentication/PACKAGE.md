# github.com/mishamsk/mina/internal/services/authentication

## Purpose

- Groups peer online and administration authentication services.

## Implicit Contracts

- `online` owns immutable startup authentication; `administration` owns mutable CLI-only operations.
- Neither peer imports the other; each owns the provider contract its use cases require.
- Runtime composes both peers with the file provider at their distinct execution boundaries.

## Boundaries

- Owns: the namespace and separation of authentication service capabilities.
- Does not own: files, app config, HTTP transport policy, CLI rendering, or runtime composition.

## Testing Notes

- Exercise behavior through runtime app-tests and launched-process smokes.
