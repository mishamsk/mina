# github.com/mishamsk/mina/internal/background

## Purpose

- Coordinates in-process registered operations and runner-owned maintenance tasks.

## Implicit Contracts

- `Close` rejects new work, cancels the runner context, and joins accepted work; callers must close the runner before resources used by its work.
- Manual triggers record their initial run with the request context; when accepted, the body runs on the runner context, so request cancellation does not stop it.
- Startup, scheduled, and manual invocations share a key-based no-overlap guard; a contender records a skipped run, and the guard remains held through its terminal status write.
- Default and optional startup invocations pair their run function with one timeout budget shared by all retry attempts.
- A run records one invocation despite retries. Only `Transient` errors retry (`MaxRetries + 1` attempts); cancellation or deadline errors record cancellation, `AlreadyDone` records success, and other errors record failure.
- Runner shutdown can leave a started operation without a terminal status because canceled work does not write one.
- Schedules accept only five-field cron expressions and use UTC unless an operation explicitly selects the runner clock's local location; `Start` resolves each initial deadline before returning, and each idle schedule loop owns one cancelable clock-deadline wait until its next run. A local deadline that falls in a daylight-saving gap resolves to the next matching time, so that day's run is skipped.
- Unrecorded submitted work shares cancellation and shutdown joining, but has no operation-run record, retry, or timeout policy; non-cancellation failures are logged.

## Boundaries

- Owns: runner lifecycle, trigger and schedule execution, timeout/retry application, no-overlap guards, and unrecorded task execution.
- Does not own: which operations are registered, operation-run status transitions or persistence, domain behavior, REST DTOs, or provider calls.
