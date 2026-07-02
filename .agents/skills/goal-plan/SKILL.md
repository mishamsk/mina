---
name: goal-plan
description: "Use when creating implementation plans with user interactively. Do not use for unattended sessions. Produces plans with Task headers, Validation Commands, and checkbox items suitable for automated agent execution."
---

# Goal Plan Creation

## Overview

Turn ideas into implementation plans through **collaborative dialogue**. Output follows the plan format for automated orchestration below.

<CRITICAL>
## MANDATORY: Follow This Process

You MUST NOT write any plan file until you have completed these steps:

### Step 1: Understand (ask 2-3 questions minimum)
- Check out the current project state first (files, docs, recent commits)
- Ask questions ONE AT A TIME to refine the idea
- Prefer multiple choice questions when possible
- WAIT for user response before asking next question
- Focus on: purpose, constraints, success criteria

### Step 2: Propose Approaches
- Propose 2-3 different approaches with trade-offs
- Lead with your recommended option and explain why
- WAIT for user agreement before proceeding

### Step 3: Design Tasks
- Break the work into sequential tasks (one unit of work each) with subtasks
- Present tasks one at a time, validating each before moving on
- Each task should be independently verifiable
- Ask: "Does this task breakdown make sense?"
- WAIT for user confirmation

### Step 4: Write the Plan
- ONLY after user validates tasks, write the plan file
- Write specific, concrete, actionable checkbox items for each task
- Include test items in each task where applicable

DO NOT skip steps. DO NOT dump a complete plan without the conversation.
</CRITICAL>

## Plan Format

```markdown
# Plan: <Replace with a short project name/goal description> <optional: Kata issue>

<Brief description of the feature and overall goal - the overview section>

## Plan Context

<Add only context needed to understand this plan. Do not repeat project docs.>

## Tasks

### Task/Commit 1: [First Task Title]

<2-4 sentences of context: what this task accomplishes, key components involved, what becomes possible after this task completes>

- [ ] Implement X
- [ ] ...
- [ ] Add tests for Y
- [ ] Verification
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] <OPTIONAL, only when touched behavior affects CLI, real-network REST, process startup, JSON-over-HTTP behavior, UI: `just test-integration` passes>
  - [ ] <OPTIONAL, if a Kata issue exists: update progress in the Kata issue>
  - [ ] Commit changes
  - [ ] <OPTIONAL, only add if it is a big independent commit: with a clean worktree, run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>" <current commit sha>`>

### Task/Commit 2: [Second Task/Commit Title]

<Context for task 2...>

- [ ] Implement Z
- [ ] ...
- [ ] Update documentation
- [ ] Verification
  - [ ] `just test` passes
  - [ ] `just pre-commit` passes
  - [ ] <OPTIONAL, only when touched behavior affects CLI, real-network REST, process startup, JSON-over-HTTP behavior, UI: `just test-integration` passes>
  - [ ] <OPTIONAL, if a Kata issue exists: update progress in the Kata issue>
  - [ ] Commit changes
  - [ ] <OPTIONAL, only add if it is a big independent commit: with a clean worktree, run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>" <current commit sha>`>

## Final Verification

- [ ] `just test` passes
- [ ] `just test-integration` passes
- [ ] `just pre-commit` passes
- [ ] Commit final changes
- [ ] Run `just review-loop "<short task/goal summary; review-relevant constraints or decisions from user task or plan: item 1; item 2>"`
- [ ] Move this plan to `docs/plans/completed/`
- [ ] <optional: If a Kata issue exists, close it after the plan is moved to completed>
```

**Format rules:**
- Keep tasks/commits small, self-contained, and individually verifiable when practical.
- Make sure that review-loop steps always come after committing.

## After the Plan

**Documentation:**
- Write the plan to `docs/plans/YYYY-MM-DD-<topic>.md`
- Commit the plan to git

## Key Principles

- **One question at a time** - Don't overwhelm
- **Multiple choice preferred** - Easier to answer
- **YAGNI ruthlessly** - Remove unnecessary work from plans
- **Verifiable tasks** - Each task must be mechanically verifiable via Validation Commands
- **Incremental validation** - Validate tasks, then write plan immediately
