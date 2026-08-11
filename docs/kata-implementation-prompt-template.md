Goal: implement kata issue {{issue}}

## Constraints:

- Focus squarely on the selected issue; do not add unrelated changes or expand its scope.
- If the issue scope is underspecified, seek interactive clarification before starting any work.
- Make the smallest change that addresses the issue while following the architecture and other applicable project documentation.

## Acceptance criteria.

- [ ] The selected issue's stated outcome and acceptance conditions are complete.
- [ ] Relevant repository-owned validation for the affected behavior passes.
- [ ] Commit the implementation and leave the worktree clean.
- [ ] With a clean worktree, derive and supply a concise `--goal` from the implementation outcome and its key scope constraints; do not pass the Kata issue text or body to reviewers. Run `just review-loop --goal "<derived implementation goal>"` exactly once; resolve its findings, rerun affected validation, and commit the fixes. Do not invoke review-loop a second time; report any remaining findings in the completion summary.
- [ ] Close the Kata issue with the commits and validation evidence.

## Kata Issue Body

{{issue_body}}
