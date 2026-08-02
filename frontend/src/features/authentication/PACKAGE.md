# frontend/src/features/authentication

## Purpose

- Owns the public browser login workflow shown before Mina's application shell.

## Implicit Contracts

- The password remains in the native form control and one request payload only; authentication credentials are never written to browser storage.
- A valid HttpOnly cookie is server-owned; frontend state retains only public authentication status and user display metadata.
- Session loss replaces the shell with login without preserving a protected screen underneath.

## Boundaries

- Owns: login-screen behavior and presentation.
- Does not own: authentication-file administration, cookie signing, REST protection, roles, password recovery, or browser persistence.

## Testing Notes

- Browser e2e covers login, reload, logout, session loss, and auth-disabled startup.
