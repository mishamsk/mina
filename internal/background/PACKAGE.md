# github.com/mishamsk/mina/internal/background

## Purpose

- Owns in-process background operation and maintenance-task execution.

## Implicit Contracts

- Operation execution is non-durable and stops with the process.
- Startup, recurring, and unrecorded work share one runner lifecycle; manual operation bodies join it after request-scoped run setup.
- Shutdown rejects new submissions and joins accepted work before `Close` returns.
- Unrecorded maintenance tasks share runner cancellation and shutdown joining without operation status, retries, or timeout policy.
- Asynchronous task and operation-run plumbing failures are written to the runner error log; synchronous manual-trigger failures are returned to the caller.
- Runner shutdown may omit terminal operation status because runtime rows are disposable.
- Each startup, scheduled, or manual invocation is recorded once; retries are folded into that run.
- Keyed no-overlap is enforced before operation bodies run.
- Retry count is operation-owned; zero-retry operations make one attempt.

## Boundaries

- Owns: runner-scoped task lifecycle, startup triggers, manual triggers, cron schedules, retry/backoff, timeouts, and no-overlap guards.
- Does not own: operation-run status transitions, domain behavior, SQL persistence, REST DTOs, or provider calls.

## Testing Notes

- Runtime-bound app tests verify startup, trigger, schedule, no-overlap, and observable run status.
