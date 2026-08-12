Review backend changes for concrete risks to the accounting-data forward-compatibility guarantee in `docs/compatibility.md`.

Verify that upgrading an accounting database created by an earlier `main` version:

- Preserves all accounting information, identities, relationships, and accounting meaning through each new migration, even when stored representations change.
- Remains valid and usable when code that reads, calculates from, or validates persisted values changes.
- Includes a migration that transforms earlier stored values when new code would otherwise reinterpret them, so their accounting meaning remains unchanged.

Migration-file immutability is enforced programmatically and is outside this review. APIs, CLI and MCP commands, configuration, environment variables, files, backups, serialized runtime state, caches, downgrades, and old binaries opening newer schemas are not compatibility guarantees.

Report only specific accounting-data corruption, loss, changed-meaning, or unusability risks introduced by migrations or code interpretation in the diff.
