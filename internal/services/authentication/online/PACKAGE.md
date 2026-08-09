# github.com/mishamsk/mina/internal/services/authentication/online

## Purpose

- Owns state-read-only online authentication over immutable provider state.

## Implicit Contracts

- Password authentication normalizes the email and calls the password verifier even without an enabled matching user. Providers must safely verify an empty stored hash so failed credentials remain indistinguishable.
- Session issuance accepts only an identity that still matches an enabled user. Session verification also requires the signed user ID, subject, and session version to match an enabled user, so disabling a user or changing its version revokes its sessions in a newly supplied provider view.
- The service reads its provider on each operation but neither writes nor reloads it. With a startup snapshot, authentication-state changes take effect only when composition supplies a new snapshot.
- Failed API-key and session checks, including malformed session records, return `ErrInvalidCredential`; password-verifier operational errors propagate.

## Boundaries

- Owns: online credential decisions, session record validity, and the provider contract for credential material and session cryptography.
- Does not own: authentication administration or persistence, credential and session cryptography, HTTP credential parsing or cookie policy, transport error mapping, or runtime composition.
