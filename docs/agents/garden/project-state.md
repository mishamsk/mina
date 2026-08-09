# Project State Gardening

Edit the one target `PROJECT_STATE.md` as a concise, developer-facing map of
implemented reality. It should let a maintainer compare what exists across
Mina's product and technical surfaces with `VISION.md` and `SCOPE.md` before
planning or changing the system.

Do not turn project state into a README, product synopsis, elevator pitch, or
restatement of vision and scope. Preserve enough implementation granularity to
answer questions such as:

- Which coherent capability slices are implemented?
- Which REST, CLI, MCP, web UI, runtime, deployment, and storage parts of those
  slices exist?
- What meaningful constraints, carve-outs, or incomplete cross-surface coverage
  distinguish implemented reality from the destination?

Compaction is required, but line-count reduction is not the objective. Compact
within an implementation layer or capability slice; do not flatten distinct
surfaces into broad claims that hide what a developer can actually build on.

Synthesize accumulated delivery fragments:

- Merge bullets that describe incremental pieces of one now-coherent feature.
- Replace repeated operation or interaction lists with one precise capability
  statement when it preserves surface coverage, lifecycle, and constraints.
- Remove duplicate qualifiers and cross-section overlap while keeping each fact
  under the implementation surface that makes it useful.

Preserve:

- Implemented foundations and technical capabilities that materially affect
  subsequent work, even when they are not directly user-facing.
- Surface availability and parity facts needed to see whether a vision slice is
  complete across REST, CLI, MCP, and web UI.
- Current operational modes, persistence and security boundaries, lifecycle
  behavior, and deliberate exclusions that constrain future implementation.
- Explicit carve-outs and surprising decisions not obvious from architecture,
  design, or semantic docs.

Remove or replace:

- Historical comparison, migration, phase, sequencing, and transition prose.
  State current implementation without describing how it differs from the past.
- Roadmap, active-scope, per-task, and completion-history language.
- Invalid, unproven, planned, or aspirational capabilities.
- Low-level implementation trivia, exhaustive endpoint or control inventories,
  and semantics already owned by focused docs when they add no planning signal.
- Broad product descriptions and missing-feature lists copied from README,
  `VISION.md`, or `SCOPE.md`; precise implemented slices should make the delta
  visible without duplicating those documents.
- Test-suite descriptions when the supported behavior or boundary can be stated
  directly.

Bad compaction replaces API, runtime, client, web UI, and storage sections with
a handful of consumer-facing summary bullets. Good compaction consolidates
related details inside those sections while preserving which usable surfaces,
foundations, limitations, and integration points are actually present.

Keep the result evergreen and structured for fast developer scanning. Do not
add future work or record audit evidence and reasoning in the target document.
