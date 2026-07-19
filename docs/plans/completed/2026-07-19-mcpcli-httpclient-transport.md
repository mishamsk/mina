# Plan: Extract the reusable in-process generated REST client transport into `internal/httpclient`

Move the synthetic-base-URL client construction and the `http.Handler`-backed request doer currently embedded in `internal/apptest/client.go` into a small exported `internal/httpclient` API, so future client surfaces (local CLI mode, embedded MCP) can reuse the in-process transport. Existing app-test behavior must remain byte-for-byte unchanged; no production behavior is added.

## Plan Context

- Owning docs: `docs/architecture.md` (`internal/httpclient` owns "remote or in-process client session construction"), `docs/cli-mcp-architecture.md` (Client Modes and Sessions: "The in-process doer supplies a synthetic base URL only for generated request construction"), `internal/httpclient/PACKAGE.md`, `docs/TESTING.md`.
- This is a pure internal refactor: no new test scenarios, no new production behavior, no OpenAPI or generated-code changes. `internal/httpclient/openapi.gen.go` must not be touched.
- The new API lives in a hand-written file (for example `internal/httpclient/transport.go`) beside the generated client. Keep it small: an exported request doer backed by an `http.Handler` plus a constructor that returns a `*ClientWithResponses` wired with that doer and a synthetic base URL. Naming is yours, but names must be evergreen and describe the in-process transport, not its test origin.
- Hard constraint: `internal/httpclient` must not import `internal/runtime`, `internal/services/...`, `internal/store`, `database/sql`, `testing`, or `net/http/httptest`. The current `inProcessDoer` uses `httptest.NewRecorder`; the moved implementation must instead use a minimal package-private `http.ResponseWriter` recorder (status defaulting to 200 on first write, header copy, body buffer) because this transport becomes production code for local CLI mode later. Preserve the current doer semantics: honor an already-canceled request context, close the request body, and return a fully readable `*http.Response` with status, headers, and body populated.
- `internal/apptest` keeps everything else it owns today: runtime construction, test-only options, fake clock/providers, cleanup policy, and the per-test schema naming. Only the transport construction moves; `internal/apptest/client.go` switches to the new exported API and drops its private doer and `testServerURL` constant.
- Update `internal/httpclient/doc.go` and `internal/httpclient/PACKAGE.md` in the same commit as the API: the package now owns generated REST client code plus remote HTTP and in-process handler transports; `internal/apptest` remains the first approved consumer, and other production use still needs an approved use case (`docs/cli-mcp-architecture.md` defines the upcoming ones).
- Do not add tests anywhere: no unit tests in `internal/httpclient` (see `docs/TESTING.md` — no unit tests, no new test locations), and no new app-test scenarios. Existing app-tests are the proof the refactor is behavior-preserving.
- Do not change `.golangci.yml`; boundary enforcement for client-surface packages is a separate, later task.

## Tasks

### Task 1: Export the in-process handler transport from `internal/httpclient`

End state: `internal/httpclient` exposes a small hand-written API that builds a generated REST client backed by an in-process `http.Handler` doer with a synthetic base URL, with package docs describing both remote HTTP and in-process handler transports.

- [x] Add the hand-written in-process transport file to `internal/httpclient`: an exported handler-backed doer implementing the generated `HttpRequestDoer` contract without importing `net/http/httptest` or any testing package, plus an exported constructor returning a `*ClientWithResponses` wired with the doer and a synthetic base URL. Document every exported identifier.
- [x] Update `internal/httpclient/doc.go` and `internal/httpclient/PACKAGE.md` to describe the package's two transports (remote HTTP via generated constructors, in-process handler via the new API) and its consumer contract.
- [x] Commit the task as `Export in-process handler transport from internal/httpclient`.

### Task 2: Rewire `internal/apptest` onto the exported transport

End state: `internal/apptest/client.go` builds its REST client through the new `internal/httpclient` API; the private `inProcessDoer`, `httptest` recorder usage, and `testServerURL` constant are gone from `internal/apptest`; observable harness behavior is unchanged.

- [x] Replace the private doer and synthetic-URL construction in `internal/apptest/client.go` with the exported `internal/httpclient` API, leaving all apptest options, runtime construction, cleanup, and helper behavior untouched.
- [x] Verify no other `internal/apptest` file still references the removed private transport pieces.
- [x] Commit the task as `Use exported in-process transport in apptest harness`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes with no app-test changes.
- [x] `just pre-commit` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Extract in-process generated REST client transport from internal/apptest into exported internal/httpclient API; pure refactor, no behavior or test changes; internal/httpclient must not import runtime, services, stores, SQL, testing, or net/http/httptest"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
