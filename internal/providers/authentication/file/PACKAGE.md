# github.com/mishamsk/mina/internal/providers/authentication/file

## Purpose

- Implements authentication service contracts with a versioned local TOML file.

## Implicit Contracts

- The file accepts only its current version and no unknown TOML keys. It validates provider-owned signing-secret, Argon2id, and API-key-digest encodings before delegating decoded state invariants to `authentication/administration`.
- Create and update hold an interprocess lock. Creation cannot overwrite an existing file; updates write and sync a private temporary file, atomically replace the target, then sync its directory, so callers never observe a partial mutation.
- Newly created parent directories use `0700` and installed/replaced files use `0600`; existing paths are not permission-repaired.
- `Load` returns a startup-only immutable online snapshot. Administration writes and key or session revocations affect online authentication only after runtime loads a new snapshot on restart.
- Password hashes use this provider's fixed Argon2id parameters. Each snapshot permits one concurrent password derivation, including the dummy derivation for a missing or malformed stored hash, to bound login-driven memory use.
- API-key plaintext is generated from cryptographic randomness and is persisted only as a SHA-256 digest; verification compares digests in constant time.
- Browser sessions are HS256 JWTs bound to Mina's issuer and browser audience and require issued-at and expiration claims; malformed or invalid sessions become the online service's invalid-credential error.

## Boundaries

- Owns: file representation and filesystem side effects, credential material, and session signing/parsing.
- Does not own: authentication-state lifecycle or domain validation, online authentication decisions, app-config discovery, transport behavior, CLI interaction, or runtime composition.
