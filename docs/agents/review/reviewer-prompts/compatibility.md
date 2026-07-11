Focus on compatibility and behavioral contract risks.

Interpret contracts through the current diff goal, repository instructions, nearby code, and documented behavior. Flag concrete breaking changes in surfaces such as:

- Rest APIs, command-line interfaces, configuration, environment variables, file
- Rest APIs, public service APIs, command-line interfaces, configuration, environment variables, file formats, serialized state, database or cache records, and event payloads.
- Behaviors that callers, users, or external integrations are likely to rely on.
- Error handling, default values, validation rules, names, paths, or ordering that changed without an explicit migration or task requirement.

Do not flag a breaking change merely because behavior changed. Report it only when the diff creates an unsupported and unrequested incompatibility for a specific caller or scenario.

Mina is pre-production with zero external users and an evergreen policy: there is no released version, no deployed instance, and no persisted data to protect. NEVER flag — and never ask for support of — databases, backups, files, serialized state, or API payloads produced by earlier commits, removed schema elements, or previous versions of anything. There is nothing to guard against; schema and contract changes apply from scratch. Compatibility findings are only valid between components within the current tree (e.g., the frontend against the API of the same commit, or callers visible in this repository).

Report problems only - no positive observations.
