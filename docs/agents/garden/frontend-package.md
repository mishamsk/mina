# Frontend Package Documentation Gardening

Edit the one target frontend package document into the smallest accurate guide
to its purpose, implicit contracts, and boundaries.

Keep a statement only when it is true in current source, owned by this package,
and useful for preventing a locally reasonable wrong change. Preserve or add
non-obvious contracts involving route versus feature ownership, URL state,
browser persistence, request and cache lifecycle, refresh fan-out, focus
recovery, accessibility, shared component behavior, and cross-feature
coordination. State the local consequence rather than narrating implementation.

Remove or replace:

- Invalid, unproven, or misplaced contracts.
- Historical comparison and transition prose. Describe only the current UI
  contract, not what an earlier screen or implementation did.
- Repeated interaction details that can become one stronger workflow or
  ownership rule without losing a meaningful carve-out.
- Component, hook, selector, route, or feature inventories; implementation
  narration; temporary choices; and UX or architecture rules copied without a
  package-specific consequence.
- Generic testing prose that merely names frontend e2e or enumerates ordinary
  screen coverage.

Keep explicit exclusions, disabled states, ownership splits, fallback behavior,
and other deliberate decisions when they are current, consequential, and not
obvious from frontend architecture or web UI design. Prefer a link to the
owning design document plus the package-specific consequence over duplicated
interaction detail.

Preserve `Purpose`, `Implicit Contracts`, and `Boundaries`. Use `No implicit
contracts.` only when no non-obvious contract remains. Omit `Testing Notes`
unless it records a package-specific accommodation, deliberate omission,
fixture, browser lifecycle, or limitation not implied by the general frontend
test strategy.

Keep bullets short and evergreen. Do not record audit evidence or reasoning in
the target document. Leave it unchanged when no evidence-backed improvement
exists or the only findings are stylistic.
