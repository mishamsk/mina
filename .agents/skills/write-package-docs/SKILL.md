---
name: write-package-docs
description: Create or update Mina backend and frontend PACKAGE.md files during implementation work. Use for every package touched by the current work. Do not use for documentation gardening, broad package-doc audits, or cleanup passes; those require a separate gardening workflow.
---

# Writing Package Docs

Keep package docs short, evergreen, and useful to someone changing the package. Do not expand the current work into documentation gardening.

## Workflow

1. Use the current task context. Read package code, the current `PACKAGE.md`, or owning docs only when needed for an accurate update.
2. For a new doc, copy [the template](assets/package-doc-template.md). Keep every template section.
3. For an existing doc, update only statements affected by the current work. Preserve unrelated content.
4. Record non-obvious local ownership, cross-package consequences, side effects, and invariants. Link to an owning doc instead of repeating it.
5. Do not add file tours, API inventories, feature catalogues, implementation narration, history, or generic testing prose.

Use short, mostly one-line bullets.

## Required Sections

### Purpose

State why the package exists in one or two bullets. Leave neighboring exclusions to Boundaries.

- Bad: `Provides helpers for Mina services.`
- Good: `Coordinates exchange-rate loading windows and provider calls.`

### Implicit Contracts

State only contracts not obvious from names, types, exported Go docs, or generated API contracts. Use `No implicit contracts.` only after checking consumers, collaborators, lifecycle callbacks, persistence boundaries, and caller-visible behavior.

- Bad: `CreateAccount creates an account.`
- Good: `Transaction writes must invalidate the process-local currency reference cache.`

### Boundaries

Locate the package between its durable responsibility and the nearest responsibility owned elsewhere.

- Bad: `Owns service logic. Does not own unrelated code.`
- Good: `Owns browser IndexedDB side effects. Does not own accounting data or REST response caches.`

## Optional Testing Notes

Omit `## Testing Notes` by default. Add it only for a package-specific accommodation, deliberate omission, unusual fixture or lifecycle, or other guidance not implied by `docs/TESTING.md`.

Do not add it merely to name a permitted test class or list ordinary coverage:

- Bad: `Account behavior is covered by app-tests at the REST boundary.`
- Bad: `Frontend e2e covers page rendering and toolbar state.`

Add it when the package changes how testing must work or explains a non-obvious limitation:

- Good: `Use an apptest-owned HTTP fake so provider failures remain deterministic.`
- Good: `Each browser retry receives its own writable database copy from the immutable seeded template.`
