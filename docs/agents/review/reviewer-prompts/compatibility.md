Focus on compatibility and behavioral contract risks.

Interpret contracts through the current diff goal, repository instructions, nearby code, and documented behavior. Flag concrete breaking changes in surfaces such as:

- Rest APIs, command-line interfaces, configuration, environment variables, file
- Rest APIs, public service APIs, command-line interfaces, configuration, environment variables, file formats, serialized state, database or cache records, and event payloads.
- Behaviors that callers, users, or external integrations are likely to rely on.
- Error handling, default values, validation rules, names, paths, or ordering that changed without an explicit migration or task requirement.

Do not flag a breaking change merely because behavior changed. Report it only when the diff creates an unsupported and unrequested incompatibility for a specific caller or scenario.

Report problems only - no positive observations.
