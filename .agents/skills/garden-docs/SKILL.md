---
name: garden-docs
description: Audit and compress Mina's PROJECT_STATE.md and backend or frontend PACKAGE.md files with a small fleet of fresh-context subagents. Use only when the user directly invokes $garden-docs; never invoke it implicitly or as part of routine implementation. Verify statements against current code, inspect bounded recent Mina sessions for usability evidence, cross-validate substantive edits, and preserve only current, well-owned, non-obvious guidance.
---

# Garden Docs

Preserve useful context, not documentation volume. Code proves truth, sessions
reveal confusion, and ownership decides where truth belongs.

## Read

Read `AGENTS.md`, `VISION.md`, `docs/architecture.md`,
`docs/package_doc_template.md`, and the target docs. Read
`docs/frontend-architecture.md` for frontend packages. Read a semantics doc
only when a target statement depends on it.

Check `git status --short`. Do not overlap user changes.

## Change Criteria

Keep or add a statement only when it is:

1. **True:** supported by current code, tests, or generated contracts.
2. **Owned:** located in the narrowest correct document.
3. **Decision-useful:** not immediately obvious from names, exported APIs, or
   adjacent code, and its absence could cause a locally reasonable wrong
   change.

Remove, replace, or relocate statements that fail a criterion. Sessions are
usability evidence, never proof of truth.

### Package docs

Package docs must counter overly localized reasoning. Keep implicit contracts
that tell an agent which adjacent consumer, sibling package, lifecycle owner,
cache, persistence path, validation boundary, or side effect must also enter
context. State the coupling and consequence, not a file tour.

Also keep surprising caller hazards involving ordering, atomicity, concurrency,
aliasing, reentrancy, or ownership. Remove API/symbol inventories,
implementation narration, feature catalogues, generic testing prose, temporary
choices, and architecture or semantics duplicated without a package-specific
implication.

Preserve the package template. Prefer `No implicit contracts.` and
`No package-specific testing notes.` to filler.

### Project state

Keep only durable, implemented, user-visible capability groups that answer
"Can Mina do this now?" and materially advance `VISION.md`.

Remove or aggregate phases, roadmap/history, per-Kata completion notes,
endpoint or interaction inventories, implementation mechanics, storage/runtime
detail, and semantics owned elsewhere. Prefer one capability outcome over a
list of how it works.

## Workflow

Use at most five subagents per run: three discovery agents, then two validators.
If concurrency is limited, run roles sequentially. Only the coordinator edits.

### 1. Bound the targets

Audit `PROJECT_STATE.md` and at most twelve package docs per run. When the user
does not name targets, prioritize recent churn, length, and known confusion.
For a larger request, finish one bounded run and report the remaining cohort.

### 2. Discovery fleet

Spawn three subagents with `fork_turns="none"`. Every prompt must include the
raw target paths, forbid edits, and request at most two decisive repository
citations per finding. Each agent stops after ten minutes and returns partial
results with limitations.

- **Truth and adjacency:** classify statements as supported, contradicted, or
  unproven; identify obvious prose and adjacent context needed for safe work.
- **Ownership and minimization:** apply the criteria independently; identify
  duplicates and the smallest wording that preserves consequential context.
- **Session evidence:** inspect recent Mina Codex sessions for confusion,
  corrective rereads, mechanical doc growth, or contracts that changed a
  decision. Consider only session files from the last 30 days, inspect at most
  the newest 50 files to find up to four repo-relevant top-level sessions, and
  filter by Mina working directory before reading content. Paraphrase only
  repo-relevant evidence; never expose unrelated content, secrets, or token
  estimates. Missing session access is a limitation, not a blocker.

The coordinator creates a candidate list with the statement, code evidence,
adjacent context, failed criterion, and proposed action. Every substantive
change needs repository evidence and independent review by both code auditors.
Resolve disagreements from their cited evidence; omit only changes whose truth
or ownership remains uncertain.

### 3. Edit

Prefer deletion, aggregation, and replacement. Net growth requires a proven
missing contract. Keep bullets short and evergreen. Do not record audit
evidence in product docs.

Do not edit code, `VISION.md`, `SCOPE.md`, architecture, or semantics docs. If
a guarded owner appears wrong, report it separately.

### 4. Validation fleet

After editing, spawn two new subagents with `fork_turns="none"`. Give each the
raw before/after diff and relevant code, forbid edits, and do not disclose the
intended findings.

- **Loss challenger:** find consequential contracts or adjacent context removed
  by the diff.
- **Bloat challenger:** find stale, obvious, duplicated, misplaced, or
  over-granular content retained or added by the diff.

Resolve only evidence-backed findings.

## Finish

- Recheck changed statements against all three criteria.
- Verify named paths, consumers, and ownership claims.
- Confirm package docs reveal required adjacent context.
- Confirm project state contains capability outcomes only.
- Run `git diff --check`.
- Do not run application tests for documentation-only changes.
- Follow a governing plan's verification workflow; otherwise follow the
  repository's no-plan review-loop instruction.

Stop without edits when truth cannot be established, findings are stylistic
only, targets overlap user work, or the required fix belongs to a guarded doc.
