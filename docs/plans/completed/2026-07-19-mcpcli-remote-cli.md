# Plan: Deliver the generated CLI in remote mode

Implement `internal/clientcli` and wire `mina client --server URL <area> <command>` so every configured CLI exposure is a working generated command against a running Mina server. Local (`--db`) mode is explicitly out of scope and arrives in a later plan.

## Plan Context

- Owning docs: `docs/cli-mcp-architecture.md` (CLI Surface — the rendering, argument, flag, body, output, and error rules are the contract; Client Modes and Sessions; Hand-Written Extensions), `docs/architecture.md` (`cmd/mina` delegates to owning packages; `internal/clientcli` boundaries), `internal/clientcli/PACKAGE.md`, `internal/httpclient/PACKAGE.md` and `catalog.go` (the generated catalog: `Operations()`, `CLIOperations()`, descriptors, `Invoker`, `InvocationInput`, `InvocationResult`, `InvocationInputError`), `docs/TESTING.md` (e2e boundary), existing `cmd/mina/main.go` command style and `cmd/mina/testdata/script/*.txt` conventions.
- Command tree: `internal/clientcli` builds a `client` Cobra command from `httpclient.CLIOperations()` — one subcommand per resolved area, one command per exposure under it, help text from catalog summaries/descriptions. The generated registration set equals the configured CLI exposure set by construction because the tree enumerates the generated catalog; do not hand-maintain any operation list.
- Session: a `--server URL` persistent flag on `client` selects a remote session (`httpclient.NewClientWithResponses` with a standard `http.Client`). With no `--server`, fail with an actionable message that a server target is required (no `--db` flag exists yet; never fall back to any implicit or ephemeral target). Validate the URL shape before issuing requests.
- Arguments and flags per the CLI Surface contract (`docs/cli-mcp-architecture.md`), driven entirely by the catalog descriptors:
  - path parameters become required positional arguments in path-template order (`cobra.ExactArgs`), passed through as strings via `InvocationInput.Path` (the generated invoker owns conversion and yields `InvocationInputError` on bad input);
  - query parameters become typed flags (string/int64/bool per descriptor type; enums as string flags — enum enforcement stays with REST validation); array parameters use repeatable flags; only flags the user actually set are sent;
  - every operation with a request body gets `--json` accepting inline JSON, `@file`, or `-` for stdin (exactly one form; read stdin from the command's configured input stream);
  - a body whose descriptor is `Simple` also gets typed field flags per top-level property (types per descriptor; arrays repeatable); `--json` and field flags are mutually exclusive; absent optional-property flags are omitted from the body; required properties are enforced when composing from field flags but not when `--json` supplies the body; if any body field flag name collides with a query flag or reserved flag (`json`, `server`, `help`), the body becomes JSON-only for that command — no implicit prefixes;
  - the composed or supplied body bytes go into `InvocationInput.Body` untouched (raw pass-through; no re-marshaling through typed structs, no client-side schema validation).
- Output and errors: on 2xx with a body, write the raw JSON response body to stdout (with trailing newline); on empty 2xx, write nothing; on non-2xx, write the REST error envelope body to stderr and return a non-zero exit status; transport and input errors also go to stderr with non-zero exit. stdout carries only response payloads.
- Hand-written extension seam: an exported registration hook in `internal/clientcli` that accepts additional hand-written commands, rejects (with an error at build/registration time) any name colliding with generated area/command names or previously registered extensions, and gives extensions access only to the client session and generated catalog invokers (no other Mina packages — depguard already enforces the imports). Ship the seam with zero extensions.
- `cmd/mina` wiring: `root.AddCommand(clientcli.New...)` following the existing constructor style (`stdin`, `stdout`, `stderr` threading like `newServeCommand`). `cmd/mina` must not import `internal/httpclient` directly (depguard enforces); all client behavior lives in `internal/clientcli`.
- E2E coverage (the only new tests; `docs/TESTING.md` e2e rules): ONE new testscript file (for example `cmd/mina/testdata/script/mina_client_remote.txt`) in the existing `cmd/mina` boundary with exactly three representative shapes against one launched `mina serve --demo` server (freeport + httpwait conventions from `mina_rest_api.txt`):
  1. query/list: `mina client --server http://127.0.0.1:$PORT transactions list --limit 5` (or equivalent) asserting JSON on stdout;
  2. positional-path read: fetch an entity by id (pick an id observable from a prior list output or a created resource) asserting the entity JSON on stdout;
  3. JSON-body write and error: create a resource via `--json` (inline or file) asserting success output, then a failing write (for example invalid body against REST validation) asserting the stable error envelope on stderr and a non-zero exit (`! exec`), plus one missing `--server` failure asserting the actionable message.
  Do not enumerate commands, add per-operation cases, or create any new test package or location. Do not add app-tests (no new REST behavior exists).
- Docs: update `internal/clientcli/PACKAGE.md` (implicit contracts: catalog-driven tree, rendering rules owned by `docs/cli-mcp-architecture.md`, extension seam collision policy) and `PROJECT_STATE.md` (user-visible: generated remote CLI surface). Keep both short.
- Do not add local database behavior, `--db`, config-file-supplied connection targets, `internal/mcpserver` code, or runtime changes. Do not modify generated files by hand.

## Tasks

### Task 1: Implement the `internal/clientcli` generated command surface

End state: `internal/clientcli` builds the full catalog-driven command tree with remote sessions, argument/flag/body rendering, output/error rules, and the collision-checked extension seam; the package compiles and honors its depguard boundaries.

- [x] Implement the catalog-driven command tree, remote session handling, input composition, and output/error rendering per Plan Context.
- [x] Implement the hand-written extension registration seam with collision checking per Plan Context.
- [x] Update `internal/clientcli/PACKAGE.md` per Plan Context.
- [x] Commit the task as `Implement generated remote CLI in clientcli`.

### Task 2: Wire `mina client` into the binary

End state: `mina client --server URL <area> <command>` works end to end from the built binary; `mina client` without `--server` fails with the actionable message; help output lists the generated areas.

- [x] Register the client command in `cmd/mina` following the existing constructor conventions, threading stdin/stdout/stderr.
- [x] Commit the task as `Wire mina client command`.

### Task 3: Add the representative e2e smoke and user-visible docs

End state: the three representative launched-process shapes pass in the existing e2e boundary and `PROJECT_STATE.md` records the remote CLI surface.

- [x] Add the single testscript file with the three representative shapes plus the missing-server failure per Plan Context.
- [x] Update `PROJECT_STATE.md` per Plan Context.
- [x] Commit the task as `Add remote CLI e2e smoke and project state`.

## Success Criteria

- [x] Every task's stated outcome and acceptance conditions are complete.
- [x] `just test` passes.
- [x] `just test-integration` passes, including the new client smoke.
- [x] `just pre-commit` passes.
- [x] Planned commits are present and the worktree is clean.
- [x] With a clean worktree run `just review-loop "Implement generated remote CLI: internal/clientcli catalog-driven command tree, mina client --server wiring, rendering rules per docs/cli-mcp-architecture.md CLI Surface, collision-checked extension seam, three representative e2e shapes only; no local mode, no --db"`; resolve findings, rerun affected validation, and commit the fixes.
- [x] Move this plan to `docs/plans/completed/` and commit the move.
