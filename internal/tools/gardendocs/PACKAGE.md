# github.com/mishamsk/mina/internal/tools/gardendocs

## Purpose

- Selects eligible Mina documentation targets and runs isolated Codex prompts for them.

## Implicit Contracts

- The last sentinel commit touching a target excludes it from selection. `--limit` applies only to package documents; `PROJECT_STATE.md` and the governing web UI design and theme documents are selected separately.
- Gardening requires a clean named branch other than `main` and creates one sentinel commit per changed target.
- Up to four agents share one worktree. Commits begin only after the whole batch returns and validation confirms that only assigned documents changed.
- Agent process groups are cancelled with the gardener, and nested review-loop runs are disabled in both prompts and the environment.
- Successful agent output stays hidden; progress names each target, and the first failure cancels its batch and surfaces only the final captured error line.
- Go dependency context is the union of the current build and Mina's `integration` build tag.

## Boundaries

- Owns: package and governing-document target classification, gardening eligibility, generated dependency context, agent concurrency, and per-target Git commits.
- Does not own: gardening judgment or the category-specific instructions stored under `docs/agents/garden`.
