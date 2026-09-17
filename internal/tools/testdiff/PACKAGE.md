# github.com/mishamsk/mina/internal/tools/testdiff

## Purpose

- Reports test inventory changes against the existing main worktree as JSON or a readable console summary through `just test-diff`.

## Implicit Contracts

- The default compares clean main and current worktree commits directly, not their merge base; `--worktree` includes staged, unstaged, and untracked current changes while main must remain clean. Output records commits and comparison mode; callers must avoid editing inputs during discovery.
- Main's inventory is cached in the invoking worktree's `build/test-diff/main-v2/<main-sha>.gob`; current inventory is always fresh. Main must remain clean on cache hits. Successful, revision-checked collection publishes cache files atomically; invalid entries are rebuilt. Remove the cache directory to refresh after changing local runner/toolchain settings without changing main's SHA.
- Runner discovery uses the invoking checkout's Justfile recipes in each target worktree; current discovery and main cache misses require installed frontend dependencies and Go build prerequisites. Discovery compiles Go tests and loads Playwright modules but does not execute test bodies or start browsers. Errors abort the report.
- Go counts only top-level app tests, with modified counts represented as JSON `null`; CLI integration counts `.txt` and `.txtar` scripts separately, including their fixture content in line totals. Script inventories retain only paths, SHA-256 content hashes, and line counts; source contents are discarded after gathering.
- Frontend identities use file and full suite/title paths without browser projects; modified counts estimate diff overlap from each declaration to the next distinct test start or EOF. Helpers, formatting, generated cases sharing a location, and hooks can produce false positives; changes outside those ranges are not attributed.
- Renames count as removal plus addition. JSON schema version 1 uses deterministic change ordering, empty change arrays, and separate before/after locations; console colors are disabled for redirected output and `NO_COLOR`.

## Boundaries

- Owns: Git and runner collection, structured comparison, JSON and terminal rendering.
- Does not own: test execution recipes, coverage measurement, semantic impact analysis, or review orchestration.
