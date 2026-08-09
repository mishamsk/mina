# Go Package Documentation Gardening

Edit the one target package document into the smallest accurate guide to the
package's purpose, implicit contracts, and boundaries.

Keep a statement only when it is:

- **True:** supported by current code or generated contracts.
- **Owned:** located in this package's document, or needed here to expose a
  package-specific consequence of a rule owned elsewhere.
- **Decision-useful:** not obvious from names, exported Go APIs, or adjacent
  code, and capable of preventing a locally reasonable wrong change.

Use the generated dependency context to identify likely consumers and
collaborators, but verify consequential claims in current source. Preserve or
add non-obvious couplings involving lifecycle ownership, caches, persistence,
validation, error translation, side effects, ordering, atomicity, concurrency,
aliasing, or reentrancy. State both the coupling and its consequence.

Remove or replace:

- Invalid, unproven, or misplaced contracts.
- Historical comparison and transition prose. Describe only the current rule,
  not how it differs from an earlier implementation.
- Repeated statements that can become one stronger bullet without losing a
  meaningful distinction.
- API and symbol inventories, file tours, implementation narration, feature
  catalogues, temporary choices, and architecture or semantics copied without
  a package-specific consequence.
- Generic testing prose that merely names a permitted test class or lists
  ordinary coverage.

Keep explicit carve-outs, exclusions, and deliberate decisions when they are
current, locally consequential, and not obvious from architecture or semantic
design docs. Link to an owning document instead of repeating it when the local
consequence remains clear.

Preserve `Purpose`, `Implicit Contracts`, and `Boundaries`. Use `No implicit
contracts.` only when no non-obvious contract remains. Omit `Testing Notes`
unless it records a package-specific accommodation, deliberate omission,
fixture, lifecycle, or limitation not implied by `docs/TESTING.md`.

Keep bullets short and evergreen. Do not record audit evidence or reasoning in
the target document. Leave it unchanged when no evidence-backed improvement
exists or the only findings are stylistic.
