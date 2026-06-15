# github.com/mishamsk/mina/internal/background

## Purpose

- Owns in-process background operation execution.

## Implicit Contracts

- Operation execution is non-durable and stops with the process.
- Each startup, scheduled, or manual invocation is recorded once; retries are folded into that run.
- Keyed no-overlap is enforced before operation bodies run.
- Retry count is operation-owned; zero-retry operations make one attempt.

## Boundaries

- Owns: startup triggers, manual triggers, cron schedules, retry/backoff, timeouts, and no-overlap guards.
- Does not own: operation-run status transitions, domain behavior, SQL persistence, REST DTOs, or provider calls.

## Testing Notes

- Runtime-bound app tests verify startup, trigger, schedule, no-overlap, and observable run status.
