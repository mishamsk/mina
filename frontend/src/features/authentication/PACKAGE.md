# frontend/src/features/authentication

## Purpose

- Renders the pre-shell login form when authentication requires a session.

## Implicit Contracts

- Read credentials from native form controls, clear the password immediately after dispatch, and never retain credentials in component state or browser storage.
- Required-field validation focuses the first invalid field; a rejected login remains inline, clears the password, and returns focus to it.
- Disable the form while a login request is pending so one submission owns its result.

## Boundaries

- Owns: login-form presentation, validation, and submission feedback.
- Does not own: authentication status, session and cookie lifecycle, shell gating, or browser persistence.
