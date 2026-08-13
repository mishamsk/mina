# github.com/mishamsk/mina/internal/clientcli

## Purpose

- Owns the catalog-driven REST client command tree, local and remote client sessions, request input, and output rendering.

## Implicit Contracts

- Generated commands, declared REST inputs, and invokers are built only from this package's catalog and call Mina only through `internal/httpclient`; excluded operations cannot leak into the generated CLI surface.
- An explicit `--server` selects remote mode; otherwise a configured or explicit `--db` selects local mode. Both explicit selectors are rejected, and an empty local database target is rejected rather than opening ephemeral state.
- Local mode accepts its handler and cleanup only from the process-injected factory. Generated command paths close the session; extensions that open one must close it, and `Session.Close` runs cleanup at most once. A factory missing either resource is rejected and any supplied cleanup is run.
- Remote mode alone reads `MINA_API_KEY` through the env-only accessor and adds it as a bearer credential; local in-process requests are credential-free.
- Local and remote sessions apply the shared `cli` client-surface editor to every generated REST request.
- Local asynchronous triggers use generated run-wait metadata and generated REST status operations until terminal. Configured failure outcomes write the terminal body to stderr and fail; remote triggers return their immediate response without polling.
- Errors already rendered to the command error stream return `ReportedError`, so `cmd/mina` does not reframe them as usage errors.
- Composite extensions receive Mina access only through `SessionFactory`; registration rejects names and aliases that collide with generated or earlier commands.

## Boundaries

- Owns: CLI catalog registration, client target selection and session lifecycle, input mapping, output rendering, and composite client workflows.
- Does not own: REST transport construction, runtime composition or handler lifecycle, REST server behavior, domain behavior, persistence, SQL, or MCP behavior.
