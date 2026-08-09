# frontend/src/features/recurring

## Purpose

- Owns the `/recurring` definition-management UI, editor, and definition snapshot.

## Implicit Contracts

- Load every definition page in ascending FQN order; stale or unmounted loads must not replace the current snapshot.
- Every definition mutation refreshes definitions and invalidates transaction/register views; confirm-next also refreshes account headers, featured balances, and Overview because it posts a transaction.
- Confirm and defer stay unavailable while a definition is paused; defer is available only for interval schedules.
- The editor writes a complete balanced record set and exposes categories only for `flow` records. If its follow-up pause/resume request fails after the write, keep the editor open and report the partial result.
- Definition actions and editor closure restore focus to their opener, falling back to the feature restore target; the editor lets an open confirmation dialog handle Escape first.

## Boundaries

- Owns definition table/editor behavior, action state, and refresh coordination.
- Does not own recurring-occurrence review or actions, which belong to Transactions; REST endpoint generation, schedule semantics, accounting validation, and lookup persistence belong elsewhere.
