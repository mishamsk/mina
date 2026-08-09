# Go Package Folder Documentation Gardening

Edit the one target folder document into the smallest accurate guide to the
collective boundary formed by its descendant Go packages. The target is an
umbrella folder, not an importable package.

Keep a statement only when it is true in current source, owned by the folder's
collective boundary, and useful for preventing a reasonable cross-package
mistake. Preserve or add non-obvious rules about responsibility splits,
dependency direction, shared lifecycle ownership, provider or service
contracts, side effects, and composition across descendant packages.

Remove or replace:

- Invalid, unproven, or child-package-specific claims that do not define the
  umbrella boundary.
- Historical comparison and transition prose. State the current arrangement
  without explaining how the folder used to be organized.
- Repeated child inventories or responsibility lists that can be summarized as
  one durable folder-level rule.
- File tours, symbol inventories, implementation narration, feature
  catalogues, temporary choices, and general architecture copied without a
  folder-specific consequence.
- Generic testing prose that merely names a permitted test class or ordinary
  coverage.

Keep explicit carve-outs, exclusions, dependency-direction decisions, and
ownership splits when they remain current and are not obvious from the
architecture docs. Link to an owning document instead of duplicating it when a
short local consequence or pointer is sufficient.

Preserve `Purpose`, `Implicit Contracts`, and `Boundaries`. Use `No implicit
contracts.` only when no non-obvious folder-level contract remains. Omit
`Testing Notes` unless it records a collective accommodation, deliberate
omission, fixture, lifecycle, or limitation not implied by `docs/TESTING.md`.

Keep bullets short and evergreen. Do not record audit evidence or reasoning in
the target document. Leave it unchanged when no evidence-backed improvement
exists or the only findings are stylistic.
