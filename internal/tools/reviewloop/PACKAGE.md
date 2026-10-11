# github.com/mishamsk/mina/internal/tools/reviewloop

## Purpose

- Orchestrates repository review, finding validation, and focused fix sessions for a selected change range.

## Implicit Contracts

- The Justfile owns role model and effort defaults and passes them explicitly, including guardian and Claude settings; Codex settings accept full model IDs or shorthand without `gpt-`.
- One persistent Codex guardian judges continuation, convergence, and review-provider alternation from supplied stage outputs and fix commit summaries; it does no reviewing, validation, fixing, or tool work. Nonfatal Codex diagnostic items do not count as tool use. There is no iteration cap or percentage schedule.
- The guardian selects a whole review round's provider before launch and chooses fallback after failure; failed providers stay unavailable for the invocation. A failed round is retried in full with the selected provider's template; aggregation, validation, fixing, or guardian failures end the invocation.
- Aggregation only deduplicates supplied findings and suppresses duplicates of earlier validator rejections; it retains one original version per finding without judging validity or evidence. Only independent Codex validators reject findings, and only their rejections enter review history; aggregator rejection blocks fail the invocation.
- The guardian is consulted before fixing validated findings and after each completed review; its clean stop requires a completed review with no pending findings. Selecting no reviewers also succeeds without a review or guardian decision. Clean exits succeed, stalled reviews exit 1, and unavailable providers or stage failures exit 2; decisions, findings, and fix summaries remain in ignored review history.
- Backend application selection includes configuration, background execution, concrete providers, shared backend helpers, and hand-written CLI and MCP surface code so accounting-data migration risks receive compatibility review wherever they originate.
- Generated application outputs are excluded; their declarative inputs and generators remain reviewable.
- Each invocation owns one unique ignored `build/.reviewloop-*` scratch directory, gives it to child agents through `TMPDIR` and `GOTMPDIR`, and removes only that directory best-effort without changing the review outcome when cleanup is incomplete.

## Boundaries

- Owns: reviewer selection, prompt generation, local review-session orchestration, and enforcement of the guardian decision protocol.
- Does not own: application behavior, contract policy, reviewer judgment, or issue tracking.
