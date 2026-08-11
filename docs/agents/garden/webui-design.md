# Web UI Design Gardening

Edit the one target `docs/webui-design.md` into the smallest accurate ground truth for Mina's current web UI user experience. Preserve its ownership of product stance, page content and structure, interaction rules, domain display rules, and shared UX patterns; keep technical architecture in `docs/frontend-architecture.md` and visual styling in the theme specification.

Verify consequential rules against the implemented frontend, relevant frontend package documents, `docs/frontend-architecture.md`, owning domain-semantics documents, and the OpenAPI contract. Keep a statement only when it is current, owned by this design document, and useful for preventing an inconsistent screen or interaction.

Remove or replace:

- Invalid, unproven, stale, or duplicated design rules.
- Phase, sequence, delivery-status, implementation-order, migration, and historical comparison language.
- Technical package, data-access, API-shape, and visual-style rules better owned by their governing documents.
- Exhaustive screen, route, component, control, field, or endpoint inventories when a durable design rule states the same consequence.
- Implementation narration and generic testing prose.

Preserve explicit exceptions, disabled states, accessibility behavior, keyboard semantics, feedback rules, and cross-screen consistency requirements when they remain current and consequential. Keep useful unimplemented direction only in the clearly separate `Future` section; state what experience may exist without saying how, when, or in what order it will be implemented.

Keep the document concise, theme-agnostic, evergreen, and structured around design decisions rather than implementation artifacts. Prefer links to owning architecture, semantics, theme, and API documents over duplicated rules. Do not record audit evidence or reasoning in the target document. Leave it unchanged when no evidence-backed improvement exists or the only findings are stylistic.
