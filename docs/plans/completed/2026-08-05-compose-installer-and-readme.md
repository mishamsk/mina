# Plan: One-command Compose installer and agent-first guide (Kata bk6t)

## Goal

Deliver a safe one-command installer for a fresh local Compose deployment and replace the README material after its existing product preamble with a concise, agent-first guide that reflects Mina's actual supported paths.

## Constraints

- Preserve the README header, alpha warning, story, and product/vision preamble verbatim.
- Order the replacement guide as Quick Start; REST, MCP & CLI; Security and Data; Docker Compose Deployment; Contributing; License.
- Put a copyable agent instruction first. Follow it with one-command ephemeral demos using direct `go run` and mise-managed Go, then the Compose installer command linking to the detailed Compose section.
- Do not document a release-binary path while the repository has no releases or assets. Remove the obsolete mise package-backend command, embedded legacy agent prompt, and repeated setup, operations, and security prose.
- Keep security guidance deployment-neutral until the Compose section and preserve the loopback, trusted-network/TLS, authentication, encryption, private-file, independent-backup, and unrecoverable-key boundaries.
- Add `docker/install.sh`; do not change application behavior, authentication ownership, Compose posture, or security contracts.
- Resolve the supported `main` source to one commit before downloading `compose.yaml` and `.env.example`; continue deploying the supported `main` image so normal Compose updates remain available.
- Operate noninteractively with safe defaults, including administrator email `admin@local`; allow `--email` and deployment-directory overrides without prompting.
- Operate only on an explicitly fresh target. Refuse existing files, directories, database volumes, or deployment state, and clean up installer-created state on failure.
- Create users and API keys only through `mina auth`; never edit `auth.toml`.
- Keep Docker validation installer-specific and reuse existing lifecycle coverage rather than adding product scenarios.
- Follow the user's explicit review command: run review-loop once with a derived `--goal`, not `--plan`.

## Success Criteria

- [x] A fresh dedicated directory can be provisioned noninteractively with defaults or an explicit email into an authenticated, encrypted, healthy local Compose deployment with a stored automation API key.
- [x] Existing deployment state is rejected without modification, failed initialization has a clear recovery path, and generated secret files and directories have private permissions.
- [x] The rewritten README follows the agreed outline and gives accurate copyable agent, direct-Go, mise-Go, Compose, interface, security, operations, contributing, and licensing guidance without duplication.
- [x] `docker/PACKAGE.md`, `docs/authentication.md`, and `PROJECT_STATE.md` describe only the user-visible installer contract they own.
- [x] `just pre-commit` and `just test-docker` pass.
- [x] From a clean worktree, derive a concise review goal from the implementation outcome and key scope constraints, then run `just review-loop --goal "<derived implementation goal>"` exactly once; resolve its findings, rerun affected validation, and commit the fixes without invoking review-loop again.
- [x] Close Kata issue `bk6t` with commits and validation evidence.
- [x] Move this plan to `docs/plans/completed/`, commit the move, and leave the worktree clean.

## Tasks

### Task 1: Install a fresh secure Compose deployment

Add the auditable POSIX installer and minimal Docker-recipe coverage for prerequisites, coherent artifact retrieval, private generated state, authenticated encrypted startup, CLI-created API-key use, health verification, safe refusal, and failure cleanup.

- [x] The installer succeeds from a scripted fresh target and refuses existing deployment state without changing it.
- [x] Installer-specific checks run through `just test-docker` and leave no Docker or filesystem artifacts.
- [x] Commit as `feat(docker): add secure compose installer`.

### Task 2: Publish the agent-first user guide

Rewrite the README only after its retained preamble, consolidate the full Compose handoff, and update narrowly owning deployment/authentication/state documentation.

- [x] Demo commands are smoke-validated against the current public module and use `serve --demo` directly.
- [x] Documentation follows the operator-approved order and contains each security and operations claim once.
- [x] Commit as `docs: rewrite setup guide around agent-first quick start`.

### Task 3: Verify and review the delivered workflow

Run the relevant repository-owned checks, invoke the required clean-worktree review once, resolve findings within scope, and complete the issue ledger and plan lifecycle.

- [x] Validation and review evidence meet the plan-wide success criteria.
- [x] Commit review fixes, if any, and the completed-plan move as self-contained commits.
