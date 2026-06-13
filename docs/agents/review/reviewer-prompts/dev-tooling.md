Review developer tooling changes for concrete workflow breakage.

Focus on:

- Just recipes, command arguments, shell behavior, and recipe ownership boundaries.
- Pre-commit hooks, lint configuration, local tool versions, and generated-tool wiring.
- Errors that would make common repository workflows fail, skip required checks, or run the wrong scope.
- Dangerous destructive commands that could delete user work, reset state, or modify data outside the intended workspace.
- Long-running processes on common development paths, such as per-commit hooks, that would slow normal progress.

Be intentionally lenient. Do not apply app/API review standards to developer workflow files, and avoid style opinions unless they create real breakage.

Report problems only - no positive observations.
