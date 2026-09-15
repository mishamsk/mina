Goal: implement kata issue {{issue}}

## Constraints:

- Focus squarely on the selected issue; do not add unrelated changes or expand its scope.
- Before implementation, use a subagent to check all acceptance criteria and requested test coverage against `docs/TESTING.md` and every applicable scope-specific guide. Have it return concise findings and proposed corrections; update the issue to remove prohibited coverage requirements or replace them with permitted verification that preserves the intended outcome.
- Before implementation, use a separate subagent to compare all issue scope, implementation details, and acceptance criteria with current code and owning documentation. Have it return concise, evidence-backed corrections; update the issue to remove completed, redundant, or irrelevant scope items and correct stale details and acceptance criteria while preserving the intended outcome.
- If material ambiguity remains or a correction would change the intended outcome, seek interactive clarification before implementation.
- Make the smallest change that addresses the issue while following the architecture and other applicable project documentation.

## Acceptance criteria.

- [ ] The selected issue's stated outcome and acceptance conditions are complete.
- [ ] Relevant repository-owned validation for the affected behavior passes.
- [ ] Commit the implementation and leave the worktree clean.
- [ ] With a clean worktree, derive and supply a concise `--goal` from the implementation outcome and its key scope constraints; do not pass the Kata issue text or body to reviewers. Run `just review-loop --goal "<derived implementation goal>"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Do not invoke review-loop a second time; report any remaining findings in the completion summary.
- [ ] Close the Kata issue with the commits and validation evidence.

## Kata Issue Body

{{issue_body}}
