# Agent configuration

- The role variables at the top of `Justfile` own model and effort defaults. Fixers and rebases reuse `implement`; review and gardening tools receive settings explicitly from their recipes.
- `just agent <role> [-C workdir] [--prompt-file path | prompt]` starts an interactive session; `just agent-exec` takes the same arguments for headless work and requires a prompt. Roles select settings only; the supplied prompt defines the task. Use `--` before a prompt starting with a dash.
- Roles: `implement` (alias `fix`), `plan`, `fleet`, `fleet-codex`, `review-codex`, `review-claude`, `aggregate`, `validate`, and `garden`.
- Working directories resolve from the repository root selected by Just. Prompt files resolve from the chosen working directory; supply either inline text or a prompt file. Paths and prompts should be shell-quoted.
- `gpt-` model IDs launch Codex; `claude-` IDs launch Claude. Review and gardening tools retain their provider-specific flags and process management.
- Launchers preserve the repository's unattended permission settings: Codex bypasses approvals and sandboxing, and Claude skips permissions. Each launch prints the selected role, model, effort, and working directory.
- Fleet provider selection is manual: start Claude or Codex yourself and invoke fleet skills there, or use `just agent fleet` / `just agent fleet-codex`. There is no fleet provider fallback. `codex-goal-fleet` explicitly uses `fleet-codex`; raise `fleet_codex_effort` to `high` when desired.
- Overrides use `just --set <variable> <value>` or `MINA_DEV_<UPPERCASE_VARIABLE>` environment variables, such as `MINA_DEV_VALIDATE_MODEL`. Only the namespaced settings are exported so nested recipes and agents inherit them; an explicit `--set` wins over the environment. Restart without inherited overrides to pick up changed defaults.
- Launcher options `--model` and `--effort` override only that launch, leaving inherited role settings unchanged; the interactive model picker in `just kata-implement` uses these options.
- Fleet and Kata skills dispatch planning and implementation through the shared recipes. Completed plans remain historical artifacts.
- The [review-loop package documentation](../../internal/tools/reviewloop/PACKAGE.md) owns review scheduling, fallback, aggregation, and validation behavior.

```bash
just agent plan 'Plan the transaction-filter changes'
just agent-exec implement 'Implement docs/plans/example.md end to end.'
just agent-exec plan -C '/absolute/path/to/worktree' --prompt-file 'planning-prompt.md'
just --set validate_model gpt-6-sol review-loop --goal 'Check this change'
MINA_DEV_PLAN_EFFORT=medium just agent-exec plan -C '/absolute/path/to/worktree' 'Draft the plan'
just --set fleet_codex_effort high agent fleet-codex
```
