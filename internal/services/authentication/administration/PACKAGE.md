# github.com/mishamsk/mina/internal/services/authentication/administration

## Purpose

- Owns CLI-only mutations of persisted authentication state and the provider contract they require.

## Implicit Contracts

- A provider must apply each `Create` or `Update` callback atomically to current state and persist it only on success; user and API-key uniqueness checks rely on that contract.
- User emails are normalized before comparison. API-key labels are trimmed and case-insensitively unique; revocation removes the key record, so its label is immediately reusable.
- Administration views never expose credential material. API-key plaintext is returned only when the key is created.
- Online authentication uses an immutable startup snapshot, so administration changes, including revocations, take effect only after restart.

## Boundaries

- Owns: authentication-state mutation decisions, validation, secret-free views, and the mutable provider contract.
- Does not own: state persistence, credential-material creation, online authentication, app-config discovery, transport or CLI interaction, or runtime composition.
