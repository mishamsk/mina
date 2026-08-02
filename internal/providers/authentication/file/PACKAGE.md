# github.com/mishamsk/mina/internal/providers/authentication/file

## Purpose

- Implements authentication service contracts with a versioned local TOML file.

## Implicit Contracts

- Owns authentication-file representation and credential-material validation, filesystem locking, private directory and file modes, atomic replacement, and credential-material cryptography; decoded domain state delegates to administration validation.
- Exposes separate immutable online and mutable administration implementations for the contracts owned by their respective services.
- Immutable online state never writes or live-reloads; administration mutations serialize across processes and changes apply online after restart.
- Passwords use Argon2id hashes; API keys use generated high-entropy secrets stored only as SHA-256 digests; browser sessions use generated signing material.
- Immutable snapshots serialize memory-hard password verification so public login attempts cannot multiply Argon2 memory use.
- The file stores active API keys only; revocation removes a record so its label is immediately reusable and the removed token stops authenticating after restart.
- Signing material, password hashes, API-key digests, and API-key plaintext are never returned by list operations.

## Boundaries

- Owns: file representation and side effects, password hashing and verification, API-key generation and verification, and session signing and verification.
- Does not own: app config discovery, transport policy, HTTP cookies/routes/errors, CLI prompting/rendering, listeners, database state, or runtime composition.

## Testing Notes

- Exercise behavior through runtime app-tests and CLI process smokes using test-owned temporary files.
